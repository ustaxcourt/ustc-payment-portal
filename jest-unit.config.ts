import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["dotenv/config", "<rootDir>/src/test/jest.setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/test/integration/", "/dist/"],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "src/test/testAppContext.ts",
  ],
};

export default config;
