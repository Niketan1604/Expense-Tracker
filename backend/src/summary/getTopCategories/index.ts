import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS } from '../../shared/constants';
import { parseQueryParams, monthSchema, transactionTypeSchema } from '../../shared/validation';
import { createLogger } from '../../shared/logger';
import { summaryPK, MonthlySummary } from '../model';

const logger = createLogger('getTopCategories');

// =========================================================
// GET /summary/top-categories?month=yyyy-mm&type=DEBIT&limit=5
//
// Returns categories ranked by spend (DEBIT) or income (CREDIT).
// Reads MonthlySummary items for the month, sorts in-memory.
//
// type=DEBIT  → ranked by totalDebit  (top spending categories)
// type=CREDIT → ranked by totalCredit (top income categories)
// type not provided → ranked by absolute netBalance impact
//
// limit defaults to 5, max 20.
// =========================================================

const queryParamsSchema = z.object({
    month: monthSchema,
    type: transactionTypeSchema.optional(),
    limit: z.string()
        .optional()
        .transform(v => parseInt(v ?? '5', 10))
        .pipe(z.number().int().min(1).max(20))
});

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const params = parseQueryParams(event.queryStringParameters, queryParamsSchema);
        if ('statusCode' in params) return params;

        const { month, type, limit } = params;
        const [year, mm] = month.split('-');

        // Query all category-level SUMMARY items for the month
        const result = await docClient.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
            FilterExpression: 'SK <> :allSK',
            ExpressionAttributeValues: {
                ':pk': summaryPK(userId),
                ':prefix': `SUMMARY#${year}#${mm}#`,
                ':allSK': `SUMMARY#${year}#${mm}#ALL`
            }
        }));

        const summaries = (result.Items ?? []).map(item => {
            const { PK: _PK, SK: _SK, ...rest } = item as Record<string, unknown>;
            return rest as unknown as MonthlySummary;
        });

        // Sort by the relevant metric
        const sorted = summaries.sort((a, b) => {
            if (type === 'DEBIT') return b.totalDebit - a.totalDebit;
            if (type === 'CREDIT') return b.totalCredit - a.totalCredit;
            // No type — sort by absolute netBalance impact
            return Math.abs(b.netBalance) - Math.abs(a.netBalance);
        });

        const topCategories = sorted.slice(0, limit);

        logger.info('Top categories retrieved', { userId, month, type, count: topCategories.length });
        return response({ month, type: type ?? 'ALL', limit, topCategories });

    } catch (err) {
        logger.error('Failed to get top categories', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to retrieve top categories');
    }
};