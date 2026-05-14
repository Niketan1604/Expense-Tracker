import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLE_NAME } from '../../shared/db';
import { STATUS, response, error } from '../../shared/constants';
import { getUserId, getUserEmail } from '../../shared/auth';
import { createLogger } from '../../shared/logger';
import { UserProfile, userProfileKey } from '../model';
import { categoryPK, categorySK, generateCategoryId } from '../../category/model';

const logger = createLogger('putUserProfile');

// ─────────────────────────────────────────────────────────────────────────────
// Default categories seeded for every new user on first profile creation.
// Users can rename, delete, or add more later from the Categories page.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
    { name: 'Food & Dining',   icon: '🍔', color: '#f43f5e' },
    { name: 'Transport',       icon: '🚗', color: '#3b82f6' },
    { name: 'Housing & Rent',  icon: '🏠', color: '#6366f1' },
    { name: 'Health',          icon: '💊', color: '#14b8a6' },
    { name: 'Shopping',        icon: '🛒', color: '#f59e0b' },
    { name: 'Entertainment',   icon: '🎬', color: '#ec4899' },
    { name: 'Education',       icon: '📚', color: '#8b5cf6' },
    { name: 'Salary & Income', icon: '💰', color: '#10b77f' },
];

interface PutProfileBody {
    name?: string;
    currency?: string;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {

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

        const { name, currency } = body;

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return error(STATUS.BAD_REQUEST, 'name is required');
        }
        if (!currency || typeof currency !== 'string' || currency.trim() === '') {
            return error(STATUS.BAD_REQUEST, 'currency is required');
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
        const isNewUser = !existing.Item;
        const createdAt = existing.Item?.createdAt ?? now;

        // Step 4 — build and save profile item
        const profile: UserProfile = {
            ...userProfileKey(userId),
            userId,
            email,
            name: name.trim(),
            currency: currency.trim().toUpperCase(),
            createdAt,
            updatedAt: now
        };

        await docClient.send(
            new PutCommand({
                TableName: TABLE_NAME,
                Item: profile
            })
        );

        // Step 5 — seed default categories for brand-new users
        // BatchWrite supports up to 25 items per call (we have 8, well within limit).
        // This is fire-and-forget — category seeding failure should never block
        // the profile response, so we catch and log errors independently.
        if (isNewUser) {
            try {
                const categoryItems = DEFAULT_CATEGORIES.map(cat => {
                    const categoryId = generateCategoryId();
                    return {
                        PutRequest: {
                            Item: {
                                PK: categoryPK(userId),
                                SK: categorySK(categoryId),
                                categoryId,
                                userId,
                                name: cat.name,
                                icon: cat.icon,
                                color: cat.color,
                                createdAt: now,
                                updatedAt: now,
                            }
                        }
                    };
                });

                await docClient.send(new BatchWriteCommand({
                    RequestItems: {
                        [TABLE_NAME]: categoryItems
                    }
                }));

                logger.info('Default categories seeded', { userId, count: categoryItems.length });
            } catch (seedErr) {
                // Non-fatal — user can still create categories manually
                logger.error('Failed to seed default categories', { userId, error: seedErr });
            }
        }

        // Step 6 — return saved profile, strip DynamoDB keys
        const { PK: _PK, SK: _SK, ...profileData } = profile;
        logger.info('User profile updated successfully', { userId });
        return response(profileData);

    } catch (err) {
        logger.error('Failed to update user profile', { error: err });
        return error(STATUS.INTERNAL_ERROR, 'Internal server error');
    }
};