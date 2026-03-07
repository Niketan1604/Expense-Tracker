import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS } from '../../shared/constants';
import { parseQueryParams, monthSchema } from '../../shared/validation';
import { createLogger } from '../../shared/logger';
import { budgetKey } from '../model';

const logger = createLogger('deleteBudget');

// =========================================================
// DELETE /budgets/{categoryId}?month=yyyy-mm
//
// month is a required query param — not a path param.
// This keeps the URL clean and avoids slash encoding issues
// with the yyyy-mm format in paths.
// =========================================================

const queryParamsSchema = z.object({
    month: monthSchema
});

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const categoryId = event.pathParameters?.categoryId;
        if (!categoryId) return error(STATUS.BAD_REQUEST, 'categoryId is required');

        const params = parseQueryParams(event.queryStringParameters, queryParamsSchema);
        if ('statusCode' in params) return params;

        const { month } = params;

        await docClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: budgetKey(userId, month, categoryId),
            ConditionExpression: 'attribute_exists(PK)'
        }));

        logger.info('Budget deleted', { userId, categoryId, month });
        return response({ categoryId, month, deleted: true });

    } catch (err: unknown) {
        if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
            return error(STATUS.NOT_FOUND, 'Budget not found');
        }
        logger.error('Failed to delete budget', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to delete budget');
    }
};