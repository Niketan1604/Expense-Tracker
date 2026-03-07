import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import xss from 'xss';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, created, error, STATUS } from '../../shared/constants';
import { parseBody } from '../../shared/validation';
import { createLogger } from '../../shared/logger';
import { createBudgetSchema, budgetPK, budgetSK, budgetKey, Budget } from '../model';

const logger = createLogger('setBudget');

// =========================================================
// POST /budgets — upsert
//
// Creates or replaces a budget for a user+category+month.
// We use upsert (not separate POST/PUT) because a budget is
// naturally identified by category+month — there's no
// separate ID to PUT to. Simpler API surface.
//
// Returns 201 if new, 200 if updated.
// createdAt is preserved on update.
// =========================================================

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const sanitizedBody = event.body ? xss(event.body) : event.body;
        const body = parseBody(sanitizedBody, createBudgetSchema);
        if ('statusCode' in body) return body;

        const { categoryId, month, amount } = body;
        const now = new Date().toISOString();

        // Check if budget already exists to preserve createdAt
        const existing = await docClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: budgetKey(userId, month, categoryId),
            ProjectionExpression: 'createdAt'
        }));

        const isNew = !existing.Item;
        const createdAt = existing.Item?.createdAt ?? now;

        const item = {
            PK: budgetPK(userId),
            SK: budgetSK(month, categoryId),
            userId,
            categoryId,
            month,
            amount,
            createdAt,
            updatedAt: now
        };

        await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: item
        }));

        const { PK: _PK, SK: _SK, ...budget } = item;

        logger.info(isNew ? 'Budget created' : 'Budget updated', { userId, categoryId, month, amount });
        return isNew ? created(budget as Budget) : response(budget as Budget);

    } catch (err) {
        logger.error('Failed to set budget', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to set budget');
    }
};