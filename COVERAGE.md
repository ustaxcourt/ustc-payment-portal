# Test Coverage Documentation

## Coverage Summary

This document explains the test coverage for the payment portal codebase and documents any lines that are intentionally excluded from coverage requirements.

## Coverage Goals

The project targets **100% line coverage** for all production code. All production source files in `/src` (excluding test utilities, integration tests, and appContext.ts) are expected to have comprehensive unit tests.

## Legitimately Excluded Files

The following files are **intentionally excluded** from coverage requirements:

### 1. Test Utilities (`src/test/testAppContext.ts`)

**Current Coverage:** ~50% (intentionally low)

**Justification:** This file contains test helper utilities used by other tests. Test utilities themselves do not require test coverage as they are development tools, not production code.

**Lines Excluded:**

- Line 6: Mock function factory for use cases - This is test scaffolding code

**Rationale:** Testing test utilities creates circular dependencies and provides no value. These utilities are validated through their usage in actual tests.

### 2. Integration Tests (`src/test/integration/**`)

**Current Coverage:** Excluded from unit test coverage reports

**Justification:** Integration tests are designed to test the system end-to-end against real or mocked external services. They are not meant to be unit tested themselves.

**Files:**

- `src/test/integration/initPayment.test.ts`
- `src/test/integration/transaction.test.ts`

**Rationale:** Integration tests serve a different purpose than unit tests and should not be included in unit test coverage metrics.

### 3. Server Entry Points and Context

**Files:**

- `src/devServer.ts` - Development server bootstrap code
- `src/testCert.ts` - Certificate testing utility
- `src/appContext.ts` - Application context factory

**Justification:**

- Development server and certificate testing utilities are not part of the production Lambda deployment.
- `appContext.ts` is a factory module that creates the application context with file system and network dependencies. It is thoroughly tested via integration tests and usage in all other unit tests through the `testAppContext` mock.

**Rationale:** These are infrastructure/bootstrap code validated through integration tests and real usage, not isolated unit tests.

### 4. Type Definitions

**Files in `src/types/`:**

- All `.d.ts` and TypeScript type-only files

**Justification:** Type definitions don't contain executable code and are validated by the TypeScript compiler.

## Running Coverage Reports

To generate a coverage report:

```bash
npm run test:coverage
```
