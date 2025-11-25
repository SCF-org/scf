/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(aws-sdk-client-mock|aws-sdk-client-mock-jest)/)',
  ],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.spec.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/types/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testTimeout: 30000, // E2E 테스트를 위해 30초로 설정
  globalSetup: '<rootDir>/jest.global-setup.js',
  globalTeardown: '<rootDir>/jest.global-teardown.js',
};
