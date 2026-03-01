import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../../shared/db';
import { STATUS, response, error } from '../../shared/constants';
import { getUserId } from '../../shared/auth';
import { createLogger } from '../../shared/logger';
import { UserProfile, userProfileKey } from '../model';

const logger = createLogger('getUserProfile');

// =========================================================
// GET /user/profile
//
// Returns the profile of the authenticated user.
//
// Flow:
//   1. Extract userId (sub) from JWT claims
//   2. GetItem from DynamoDB
//   3. 404 if profile doesn't exist yet (user hasn't called PUT)
//   4. 200 with profile — PK/SK stripped from response
//
// GET is read-only — profile is NOT auto-created here.
// User must explicitly call PUT /user/profile to create it.
// =========================================================
export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        // Step 1 — extract userId (sub) from JWT claims
        const userId = getUserId(event);
        if (!userId) {
            logger.warn('Unauthorized — missing userId in claims');
            return error(STATUS.UNAUTHORIZED, 'Unauthorized');
        }

        logger.info('Fetching user profile', { userId });

        // Step 2 — fetch profile from DynamoDB
        const result = await docClient.send(
            new GetCommand({
                TableName: TABLE_NAME,
                Key: userProfileKey(userId)
            })
        );

        // Step 3 — profile not found
        if (!result.Item) {
            logger.warn('User profile not found', { userId });
            return error(STATUS.NOT_FOUND, 'User profile not found');
        }

        // Step 4 — strip internal DynamoDB keys before returning
        const { PK, SK, ...profile } = result.Item as UserProfile;
        logger.info('User profile fetched successfully', { userId });
        return response(profile);

    } catch (err) {
        logger.error('Failed to fetch user profile', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Internal server error');
    }
};