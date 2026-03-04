import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS } from '../../shared/constants';
import { createLogger } from '../../shared/logger';
import {
    transactionPK,
    summarySK,
    monthlyTotalSK,
    getYearMonth,
    TransactionType
} from '../model';

const logger = createLogger('deleteTransaction');

// =========================================================
// DELETE /transactions/{txnId}
//
// 1. Find the transaction by txnId (Query + filter)
//    We need the SK for the Delete operation, and we need
//    amount/type/date/categoryId to reverse the summaries.
//
// 2. TransactWrite:
//    a. Delete transaction item (with condition check)
//    b. Reverse MonthlySummary (ADD negative deltas)
//    c. Reverse MonthlyTotal   (ADD negative deltas)
// =========================================================

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const txnId = event.pathParameters?.txnId;
        if (!txnId) return error(STATUS.BAD_REQUEST, 'txnId is required');

        // Step 1 — find transaction to get SK + data needed for reversal
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

        const item = result.Items?.[0];
        if (!item) return error(STATUS.NOT_FOUND, 'Transaction not found');

        const { PK, SK, amount, type, date, categoryId } = item as {
            PK: string; SK: string;
            amount: number; type: TransactionType;
            date: string; categoryId: string;
        };

        const { year, month } = getYearMonth(date);
        const now = new Date().toISOString();

        // Negate what was originally added to summaries
        const creditDelta = type === 'CREDIT' ? -amount : 0;
        const debitDelta = type === 'DEBIT' ? -amount : 0;
        const netDelta = creditDelta - debitDelta;

        // Step 2 — atomic delete + summary reversal
        await docClient.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Delete: {
                        TableName: TABLE_NAME,
                        Key: { PK, SK },
                        ConditionExpression: 'attribute_exists(PK)'
                    }
                },
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK, SK: summarySK(year, month, categoryId) },
                        UpdateExpression: 'ADD totalCredit :cd, totalDebit :dd, netBalance :nd, txnCount :neg SET updatedAt = :now',
                        ExpressionAttributeValues: {
                            ':cd': creditDelta,
                            ':dd': debitDelta,
                            ':nd': netDelta,
                            ':neg': -1,
                            ':now': now
                        }
                    }
                },
                {
                    Update: {
                        TableName: TABLE_NAME,
                        Key: { PK, SK: monthlyTotalSK(year, month) },
                        UpdateExpression: 'ADD totalCredit :cd, totalDebit :dd, netBalance :nd, txnCount :neg SET updatedAt = :now',
                        ExpressionAttributeValues: {
                            ':cd': creditDelta,
                            ':dd': debitDelta,
                            ':nd': netDelta,
                            ':neg': -1,
                            ':now': now
                        }
                    }
                }
            ]
        }));

        logger.info('Transaction deleted', { userId, txnId, type, amount });
        return response({ transactionId: txnId, deleted: true });

    } catch (err) {
        logger.error('Failed to delete transaction', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to delete transaction');
    }
};