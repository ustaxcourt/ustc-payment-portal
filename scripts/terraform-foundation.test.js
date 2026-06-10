"use strict";

describe("terraform-foundation", () => {
  let mockSpawnSync;
  let terraformFoundation;

  const realArgv = process.argv.slice();

  beforeEach(() => {
    jest.resetModules();
    mockSpawnSync = jest.fn();

    jest.doMock("node:child_process", () => ({
      spawnSync: mockSpawnSync,
    }));

    terraformFoundation = require("./terraform-foundation");
  });

  afterEach(() => {
    process.argv = realArgv.slice();
    jest.restoreAllMocks();
  });

  it("parses action, env, and passthrough args", () => {
    const parsed = terraformFoundation.parseArgs([
      "node",
      "scripts/terraform-foundation.js",
      "plan",
      "--env",
      "stg",
      "-lock=false",
    ]);

    expect(parsed).toEqual({
      action: "plan",
      env: "stg",
      passthrough: ["-lock=false"],
    });
  });

  it("throws when env is missing", () => {
    expect(() =>
      terraformFoundation.parseArgs([
        "node",
        "scripts/terraform-foundation.js",
        "init",
      ]),
    ).toThrow("Invalid or missing --env value");
  });

  it("builds init args with backend config", () => {
    const args = terraformFoundation.buildTerraformArgs(
      "init",
      terraformFoundation.ENV_CONFIG.dev,
      ["-input=false"],
    );

    expect(args).toEqual([
      "init",
      "-reconfigure",
      "-backend-config=backend/dev.hcl",
      "-input=false",
    ]);
  });

  it("builds plan args with env var file", () => {
    const args = terraformFoundation.buildTerraformArgs(
      "plan",
      terraformFoundation.ENV_CONFIG.prod,
      ["-input=false"],
    );

    expect(args).toEqual([
      "plan",
      "-var-file=vars/prod.vars.hcl",
      "-input=false",
    ]);
  });

  it("runs terraform from shared foundation root using env profile and files", () => {
    process.argv = [
      "node",
      "scripts/terraform-foundation.js",
      "plan",
      "--env=dev",
      "-input=false",
    ];

    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: '{"Account":"723609007960"}' })
      .mockReturnValueOnce({ status: 0 });

    const exitCode = terraformFoundation.main();

    expect(exitCode).toBe(0);

    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      1,
      "aws",
      ["sts", "get-caller-identity", "--profile", "ustcpp-dev", "--output", "json"],
      expect.objectContaining({
        encoding: "utf8",
        env: expect.objectContaining({
          AWS_PROFILE: "ustcpp-dev",
          AWS_SDK_LOAD_CONFIG: "1",
        }),
      }),
    );

    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      2,
      "terraform",
      ["plan", "-var-file=vars/dev.vars.hcl", "-input=false"],
      expect.objectContaining({
        cwd: expect.stringMatching(/terraform\/environments\/foundation$/),
        stdio: "inherit",
        env: expect.objectContaining({
          AWS_PROFILE: "ustcpp-dev",
          AWS_SDK_LOAD_CONFIG: "1",
        }),
      }),
    );
  });

  it("throws on account mismatch", () => {
    process.argv = ["node", "scripts/terraform-foundation.js", "plan", "--env=stg"];

    mockSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: '{"Account":"723609007960"}',
    });

    expect(() => terraformFoundation.main()).toThrow(
      "AWS account mismatch for stg. Expected '747103385969', got '723609007960'.",
    );
  });

  it("attempts sso login when initial sts check fails", () => {
    process.argv = ["node", "scripts/terraform-foundation.js", "init", "--env=prod"];

    mockSpawnSync
      .mockReturnValueOnce({ status: 1, stdout: "" })
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 0, stdout: '{"Account":"802939326821"}' })
      .mockReturnValueOnce({ status: 0 });

    const exitCode = terraformFoundation.main();

    expect(exitCode).toBe(0);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "aws",
      ["sso", "login", "--profile", "ustcpp-prod"],
      expect.objectContaining({
        stdio: "inherit",
        env: expect.objectContaining({
          AWS_PROFILE: "ustcpp-prod",
          AWS_SDK_LOAD_CONFIG: "1",
        }),
      }),
    );

    expect(mockSpawnSync).toHaveBeenLastCalledWith(
      "terraform",
      ["init", "-reconfigure", "-backend-config=backend/prod.hcl"],
      expect.objectContaining({
        stdio: "inherit",
      }),
    );
  });
});
