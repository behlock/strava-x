const { resolve } = require('path');

module.exports = {
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', 'tsconfig.json']
  },
  moduleNameMapper: {
    '^@/(.*)$': resolve(__dirname, 'src/$1'),
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};
