import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["dotenv/config"],
  bail: true,
  testPathIgnorePatterns: ["/node_modules/", "/test/integration/", "/dist/"],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "src/test/testAppContext.ts",
  ],
};

export default config;
