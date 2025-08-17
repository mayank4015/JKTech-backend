# Performance Tests

This directory contains performance tests for the JKTech backend application. These tests are designed to measure system performance under various load conditions and ensure the application meets performance requirements.

## Overview

The performance tests simulate real-world usage patterns and measure:

- Response times
- Throughput (requests per second)
- Success rates
- Memory usage
- Concurrent request handling

## Test Categories

### 1. Authentication Performance

- Concurrent login requests
- JWT token validation under load

### 2. Document Service Performance

- Document retrieval under load
- Search query performance

### 3. Q&A Service Performance

- Question processing under concurrent load

### 4. Database Performance

- Concurrent database query handling

### 5. Memory Usage Performance

- Memory stability under load

## Running Performance Tests

### Run All Performance Tests

```bash
npm run test:performance
```

### Run Performance Tests with Coverage

```bash
npm run test:performance:cov
```

### Run Specific Performance Test

```bash
npm run test:performance -- --testNamePattern="Authentication"
```

### Run Performance Tests in Watch Mode

```bash
npm run test:performance -- --watch
```

## Load Test Configurations

The tests use three different load configurations:

### Light Load

- 10 concurrent users
- 5 requests per user
- 5-second timeout
- Expected: 20 RPS
- Max response time: 500ms

### Moderate Load

- 50 concurrent users
- 10 requests per user
- 10-second timeout
- Expected: 100 RPS
- Max response time: 1000ms

### Heavy Load

- 100 concurrent users
- 20 requests per user
- 30-second timeout
- Expected: 200 RPS
- Max response time: 2000ms

## Performance Metrics

Each test measures and reports:

- **Average Response Time**: Mean time to complete requests
- **Min/Max Response Time**: Fastest and slowest request times
- **Throughput**: Requests processed per second
- **Success Rate**: Percentage of successful requests
- **Memory Usage**: Current memory consumption

## Performance Thresholds

Tests will fail if they don't meet these criteria:

### Authentication

- Success rate > 95%
- Throughput > 80% of expected
- Average response time < configured maximum

### Document Operations

- Success rate > 95%
- Throughput > 70% of expected
- Average response time < configured maximum

### Database Operations

- Success rate > 98%
- Average response time < 200ms
- Throughput > expected threshold

### Memory Usage

- Memory increase < 100MB during test execution
- Success rate > 95%

## Best Practices

1. **Run performance tests in isolation**: Use `--runInBand` to avoid interference
2. **Monitor system resources**: Check CPU, memory, and disk usage during tests
3. **Baseline measurements**: Establish performance baselines for comparison
4. **Regular execution**: Include performance tests in CI/CD pipeline
5. **Environment consistency**: Run tests in consistent environments

## Troubleshooting

### High Response Times

- Check system resources (CPU, memory, disk)
- Verify database connection pool settings
- Review application logs for bottlenecks

### Low Throughput

- Increase timeout values if needed
- Check for resource contention
- Review concurrent request handling

### Memory Issues

- Monitor for memory leaks
- Check garbage collection patterns
- Review object creation in hot paths

## Configuration

Performance test settings can be adjusted in `performance.spec.ts`:

```typescript
const loadTestConfigs = {
  light: {
    concurrentUsers: 10,
    requestsPerUser: 5,
    timeoutMs: 5000,
    expectedThroughput: 20,
    maxResponseTime: 500,
  },
  // ... other configurations
};
```

## Integration with CI/CD

To include performance tests in your CI/CD pipeline:

```yaml
# Example GitHub Actions step
- name: Run Performance Tests
  run: npm run test:performance
  env:
    NODE_ENV: test
```

## Monitoring and Alerting

Consider setting up monitoring and alerting for:

- Performance test failures
- Response time degradation
- Throughput drops
- Memory usage spikes

## Contributing

When adding new performance tests:

1. Follow the existing test structure
2. Use appropriate load configurations
3. Set realistic performance thresholds
4. Document test purpose and expectations
5. Include proper error handling and cleanup

## Related Documentation

- [Main README](../../README.md)
- [Testing Guide](../../test/README.md)
- [Logging Documentation](../../LOGGING.md)
- [Design Documentation](../../DESIGN_DOCUMENTATION.md)
