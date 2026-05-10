import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { created, error, STATUS } from '../../shared/constants';
import { parseBody } from '../../shared/validation';
import { createLogger } from '../../shared/logger';
import {
    createTransactionSchema,
    transactionPK,
    transactionSK,
    gsi1PK,
    gsi2PK,
    summarySK,
    monthlyTotalSK,
    getYearMonth,
    Transaction
} from '../model';

const logger = createLogger('createTransaction');

// =========================================================
// POST /transactions
//
// Creates a transaction and atomically updates:
//   1. Transaction item (main table)
//   2. MonthlySummary for the category (ADD totalCredit/totalDebit/netBalance/txnCount)
//   3. MonthlyTotal #ALL (ADD same fields across all categories)
//
// All 3 writes succeed or all fail — no partial state.
//
// Amount convention:
//   CREDIT → positive netBalance contribution  (+amount)
//   DEBIT  → negative netBalance contribution  (-amount)
// =========================================================

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    let userId: string | undefined;
    let reqTransactionId: string | undefined;

    try {
        userId = getUserId(event);
        if (!userId) {
            return error(STATUS.UNAUTHORIZED, 'Unauthorized');
        }

        const body = parseBody(event.body, createTransactionSchema);
        if ('statusCode' in body) return body;

        reqTransactionId = body.transactionId;

        const now = new Date().toISOString();
        // UUID v7 — time-sortable, no dependency (Node.js 24.x crypto)
        const transactionId = body.transactionId || crypto.randomUUID();

        const { year, month } = getYearMonth(body.date);

        const pk = transactionPK(userId);
        const sk = transactionSK(body.date, transactionId);

        // netBalance delta: CREDIT adds, DEBIT subtracts
        const creditDelta = body.type === 'CREDIT' ? body.amount : 0;
        const debitDelta = body.type === 'DEBIT' ? body.amount : 0;
        const netDelta = creditDelta - debitDelta;

        await docClient.send(new TransactWriteCommand({
            TransactItems: [

                // ── 1. Transaction item ───────────────────────────
                {
                    Put: {
                        TableName: TABLE_NAME,
                        Item: {
                            PK: pk,
                            SK: sk,
                            GSI1PK: gsi1PK(userId, body.categoryId),
                            GSI1SK: sk,
                            GSI2PK: gsi2PK(userId, body.type),
                            transactionId,
                            userId,
                            type: body.type,
                            amount: body.amount,
                            categoryId: body.categoryId,
                            description: body.description,
                            date: body.date,
                            createdAt: now,
                            updatedAt: now
                        },
                        // Prevent accidental overwrite — transactionId must be unique
                        ConditionExpression: 'attribute_not_exists(PK)'
                    }
                },

                // ── 2. MonthlySummary for this category ───────────
                // ADD atomically — safe for concurrent writes
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: {
                            PK: pk,
                            SK: summarySK(year, month, body.categoryId)
                        },
                        UpdateExpression: `
                            ADD totalCredit :creditDelta,
                                totalDebit  :debitDelta,
                                netBalance  :netDelta,
                                txnCount    :one
                            SET updatedAt   = :now,
                                categoryId  = if_not_exists(categoryId, :categoryId),
                                userId      = if_not_exists(userId, :userId)
                            `,
                        ExpressionAttributeValues: {
                            ':creditDelta': creditDelta,
                            ':debitDelta': debitDelta,
                            ':netDelta': netDelta,
                            ':one': 1,
                            ':now': now,
                            ':categoryId': body.categoryId,
                            ':userId': userId
                        }
                    }
                },

                // ── 3. MonthlyTotal across all categories ─────────
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: {
                            PK: pk,
                            SK: monthlyTotalSK(year, month)
                        },
                        UpdateExpression: `
                            ADD totalCredit :creditDelta,
                                totalDebit  :debitDelta,
                                netBalance  :netDelta,
                                txnCount    :one
                            SET updatedAt = :now,
                                userId    = if_not_exists(userId, :userId)
                            `,
                        ExpressionAttributeValues: {
                            ':creditDelta': creditDelta,
                            ':debitDelta': debitDelta,
                            ':netDelta': netDelta,
                            ':one': 1,
                            ':now': now,
                            ':userId': userId
                        }
                    }
                }

            ]
        }));

        // Build response — strip PK/SK/GSI keys, return clean Transaction
        const transaction: Transaction = {
            transactionId,
            userId,
            type: body.type,
            amount: body.amount,
            categoryId: body.categoryId,
            description: body.description,
            date: body.date,
            createdAt: now,
            updatedAt: now
        };

        logger.info('Transaction created', { userId, transactionId, type: body.type, amount: body.amount });

        return created(transaction);

    } catch (err: unknown) {
        if ((err as { name?: string }).name === 'TransactionCanceledException') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const cancellationReasons = (err as any).CancellationReasons || [];
            if (cancellationReasons[0]?.Code === 'ConditionalCheckFailed') {
                logger.info('Idempotent request: transaction already exists', { userId, transactionId: reqTransactionId });
                return error(STATUS.CONFLICT, 'Transaction already exists');
            }
        }
        logger.error('Failed to create transaction', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to create transaction');
    }
};