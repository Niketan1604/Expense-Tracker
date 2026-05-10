import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS } from '../../shared/constants';
import { parseBody } from '../../shared/validation';
import { createLogger } from '../../shared/logger';
import {
    updateTransactionSchema,
    transactionPK,
    transactionSK,
    gsi1PK,
    gsi2PK,
    summarySK,
    monthlyTotalSK,
    getYearMonth,
    Transaction,
    TransactionType
} from '../model';

const logger = createLogger('updateTransaction');

// =========================================================
// PUT /transactions/{txnId}
//
// Handles all change combinations:
//   - amount/type change     → diff applied to same summary
//   - categoryId change      → reverse old category, apply new
//   - date change            → SK changes (Delete+Put), reverse
//                              old month summary, apply new month
//
// Fixes applied vs original:
//   1. description=undefined excluded from ExpressionAttributeValues
//      DDB rejects an UpdateExpression referencing :desc when it has
//      no binding in ExpressionAttributeValues.
//   2. Same-month date change (e.g. Jun-01 → Jun-15) with same category
//      must NOT use reverse+apply on the identical summary key —
//      TransactWrite rejects two operations on the same item.
//      Instead treat it as a plain diff update (like amount-only change).
// =========================================================

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const txnId = event.pathParameters?.txnId;
        if (!txnId) return error(STATUS.BAD_REQUEST, 'txnId is required');

        const body = parseBody(event.body, updateTransactionSchema);
        if ('statusCode' in body) return body;

        // Fetch existing transaction by scanning TXN# SK space
        const result = await docClient.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
            FilterExpression: 'transactionId = :txnId',
            ExpressionAttributeValues: {
                ':pk': transactionPK(userId),
                ':skPrefix': 'TXN#',
                ':txnId': txnId
            }
        }));

        const existing = result.Items?.[0];
        if (!existing) return error(STATUS.NOT_FOUND, 'Transaction not found');

        const { PK, SK: oldSK, amount: oldAmount, type: oldType,
            date: oldDate, categoryId: oldCategoryId, createdAt } = existing as {
                PK: string; SK: string; amount: number; type: TransactionType;
                date: string; categoryId: string; createdAt: string;
            };

        const newType = body.type ?? oldType;
        const newAmount = body.amount ?? oldAmount;
        const newDate = body.date ?? oldDate;
        const newCategoryId = body.categoryId ?? oldCategoryId;

        // FIX 1: Only carry description forward when it has a value.
        // undefined must never appear in ExpressionAttributeValues.
        const newDescription: string | undefined = body.description !== undefined
            ? body.description
            : (existing.description as string | undefined);

        const now = new Date().toISOString();
        const newSK = transactionSK(newDate, txnId);

        // Old contribution vectors
        const oldCredit = oldType === 'CREDIT' ? oldAmount : 0;
        const oldDebit = oldType === 'DEBIT' ? oldAmount : 0;
        const oldNet = oldCredit - oldDebit;

        // New contribution vectors
        const newCredit = newType === 'CREDIT' ? newAmount : 0;
        const newDebit = newType === 'DEBIT' ? newAmount : 0;
        const newNet = newCredit - newDebit;

        // Diffs (used for same-bucket updates)
        const creditDiff = newCredit - oldCredit;
        const debitDiff = newDebit - oldDebit;
        const netDiff = newNet - oldNet;

        const oldYM = getYearMonth(oldDate);
        const newYM = getYearMonth(newDate);
        const dateChanged = oldDate !== newDate;
        const catChanged = oldCategoryId !== newCategoryId;

        // FIX 2: same-month date change with same category
        // oldYM === newYM means both summary keys are identical —
        // a reverse+apply would be two ops on the same DDB item.
        const sameMonthDateChange = dateChanged && !catChanged
            && oldYM.year === newYM.year && oldYM.month === newYM.month;

        const items: object[] = [];

        // ── Transaction item ─────────────────────────────────────────

        if (dateChanged) {
            // Delete old SK, Put new SK atomically
            items.push({
                Delete: {
                    TableName: TABLE_NAME,
                    Key: { PK, SK: oldSK },
                    ConditionExpression: 'attribute_exists(PK)'
                }
            });
            // FIX 1: spread description only when defined
            items.push({
                Put: {
                    TableName: TABLE_NAME,
                    Item: {
                        PK, SK: newSK,
                        GSI1PK: gsi1PK(userId, newCategoryId), GSI1SK: newSK,
                        GSI2PK: gsi2PK(userId, newType),
                        transactionId: txnId, userId,
                        type: newType, amount: newAmount, categoryId: newCategoryId,
                        ...(newDescription !== undefined ? { description: newDescription } : {}),
                        date: newDate, createdAt, updatedAt: now
                    }
                }
            });
        } else {
            // FIX 1: build UpdateExpression and ExpressionAttributeValues
            // without :desc unless description is actually defined
            const setParts = [
                '#type=:type',
                'amount=:amount',
                'categoryId=:catId',
                'GSI1PK=:g1pk',
                'GSI1SK=:g1sk',
                'GSI2PK=:g2pk',
                'updatedAt=:now'
            ];
            const exprValues: Record<string, unknown> = {
                ':type': newType,
                ':amount': newAmount,
                ':catId': newCategoryId,
                ':g1pk': gsi1PK(userId, newCategoryId),
                ':g1sk': newSK,
                ':g2pk': gsi2PK(userId, newType),
                ':now': now
            };
            if (newDescription !== undefined) {
                setParts.push('description=:desc');
                exprValues[':desc'] = newDescription;
            }
            items.push({
                Update: {
                    TableName: TABLE_NAME,
                    Key: { PK, SK: oldSK },
                    UpdateExpression: `SET ${setParts.join(', ')}`,
                    ExpressionAttributeNames: { '#type': 'type' },
                    ExpressionAttributeValues: exprValues,
                    ConditionExpression: 'attribute_exists(PK)'
                }
            });
        }

        // ── Category summary updates ─────────────────────────────────

        if (sameMonthDateChange) {
            // Same bucket (PK+SK identical for old and new) — only diff
            if (creditDiff !== 0 || debitDiff !== 0) {
                items.push({
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK, SK: summarySK(newYM.year, newYM.month, newCategoryId) },
                        UpdateExpression: 'ADD totalCredit :c, totalDebit :d, netBalance :n SET updatedAt=:now',
                        ExpressionAttributeValues: { ':c': creditDiff, ':d': debitDiff, ':n': netDiff, ':now': now }
                    }
                });
            }
        } else if (catChanged || dateChanged) {
            // Cross-category or cross-month — reverse old, apply new
            items.push({
                Update: {
                    TableName: TABLE_NAME,
                    Key: { PK, SK: summarySK(oldYM.year, oldYM.month, oldCategoryId) },
                    UpdateExpression: 'ADD totalCredit :rc, totalDebit :rd, netBalance :rn, txnCount :neg SET updatedAt=:now',
                    ExpressionAttributeValues: { ':rc': -oldCredit, ':rd': -oldDebit, ':rn': -oldNet, ':neg': -1, ':now': now }
                }
            });
            items.push({
                Update: {
                    TableName: TABLE_NAME,
                    Key: { PK, SK: summarySK(newYM.year, newYM.month, newCategoryId) },
                    UpdateExpression: 'ADD totalCredit :c, totalDebit :d, netBalance :n, txnCount :one SET updatedAt=:now, categoryId=if_not_exists(categoryId,:catId), userId=if_not_exists(userId,:userId)',
                    ExpressionAttributeValues: { ':c': newCredit, ':d': newDebit, ':n': newNet, ':one': 1, ':now': now, ':catId': newCategoryId, ':userId': userId }
                }
            });
        } else if (creditDiff !== 0 || debitDiff !== 0) {
            // Same category, same month, amounts changed
            items.push({
                Update: {
                    TableName: TABLE_NAME,
                    Key: { PK, SK: summarySK(newYM.year, newYM.month, newCategoryId) },
                    UpdateExpression: 'ADD totalCredit :c, totalDebit :d, netBalance :n SET updatedAt=:now',
                    ExpressionAttributeValues: { ':c': creditDiff, ':d': debitDiff, ':n': netDiff, ':now': now }
                }
            });
        }

        // ── Monthly total updates ────────────────────────────────────

        if (dateChanged && !sameMonthDateChange) {
            // Cross-month: reverse old total, apply to new month total
            items.push({
                Update: {
                    TableName: TABLE_NAME,
                    Key: { PK, SK: monthlyTotalSK(oldYM.year, oldYM.month) },
                    UpdateExpression: 'ADD totalCredit :rc, totalDebit :rd, netBalance :rn, txnCount :neg SET updatedAt=:now',
                    ExpressionAttributeValues: { ':rc': -oldCredit, ':rd': -oldDebit, ':rn': -oldNet, ':neg': -1, ':now': now }
                }
            });
            items.push({
                Update: {
                    TableName: TABLE_NAME,
                    Key: { PK, SK: monthlyTotalSK(newYM.year, newYM.month) },
                    UpdateExpression: 'ADD totalCredit :c, totalDebit :d, netBalance :n, txnCount :one SET updatedAt=:now, userId=if_not_exists(userId,:userId)',
                    ExpressionAttributeValues: { ':c': newCredit, ':d': newDebit, ':n': newNet, ':one': 1, ':now': now, ':userId': userId }
                }
            });
        } else if (creditDiff !== 0 || debitDiff !== 0) {
            // Same month (inc. same-month date change) — apply diff to total
            items.push({
                Update: {
                    TableName: TABLE_NAME,
                    Key: { PK, SK: monthlyTotalSK(newYM.year, newYM.month) },
                    UpdateExpression: 'ADD totalCredit :c, totalDebit :d, netBalance :n SET updatedAt=:now',
                    ExpressionAttributeValues: { ':c': creditDiff, ':d': debitDiff, ':n': netDiff, ':now': now }
                }
            });
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await docClient.send(new TransactWriteCommand({ TransactItems: items as any }));

        const transaction: Transaction = {
            transactionId: txnId, userId,
            type: newType, amount: newAmount, categoryId: newCategoryId,
            description: newDescription, date: newDate, createdAt, updatedAt: now
        };

        logger.info('Transaction updated', { userId, txnId });
        return response(transaction);

    } catch (err) {
        logger.error('Failed to update transaction', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to update transaction');
    }
};