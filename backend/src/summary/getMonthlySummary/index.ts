import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS } from '../../shared/constants';
import { parseQueryParams } from '../../shared/validation';
import { createLogger } from '../../shared/logger';
import {
    summaryPK,
    monthlyTotalSK,
    computeSavingsRate,
    summaryQuerySchema,
    MonthlyTotal
} from '../model';

const logger = createLogger('getMonthlySummary');

// =========================================================
// GET /summary?month=yyyy-mm
//
// Returns the MonthlyTotal for the given month.
// Single GetItem — 1 RCU. Pre-computed on every transaction write.
//
// savingsRate is recomputed here from stored values to ensure
// it's always accurate even if the stored value is stale.
// =========================================================

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const params = parseQueryParams(event.queryStringParameters, summaryQuerySchema);
        if ('statusCode' in params) return params;

        const { month } = params;

        const result = await docClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                PK: summaryPK(userId),
                SK: monthlyTotalSK(month)
            }
        }));

        // No transactions this month yet — return zeroed summary
        if (!result.Item) {
            const empty: MonthlyTotal = {
                userId,
                month,
                totalCredit: 0,
                totalDebit: 0,
                netBalance: 0,
                savingsRate: 0,
                txnCount: 0,
                updatedAt: new Date().toISOString()
            };
            return response(empty);
        }

        const { PK: _PK, SK: _SK, totalCredit, totalDebit, netBalance, txnCount, updatedAt } =
            result.Item as Record<string, unknown> & {
                totalCredit: number; totalDebit: number;
                netBalance: number; txnCount: number; updatedAt: string;
            };

        const summary: MonthlyTotal = {
            userId,
            month,
            totalCredit,
            totalDebit,
            netBalance,
            savingsRate: computeSavingsRate(netBalance, totalCredit),
            txnCount,
            updatedAt
        };

        logger.info('Monthly summary retrieved', { userId, month });
        return response(summary);

    } catch (err) {
        logger.error('Failed to get monthly summary', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to retrieve monthly summary');
    }
};