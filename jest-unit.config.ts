import type { Config } from "jest";

const moduleNameMapper = {
  "^clients/(.*)$": "<rootDir>/src/clients/$1",
  "^entities/(.*)$": "<rootDir>/src/entities/$1",
  "^errors/(.*)$": "<rootDir>/src/errors/$1",
  "^handlers/(.*)$": "<rootDir>/src/handlers/$1",
  "^schemas/(.*)$": "<rootDir>/src/schemas/$1",
  "^utils/(.*)$": "<rootDir>/src/utils/$1",
  "^types/(.*)$": "<rootDir>/src/types/$1",
  "^useCases/(.*)$": "<rootDir>/src/useCases/$1",
};

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: [
    "/node_modules/",
    "/test/integration/",
    "/dist/",
    "/resources/",
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/resources/",
    "src/test/testAppContext.ts",
  ],
  moduleNameMapper,
};

export default config;
