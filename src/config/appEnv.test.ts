import { APP_ENVS, getAppEnv, isDeployed, isLocal } from "./appEnv";

// Cast the current process.env so tests can write invalid values that the
// narrowed ProcessEnv types disallow. Re-reads each call because beforeEach
// reassigns process.env to a new object.
const mutableEnv = (): Record<string, string | undefined> =>
  process.env as Record<string, string | undefined>;

describe("appEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getAppEnv", () => {
    it.each(APP_ENVS)("returns %s when APP_ENV is set to that value", (value) => {
      process.env.APP_ENV = value;
      expect(getAppEnv()).toBe(value);
    });

    it("falls back to test when APP_ENV is unset and NODE_ENV is test", () => {
      delete mutableEnv().APP_ENV;
      process.env.NODE_ENV = "test";
      expect(getAppEnv()).toBe("test");
    });

    it("throws when APP_ENV is unset and NODE_ENV is not test", () => {
      delete mutableEnv().APP_ENV;
      process.env.NODE_ENV = "production";
      expect(() => getAppEnv()).toThrow("APP_ENV is not set");
    });

    it("throws when APP_ENV is set to an unrecognized value", () => {
      mutableEnv().APP_ENV = "staging";
      expect(() => getAppEnv()).toThrow(
        'Invalid APP_ENV "staging". Expected one of: local, dev, stg, prod, test'
      );
    });
  });

  describe("isLocal", () => {
    it("is true when APP_ENV is local", () => {
      process.env.APP_ENV = "local";
      expect(isLocal()).toBe(true);
    });

    it.each(["dev", "stg", "prod", "test"] as const)(
      "is false when APP_ENV is %s",
      (env) => {
        process.env.APP_ENV = env;
        expect(isLocal()).toBe(false);
      }
    );
  });

  describe("isDeployed", () => {
    it.each(["dev", "stg", "prod"] as const)(
      "is true when APP_ENV is %s",
      (env) => {
        process.env.APP_ENV = env;
        expect(isDeployed()).toBe(true);
      }
    );

    it.each(["local", "test"] as const)(
      "is false when APP_ENV is %s",
      (env) => {
        process.env.APP_ENV = env;
        expect(isDeployed()).toBe(false);
      }
    );
  });
});
