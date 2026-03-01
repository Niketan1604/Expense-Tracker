import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../../shared/db';
import { STATUS, response, error } from '../../shared/constants';
import { getUserId, getUserEmail } from '../../shared/auth';
import { createLogger } from '../../shared/logger';
import { UserProfile, userProfileKey } from '../model';
import xss from 'xss';

const logger = createLogger('putUserProfile');

interface PutProfileBody {
    name?: string;
    currency?: string;
    timezone?: string;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
        // Step 0 — sanitize only user-controlled input (body)
        if (event.body) {
            event = { ...event, body: JSON.parse(xss(JSON.stringify(event.body))) };
        }

        // Step 1 — extract userId + email from JWT claims
        const userId = getUserId(event);
        if (!userId) {
            logger.warn('Unauthorized — missing userId in claims');
            return error(STATUS.UNAUTHORIZED, 'Unauthorized');
        }
        const email = getUserEmail(event) ?? '';

        logger.info('Updating user profile', { userId });

        // Step 2 — parse + validate body
        let body: PutProfileBody;
        try {
            body = JSON.parse(event.body ?? '{}');
        } catch {
            logger.warn('Invalid JSON body', { userId });
            return error(STATUS.BAD_REQUEST, 'Invalid JSON body');
        }

        const { name, currency, timezone } = body;

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return error(STATUS.BAD_REQUEST, 'name is required');
        }
        if (!currency || typeof currency !== 'string' || currency.trim() === '') {
            return error(STATUS.BAD_REQUEST, 'currency is required');
        }
        if (!timezone || typeof timezone !== 'string' || timezone.trim() === '') {
            return error(STATUS.BAD_REQUEST, 'timezone is required');
        }

        const now = new Date().toISOString();

        // Step 3 — check if profile exists to preserve createdAt
        // First PUT → createdAt = now
        // Subsequent PUTs → keep original createdAt
        const existing = await docClient.send(
            new GetCommand({
                TableName: TABLE_NAME,
                Key: userProfileKey(userId),
                ProjectionExpression: 'createdAt'
            })
        );
        const createdAt = existing.Item?.createdAt ?? now;

        // Step 4 — build and save profile item
        const profile: UserProfile = {
            ...userProfileKey(userId),
            userId,
            email,
            name: name.trim(),
            currency: currency.trim().toUpperCase(),
            timezone: timezone.trim(),
            createdAt,
            updatedAt: now
        };

        await docClient.send(
            new PutCommand({
                TableName: TABLE_NAME,
                Item: profile
            })
        );

        // Step 5 — return saved profile, strip DynamoDB keys
        const { PK: _PK, SK: _SK, ...profileData } = profile;
        logger.info('User profile updated successfully', { userId });
        return response(profileData);

    } catch (err) {
        logger.error('Failed to update user profile', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Internal server error');
    }
};