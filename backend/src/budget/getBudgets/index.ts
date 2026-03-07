import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS, stripKeys } from '../../shared/constants';
import { parseQueryParams, monthSchema } from '../../shared/validation';
import { createLogger } from '../../shared/logger';
import { budgetPK } from '../model';

const logger = createLogger('getBudgets');

// =========================================================
// GET /budgets
//
// Query string parameters:
//   month — yyyy-mm (optional) filter to a specific month
//
// Without month — returns all budgets for the user.
// With month    — returns budgets for that month only.
// =========================================================

const queryParamsSchema = z.object({
    month: monthSchema.optional()
});

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const params = parseQueryParams(event.queryStringParameters, queryParamsSchema);
        if ('statusCode' in params) return params;

        const { month } = params;

        // SK prefix: BUDGET#yyyy#mm# narrows to a month
        // BUDGET# returns all budgets
        const skPrefix = month
            ? `BUDGET#${month.replace('-', '#')}#`
            : 'BUDGET#';

        const result = await docClient.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
            ExpressionAttributeValues: {
                ':pk': budgetPK(userId),
                ':prefix': skPrefix
            }
        }));

        const budgets = (result.Items ?? []).map(item =>
            stripKeys(item as Record<string, unknown>)
        );

        logger.info('Budgets retrieved', { userId, count: budgets.length, month });
        return response(budgets);

    } catch (err) {
        logger.error('Failed to get budgets', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to retrieve budgets');
    }
};