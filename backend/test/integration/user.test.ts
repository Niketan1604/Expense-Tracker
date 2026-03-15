import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
    setupIntegration, teardownIntegration, clearTable,
    testDocClient, TEST_TABLE_NAME
} from '../helpers/integrationSetup';
import { buildEvent, TEST_USER_ID, TEST_EMAIL } from '../helpers/eventBuilder';
import { handler as getUserProfileHandler } from '../../src/user/getUserProfile/index';
import { handler as putUserProfileHandler } from '../../src/user/putUserProfile/index';

jest.mock('../../src/shared/db', () => ({
    get docClient() { return require('../helpers/integrationSetup').testDocClient; },
    get TABLE_NAME() { return require('../helpers/integrationSetup').TEST_TABLE_NAME; }
}));
jest.mock('../../src/shared/logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })
}));
jest.mock('../../src/shared/auth', () => ({
    getUserId: jest.fn().mockReturnValue(TEST_USER_ID),
    getUserEmail: jest.fn().mockReturnValue(TEST_EMAIL)
}));

const VALID_BODY = { name: 'Niketan', currency: 'INR' };

const putProfile = async (body: Record<string, unknown>, expectStatus = 200) => {
    const result = await putUserProfileHandler(buildEvent({ body })) as any;
    if (result.statusCode !== expectStatus) {
        throw new Error(`putProfile failed: ${result.statusCode} — ${result.body}`);
    }
    return JSON.parse(result.body).data;
};

const getProfileItem = async () => {
    const result = await testDocClient.send(new GetCommand({
        TableName: TEST_TABLE_NAME,
        Key: { PK: `USER#${TEST_USER_ID}`, SK: 'PROFILE' }
    }));
    return result.Item;
};

beforeAll(async () => { await setupIntegration(); });
afterAll(async () => { await teardownIntegration(); });
beforeEach(async () => { await clearTable(); });

// =========================================================
// PUT /user/profile
// =========================================================
describe('PUT /user/profile — integration', () => {
    it('creates profile and returns 200 with correct fields', async () => {
        const profile = await putProfile(VALID_BODY);
        expect(profile.userId).toBe(TEST_USER_ID);
        expect(profile.email).toBe(TEST_EMAIL);
        expect(profile.name).toBe('Niketan');
        expect(profile.currency).toBe('INR');
        expect(profile.createdAt).toBeDefined();
        expect(profile.updatedAt).toBeDefined();
    });

    it('writes item to DynamoDB with PK=USER#{userId}, SK=PROFILE', async () => {
        await putProfile(VALID_BODY);
        const item = await getProfileItem();
        expect(item).toBeDefined();
        expect(item?.PK).toBe(`USER#${TEST_USER_ID}`);
        expect(item?.SK).toBe('PROFILE');
        expect(item?.name).toBe('Niketan');
    });

    it('strips PK and SK from response', async () => {
        const profile = await putProfile(VALID_BODY);
        expect(profile.PK).toBeUndefined();
        expect(profile.SK).toBeUndefined();
    });

    it('uppercases currency', async () => {
        const profile = await putProfile({ ...VALID_BODY, currency: 'inr' });
        expect(profile.currency).toBe('INR');
    });

    it('trims whitespace from name, currency', async () => {
        const profile = await putProfile({ name: '  Niketan  ', currency: ' INR ' });
        expect(profile.name).toBe('Niketan');
        expect(profile.currency).toBe('INR');
    });

    it('preserves original createdAt on subsequent updates', async () => {
        const first = await putProfile(VALID_BODY);
        const originalCreatedAt = first.createdAt;

        await new Promise(r => setTimeout(r, 10));
        const second = await putProfile({ ...VALID_BODY, name: 'Updated Name' });

        expect(second.createdAt).toBe(originalCreatedAt);
    });

    it('updates updatedAt on each call', async () => {
        const first = await putProfile(VALID_BODY);
        await new Promise(r => setTimeout(r, 10));
        const second = await putProfile({ ...VALID_BODY, name: 'Updated' });
        expect(second.updatedAt).not.toBe(first.updatedAt);
    });

    it('updates name, keeps other fields', async () => {
        await putProfile(VALID_BODY);
        const updated = await putProfile({ ...VALID_BODY, name: 'New Name' });
        expect(updated.name).toBe('New Name');
        expect(updated.currency).toBe('INR');
    });

    it('persists changes to DynamoDB', async () => {
        await putProfile(VALID_BODY);
        await putProfile({ ...VALID_BODY, name: 'Changed' });
        const item = await getProfileItem();
        expect(item?.name).toBe('Changed');
    });

    it('returns 400 when name is missing', async () => {
        const result = await putUserProfileHandler(buildEvent({ body: { currency: 'INR' } })) as any;
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body).message).toMatch(/name/i);
    });

    it('returns 400 when name is empty string', async () => {
        const result = await putUserProfileHandler(buildEvent({ body: { name: '', currency: 'INR' } })) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 400 when currency is missing', async () => {
        const result = await putUserProfileHandler(buildEvent({ body: { name: 'Niketan' } })) as any;
        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body).message).toMatch(/currency/i);
    });

    it('returns 400 for invalid JSON body', async () => {
        const event = buildEvent();
        (event as any).body = 'not-valid-json';
        const result = await putUserProfileHandler(event) as any;
        expect(result.statusCode).toBe(400);
    });

    it('returns 401 when userId is missing', async () => {
        const { getUserId } = require('../../src/shared/auth');
        (getUserId as jest.Mock).mockReturnValueOnce(undefined);
        const result = await putUserProfileHandler(buildEvent({ body: VALID_BODY })) as any;
        expect(result.statusCode).toBe(401);
    });
});

// =========================================================
// GET /user/profile
// =========================================================
describe('GET /user/profile — integration', () => {
    it('returns 404 when profile does not exist', async () => {
        const result = await getUserProfileHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(404);
        expect(JSON.parse(result.body).message).toBe('User profile not found');
    });

    it('returns 200 with profile after it has been created', async () => {
        await putProfile(VALID_BODY);
        const result = await getUserProfileHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(200);
        const data = JSON.parse(result.body).data;
        expect(data.userId).toBe(TEST_USER_ID);
        expect(data.name).toBe('Niketan');
        expect(data.currency).toBe('INR');
        expect(data.email).toBe(TEST_EMAIL);
    });

    it('strips PK and SK from response', async () => {
        await putProfile(VALID_BODY);
        const result = await getUserProfileHandler(buildEvent()) as any;
        const data = JSON.parse(result.body).data;
        expect(data.PK).toBeUndefined();
        expect(data.SK).toBeUndefined();
    });

    it('reflects the latest PUT after an update', async () => {
        await putProfile(VALID_BODY);
        await putProfile({ ...VALID_BODY, name: 'Updated Niketan', currency: 'USD' });

        const result = await getUserProfileHandler(buildEvent()) as any;
        const data = JSON.parse(result.body).data;
        expect(data.name).toBe('Updated Niketan');
        expect(data.currency).toBe('USD');
    });

    it('returns 401 when userId is missing', async () => {
        const { getUserId } = require('../../src/shared/auth');
        (getUserId as jest.Mock).mockReturnValueOnce(undefined);
        const result = await getUserProfileHandler(buildEvent()) as any;
        expect(result.statusCode).toBe(401);
    });
});