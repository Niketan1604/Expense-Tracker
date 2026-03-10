import { jest } from '@jest/globals';
export const TEST_USER_ID = 'test-user-123';
export const TEST_EMAIL = 'test@flowmint.dev';

// Reusable mock for src/shared/auth
// Use in every test file:
//   jest.mock('../../../src/shared/auth', () => require('../../helpers/mockAuth').mockAuthModule);
export const mockAuthModule = {
    getUserId: jest.fn().mockReturnValue(TEST_USER_ID),
    getUserEmail: jest.fn().mockReturnValue(TEST_EMAIL)
};

// Call this in beforeEach to reset to defaults
export const resetMockAuth = () => {
    mockAuthModule.getUserId.mockReturnValue(TEST_USER_ID);
    mockAuthModule.getUserEmail.mockReturnValue(TEST_EMAIL);
};

// Call this to simulate unauthenticated request
export const mockUnauthenticated = () => {
    mockAuthModule.getUserId.mockReturnValue(undefined);
    mockAuthModule.getUserEmail.mockReturnValue(undefined);
};