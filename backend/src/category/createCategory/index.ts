import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import xss from 'xss';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { created, error, STATUS } from '../../shared/constants';
import { parseBody } from '../../shared/validation';
import { createLogger } from '../../shared/logger';
import {
    createCategorySchema,
    categoryPK,
    categorySK,
    generateCategoryId,
    Category
} from '../model';

const logger = createLogger('createCategory');

// =========================================================
// POST /categories
//
// Creates a new category for the authenticated user.
// categoryId is generated server-side — never from client.
// =========================================================

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const sanitizedBody = event.body ? xss(event.body) : event.body;
        const body = parseBody(sanitizedBody, createCategorySchema);
        if ('statusCode' in body) return body;

        const categoryId = generateCategoryId();
        const now = new Date().toISOString();

        const item = {
            PK: categoryPK(userId),
            SK: categorySK(categoryId),
            categoryId,
            userId,
            name: body.name.trim(),
            icon: body.icon,
            color: body.color,
            createdAt: now,
            updatedAt: now
        };

        await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: item,
            // Guard — categoryId is a UUID so collision is practically impossible
            // but we add the condition for correctness
            ConditionExpression: 'attribute_not_exists(PK)'
        }));

        const { PK: _PK, SK: _SK, ...category } = item;

        logger.info('Category created', { userId, categoryId });
        return created(category as Category);

    } catch (err) {
        logger.error('Failed to create category', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to create category');
    }
};