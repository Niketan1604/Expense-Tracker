import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import xss from 'xss';
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
// All writes are in one TransactWrite — fully atomic.
// =========================================================

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const txnId = event.pathParameters?.txnId;
        if (!txnId) return error(STATUS.BAD_REQUEST, 'txnId is required');

        const sanitizedBody = event.body ? xss(event.body) : event.body;
        const body = parseBody(sanitizedBody, updateTransactionSchema);
        if ('statusCode' in body) return body;

        // Fetch existing transaction
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
        const newDescription = body.description !== undefined
            ? body.description
            : existing.description as string | undefined;

        const now = new Date().toISOString();
        const newSK = transactionSK(newDate, txnId);

        // Old contribution
        const oldCredit = oldType === 'CREDIT' ? oldAmount : 0;
        const oldDebit = oldType === 'DEBIT' ? oldAmount : 0;
        const oldNet = oldCredit - oldDebit;

        // New contribution
        const newCredit = newType === 'CREDIT' ? newAmount : 0;
        const newDebit = newType === 'DEBIT' ? newAmount : 0;
        const newNet = newCredit - newDebit;

        // Diff (for same-category same-month updates)
        const creditDiff = newCredit - oldCredit;
        const debitDiff = newDebit - oldDebit;
        const netDiff = newNet - oldNet;

        const oldYM = getYearMonth(oldDate);
        const newYM = getYearMonth(newDate);
        const dateChanged = oldDate !== newDate;
        const catChanged = oldCategoryId !== newCategoryId;

        // Build transact items array
        const items: object[] = [];

        // Transaction item update
        if (dateChanged) {
            items.push({
                Delete: {
                    TableName: TABLE_NAME, Key: { PK, SK: oldSK },
                    ConditionExpression: 'attribute_exists(PK)'
                }
            });
            items.push({
                Put: {
                    TableName: TABLE_NAME, Item: {
                        PK, SK: newSK,
                        GSI1PK: gsi1PK(userId, newCategoryId), GSI1SK: newSK,
                        GSI2PK: gsi2PK(userId, newType),
                        transactionId: txnId, userId,
                        type: newType, amount: newAmount, categoryId: newCategoryId,
                        description: newDescription, date: newDate, createdAt, updatedAt: now
                    }
                }
            });
        } else {
            items.push({
                Update: {
                    TableName: TABLE_NAME, Key: { PK, SK: oldSK },
                    UpdateExpression: 'SET #type=:type, amount=:amount, categoryId=:catId, description=:desc, GSI1PK=:g1pk, GSI1SK=:g1sk, GSI2PK=:g2pk, updatedAt=:now',
                    ExpressionAttributeNames: { '#type': 'type' },
                    ExpressionAttributeValues: {
                        ':type': newType, ':amount': newAmount, ':catId': newCategoryId,
                        ':desc': newDescription, ':g1pk': gsi1PK(userId, newCategoryId),
                        ':g1sk': newSK, ':g2pk': gsi2PK(userId, newType), ':now': now
                    },
                    ConditionExpression: 'attribute_exists(PK)'
                }
            });
        }

        // Category summary updates
        if (catChanged || dateChanged) {
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
            items.push({
                Update: {
                    TableName: TABLE_NAME,
                    Key: { PK, SK: summarySK(newYM.year, newYM.month, newCategoryId) },
                    UpdateExpression: 'ADD totalCredit :c, totalDebit :d, netBalance :n SET updatedAt=:now',
                    ExpressionAttributeValues: { ':c': creditDiff, ':d': debitDiff, ':n': netDiff, ':now': now }
                }
            });
        }

        // Monthly total updates
        if (dateChanged) {
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