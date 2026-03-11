import type { Config } from 'jest';

const config: Config = {
  // testTimeout at top level — applies to all projects
  // Integration tests need more time for DynamoDB Local
  testTimeout: 30000,

  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/unit/**/*.test.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }]
      },
      clearMocks: true,
      restoreMocks: true
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/test/integration/**/*.test.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }]
      },
      clearMocks: true,
      restoreMocks: true
    }
  ],
  collectCoverage: true,

  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  }
};

export default config;