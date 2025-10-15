# Test Coverage Documentation

## Coverage Summary

This document explains the test coverage for the payment portal codebase and documents any lines that are intentionally excluded from coverage requirements.

## Coverage Goals

The project attempts to maintain testing coverage of 100%. All production source files in `/src` (excluding test utilities) are expected to have unit tests.

An example of where we don't need coverage are for portions of the code where we are calling out to an external SDK and the portion of coverage missing is for the actual call to a service.  This behavior should be mocked in a unit test or the code refactored and the line in question can safely be ignored for coverage.

## Legitimately Excluded Files

The following files are **intentionally excluded** from coverage requirements:

### 1. AppContext.ts
- Line 66: Nested within a catch block, this line is simply a console.warn and is not included in unit tests.

### 2. Test Utilities (`src/test/testAppContext.ts`)

**Current Coverage:** ~50% (intentionally low)

**Justification:** This file contains test helper utilities used by other tests. Test utilities themselves do not require test coverage as they are development tools, not production code.

**Lines Excluded:**

- Line 6: Mock function factory for use cases - This is test scaffolding code

**Rationale:** Testing test utilities creates circular dependencies and provides no value. These utilities are validated through their usage in actual tests.

### 3. Server Entry Points and Context

**Files:**

- `src/devServer.ts` - Development server bootstrap code

**Justification:**

- Development server is not part of the production Lambda deployment.

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
