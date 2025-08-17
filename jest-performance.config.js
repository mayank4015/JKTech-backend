const baseConfig = require('./package.json').jest;

module.exports = {
  ...baseConfig,
  testRegex: undefined, // Remove testRegex to avoid conflict
  testMatch: ['**/performance/**/*.spec.ts'],
  testTimeout: 60000, // 60 seconds for performance tests
  maxWorkers: 1, // Run performance tests sequentially
  verbose: true,
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.d.ts',
    '!src/**/node_modules/**',
    '!src/**/dist/**',
    '!src/**/*.interface.ts',
    '!src/**/*.types.ts',
    '!src/**/main.ts',
    '!src/**/performance/**', // Exclude performance tests from coverage
  ],
  coverageDirectory: '../coverage-performance',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/../test/setup.ts'],
};
