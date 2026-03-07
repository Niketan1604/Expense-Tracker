import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS } from '../../shared/constants';
import { createLogger } from '../../shared/logger';
import { categoryKey } from '../model';

const logger = createLogger('deleteCategory');

// =========================================================
// DELETE /categories/{categoryId}
//
// Guards against deletion if active transactions exist
// for this category. This prevents orphaned transactions
// with a categoryId that no longer resolves to anything.
//
// Flow:
//   1. Check GSI1 for any transactions with this categoryId
//   2. If any exist → 409 Conflict
//   3. If none → delete the category item
// =========================================================

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const categoryId = event.pathParameters?.categoryId;
        if (!categoryId) return error(STATUS.BAD_REQUEST, 'categoryId is required');

        // Step 1 — check for active transactions using GSI1
        const txnCheck = await docClient.send(new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :gsi1pk',
            ExpressionAttributeValues: {
                ':gsi1pk': `USER#${userId}#CAT#${categoryId}`
            },
            // Only need to know if any exist — limit to 1 for efficiency
            Limit: 1,
            Select: 'COUNT'
        }));

        if ((txnCheck.Count ?? 0) > 0) {
            return error(
                STATUS.CONFLICT,
                'Cannot delete category — active transactions exist. Reassign or delete them first.'
            );
        }

        // Step 2 — delete the category
        await docClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: categoryKey(userId, categoryId),
            ConditionExpression: 'attribute_exists(PK)'
        }));

        logger.info('Category deleted', { userId, categoryId });
        return response({ categoryId, deleted: true });

    } catch (err: unknown) {
        if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
            return error(STATUS.NOT_FOUND, 'Category not found');
        }
        logger.error('Failed to delete category', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to delete category');
    }
};