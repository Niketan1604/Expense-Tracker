import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import xss from 'xss';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS } from '../../shared/constants';
import { parseBody } from '../../shared/validation';
import { createLogger } from '../../shared/logger';
import { updateCategorySchema, categoryKey } from '../model';

const logger = createLogger('updateCategory');

// =========================================================
// PUT /categories/{categoryId}
//
// Partial update — only provided fields are changed.
// Uses UpdateExpression SET — never replaces the whole item.
// ConditionExpression guards against updating non-existent item.
// =========================================================

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const categoryId = event.pathParameters?.categoryId;
        if (!categoryId) return error(STATUS.BAD_REQUEST, 'categoryId is required');

        const sanitizedBody = event.body ? xss(event.body) : event.body;
        const body = parseBody(sanitizedBody, updateCategorySchema);
        if ('statusCode' in body) return body;

        const now = new Date().toISOString();

        // Build SET expression dynamically — only update provided fields
        const setExpressions: string[] = ['updatedAt = :now'];
        const expressionValues: Record<string, unknown> = { ':now': now };
        const expressionNames: Record<string, string> = {};

        if (body.name !== undefined) {
            setExpressions.push('#name = :name');
            expressionNames['#name'] = 'name';    // name is a reserved word in DynamoDB
            expressionValues[':name'] = body.name.trim();
        }
        if (body.icon !== undefined) {
            setExpressions.push('icon = :icon');
            expressionValues[':icon'] = body.icon;
        }
        if (body.color !== undefined) {
            setExpressions.push('color = :color');
            expressionValues[':color'] = body.color;
        }

        const result = await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: categoryKey(userId, categoryId),
            UpdateExpression: `SET ${setExpressions.join(', ')}`,
            ExpressionAttributeValues: expressionValues,
            ...(Object.keys(expressionNames).length > 0 && {
                ExpressionAttributeNames: expressionNames
            }),
            ConditionExpression: 'attribute_exists(PK)',
            ReturnValues: 'ALL_NEW'
        }));

        const { PK: _PK, SK: _SK, ...category } = result.Attributes as Record<string, unknown>;

        logger.info('Category updated', { userId, categoryId });
        return response(category);

    } catch (err: unknown) {
        if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
            return error(STATUS.NOT_FOUND, 'Category not found');
        }
        logger.error('Failed to update category', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to update category');
    }
};