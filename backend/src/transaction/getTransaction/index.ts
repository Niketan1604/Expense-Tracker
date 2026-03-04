import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS, stripKeys } from '../../shared/constants';
import { createLogger } from '../../shared/logger';
import { transactionPK, Transaction } from '../model';

const logger = createLogger('getTransaction');

// =========================================================
// GET /transactions/{txnId}
//
// We don't store txnId → date mapping anywhere, so we can't
// do a direct GetItem (we need both PK and SK, and SK contains
// the date). Instead we Query main table with:
//   PK = USER#{userId}
//   SK begins_with TXN#
//   FilterExpression: transactionId = :txnId
//
// This is a small scan within the user's partition only.
// For a personal finance app this is perfectly acceptable —
// a user will never have more than a few thousand transactions.
// =========================================================

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const txnId = event.pathParameters?.txnId;
        if (!txnId) return error(STATUS.BAD_REQUEST, 'txnId is required');

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
        if (!item) {
            return error(STATUS.NOT_FOUND, 'Transaction not found');
        }

        // Strip DynamoDB keys
        const transaction = stripKeys(item);

        logger.info('Transaction retrieved', { userId, txnId });
        return response(transaction as Transaction);

    } catch (err) {
        logger.error('Failed to get transaction', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to retrieve transaction');
    }
};