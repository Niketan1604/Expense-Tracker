import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS } from '../../shared/constants';
import { parseQueryParams } from '../../shared/validation';
import { createLogger } from '../../shared/logger';
import { summaryPK, summaryQuerySchema, MonthlySummary } from '../model';

const logger = createLogger('getBreakdown');

// =========================================================
// GET /summary/breakdown?month=yyyy-mm
//
// Returns per-category summary for the given month.
// Query main table: PK = USER#{userId}, SK begins_with SUMMARY#{yyyy}#{mm}#
// Excludes the #ALL item — returns only category-level items.
//
// This is what powers the category breakdown chart in the dashboard.
// =========================================================

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const params = parseQueryParams(event.queryStringParameters, summaryQuerySchema);
        if ('statusCode' in params) return params;

        const { month } = params;
        const [year, mm] = month.split('-');

        const result = await docClient.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
            // Exclude the #ALL item — only want per-category rows
            FilterExpression: 'SK <> :allSK',
            ExpressionAttributeValues: {
                ':pk': summaryPK(userId),
                ':prefix': `SUMMARY#${year}#${mm}#`,
                ':allSK': `SUMMARY#${year}#${mm}#ALL`
            }
        }));

        const breakdown = (result.Items ?? []).map(item => {
            const { PK: _PK, SK: _SK, ...rest } = item as Record<string, unknown>;
            return rest as unknown as MonthlySummary;
        });

        logger.info('Breakdown retrieved', { userId, month, categoryCount: breakdown.length });
        return response({ month, breakdown });

    } catch (err) {
        logger.error('Failed to get breakdown', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to retrieve breakdown');
    }
};