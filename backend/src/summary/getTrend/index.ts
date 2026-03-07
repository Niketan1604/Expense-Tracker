import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../../shared/db';
import { getUserId } from '../../shared/auth';
import { response, error, STATUS } from '../../shared/constants';
import { parseQueryParams } from '../../shared/validation';
import { createLogger } from '../../shared/logger';
import { summaryPK, monthlyTotalSK, computeSavingsRate, trendQuerySchema } from '../model';

const logger = createLogger('getTrend');

// =========================================================
// GET /summary/trend?months=6
//
// Returns MonthlyTotal for the last N months (default 6, max 12).
// Uses BatchGetItem — N RCUs in a single round trip.
//
// Months are generated going backwards from current month.
// Missing months (no transactions) return zeroed data so the
// frontend chart always has a complete series.
// =========================================================

// Generate N months going backwards from a given month (yyyy-mm)
const getPreviousMonths = (fromMonth: string, count: number): string[] => {
    const months: string[] = [];
    const [year, month] = fromMonth.split('-').map(Number);
    for (let i = 0; i < count; i++) {
        const d = new Date(year, month - 1 - i, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        months.push(`${y}-${m}`);
    }
    return months.reverse(); // oldest first for charting
};

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        const userId = getUserId(event);
        if (!userId) return error(STATUS.UNAUTHORIZED, 'Unauthorized');

        const params = parseQueryParams(event.queryStringParameters, trendQuerySchema);
        if ('statusCode' in params) return params;

        const { months: monthCount } = params;

        // Current month as starting point
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthList = getPreviousMonths(currentMonth, monthCount);

        const pk = summaryPK(userId);

        // BatchGet all MonthlyTotal items in one round trip
        const batchResult = await docClient.send(new BatchGetCommand({
            RequestItems: {
                [TABLE_NAME]: {
                    Keys: monthList.map(month => ({
                        PK: pk,
                        SK: monthlyTotalSK(month)
                    }))
                }
            }
        }));

        // Index results by month for easy lookup
        const resultMap = new Map<string, Record<string, unknown>>();
        const items = batchResult.Responses?.[TABLE_NAME] ?? [];
        for (const item of items) {
            // Extract month from SK: SUMMARY#yyyy#mm#ALL
            const skParts = (item.SK as string).split('#');
            const month = `${skParts[1]}-${skParts[2]}`;
            resultMap.set(month, item);
        }

        // Build ordered trend array — fill missing months with zeros
        const trend = monthList.map(month => {
            const item = resultMap.get(month);
            if (!item) {
                return {
                    month,
                    totalCredit: 0,
                    totalDebit: 0,
                    netBalance: 0,
                    savingsRate: 0,
                    txnCount: 0
                };
            }
            const { totalCredit, totalDebit, netBalance, txnCount } = item as {
                totalCredit: number; totalDebit: number;
                netBalance: number; txnCount: number;
            };
            return {
                month,
                totalCredit,
                totalDebit,
                netBalance,
                savingsRate: computeSavingsRate(netBalance, totalCredit),
                txnCount
            };
        });

        logger.info('Trend retrieved', { userId, months: monthCount });
        return response({ months: monthCount, trend });

    } catch (err) {
        logger.error('Failed to get trend', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Failed to retrieve trend');
    }
};