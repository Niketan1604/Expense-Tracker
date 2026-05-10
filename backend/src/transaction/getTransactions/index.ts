import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS, stripKeys } from '../../shared/constants';
import { parseQueryParams, monthSchema, transactionTypeSchema } from '../../shared/validation';
import { createLogger } from '../../shared/logger';
import { transactionPK, gsi1PK, gsi2PK } from '../model';

const logger = createLogger('getTransactions');

// =========================================================
// GET /transactions
//
// Query string parameters (all optional):
//   month      — yyyy-mm  filter to a specific month
//   type       — CREDIT | DEBIT
//   categoryId — filter to a specific category
//
// Query strategy:
//   categoryId provided → GSI1
//   type only provided  → GSI2
//   no filter           → Main table (all transactions for user)
//
// month is always applied as SK begins_with regardless of index.
// =========================================================

const queryParamsSchema = z.object({
    month: monthSchema.optional(),
    type: transactionTypeSchema.optional(),
    categoryId: z.string().min(1).optional(),
    limit: z.coerce.number().min(1).max(100).default(50).optional(),
    cursor: z.string().optional()
});

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const params = parseQueryParams(event.queryStringParameters, queryParamsSchema);
        if ('statusCode' in params) return params;

        const { month, type, categoryId, limit, cursor } = params;

        let exclusiveStartKey: Record<string, unknown> | undefined = undefined;
        if (cursor) {
            try {
                exclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
            } catch {
                return error(STATUS.BAD_REQUEST, 'Invalid cursor');
            }
        }

        // TXN#yyyy-mm narrows to a month; TXN# returns all transactions
        const skPrefix = month ? `TXN#${month}` : 'TXN#';
        let items: Record<string, unknown>[] = [];
        let result;

        if (categoryId) {
            // ── GSI1 — query by category ────────────────────────
            result = await docClient.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI1',
                KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :skPrefix)',
                ExpressionAttributeValues: {
                    ':pk': gsi1PK(userId, categoryId),
                    ':skPrefix': skPrefix,
                    ...(type && { ':type': type })
                },
                ...(type && {
                    FilterExpression: '#type = :type',
                    ExpressionAttributeNames: { '#type': 'type' }
                }),
                Limit: limit,
                ExclusiveStartKey: exclusiveStartKey
            }));
            items = result.Items ?? [];

        } else if (type) {
            // ── GSI2 — query by type ────────────────────────────
            result = await docClient.send(new QueryCommand({
                TableName: TABLE_NAME,
                IndexName: 'GSI2',
                KeyConditionExpression: 'GSI2PK = :pk AND begins_with(SK, :skPrefix)',
                ExpressionAttributeValues: {
                    ':pk': gsi2PK(userId, type),
                    ':skPrefix': skPrefix
                },
                Limit: limit,
                ExclusiveStartKey: exclusiveStartKey
            }));
            items = result.Items ?? [];

        } else {
            // ── Main table — all transactions ───────────────────
            result = await docClient.send(new QueryCommand({
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
                ExpressionAttributeValues: {
                    ':pk': transactionPK(userId),
                    ':skPrefix': skPrefix
                },
                Limit: limit,
                ExclusiveStartKey: exclusiveStartKey
            }));
            items = result.Items ?? [];
        }

        const transactions = items.map(stripKeys);
        const nextCursor = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : null;

        logger.info('Transactions retrieved', { userId, count: transactions.length, month, type, categoryId });
        return response({
            items: transactions,
            nextCursor
        });

    } catch (err) {
        logger.error('Failed to get transactions', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to retrieve transactions');
    }
};