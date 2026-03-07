import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS, stripKeys } from '../../shared/constants';
import { createLogger } from '../../shared/logger';
import { categoryPK } from '../model';

const logger = createLogger('getCategories');

// =========================================================
// GET /categories
//
// Returns all categories for the authenticated user.
// Query main table: PK = USER#{userId}, SK begins_with CATEGORY#
// =========================================================


export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const result = await docClient.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
            ExpressionAttributeValues: {
                ':pk': categoryPK(userId),
                ':prefix': 'CATEGORY#'
            }
        }));

        const categories = (result.Items ?? []).map(item =>
            stripKeys(item as Record<string, unknown>)
        );

        logger.info('Categories retrieved', { userId, count: categories.length });
        return response(categories);

    } catch (err) {
        logger.error('Failed to get categories', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to retrieve categories');
    }
};