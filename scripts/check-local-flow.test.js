

// check-local-flow.js auto-runs main() on require. All tests mock global.fetch
// and spy on process.exit, then flush the microtask queue after requiring so
// the async chain resolves before assertions run.

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function makeFetchResponse({ ok = true, status = 200, statusText = "OK", contentType = "application/json", json, text }) {
  return {
    ok,
    status,
    statusText,
    headers: { get: () => contentType },
    json: json ? () => Promise.resolve(json) : undefined,
    text: text ? () => Promise.resolve(text) : undefined,
  };
}

describe("check-local-flow", () => {
  let processExitSpy;

  beforeEach(() => {
    jest.resetModules();

    processExitSpy = jest.spyOn(process, "exit").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});

    // Silence the script's own logger
    jest.doMock("./lib/log", () => ({
      createLogger: () => ({
        tag: "[check:local-flow]",
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    }));
    jest.doMock("./lib/parsePort", () => ({
      parsePort: jest.fn((value, fallback) => fallback),
    }));

    delete process.env.FEE_ID;
    delete process.env.BASE_URL;
    delete process.env.PAYMENT_URL;
  });

  afterEach(() => jest.restoreAllMocks());

  it("succeeds when /init returns a token in the body and /pay returns a valid mock page", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        makeFetchResponse({
          json: { token: "abc-token-123" },
        }),
      )
      .mockResolvedValueOnce(
        makeFetchResponse({
          contentType: "text/html",
          text: "<html><body data-payment-method='card'>test payment page</body></html>",
        }),
      );

    require("./check-local-flow");
    await flushPromises();

    expect(processExitSpy).not.toHaveBeenCalledWith(1);
  });

  it("succeeds when /init returns a paymentRedirect URL containing the token", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        makeFetchResponse({
          json: {
            paymentRedirect:
              "http://localhost:3366/pay?token=redirect-token-xyz",
          },
        }),
      )
      .mockResolvedValueOnce(
        makeFetchResponse({
          contentType: "text/html",
          text: "<html><body data-payment-method='ach'>test payment page</body></html>",
        }),
      );

    require("./check-local-flow");
    await flushPromises();

    expect(processExitSpy).not.toHaveBeenCalledWith(1);
    // Second fetch should include the token from paymentRedirect
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("exits with 1 when /init returns a non-2xx response", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(
      makeFetchResponse({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        contentType: "text/plain",
        text: "invalid payload",
      }),
    );

    require("./check-local-flow");
    await flushPromises();

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("exits with 1 when /pay returns a non-2xx response", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        makeFetchResponse({ json: { token: "tok" } }),
      )
      .mockResolvedValueOnce(
        makeFetchResponse({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          contentType: "text/plain",
          text: "server error",
        }),
      );

    require("./check-local-flow");
    await flushPromises();

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("exits with 1 when /pay returns 200 but the page is not the mock payment page", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        makeFetchResponse({ json: { token: "tok" } }),
      )
      .mockResolvedValueOnce(
        makeFetchResponse({
          contentType: "text/html",
          text: "<html><body>some other page</body></html>",
        }),
      );

    require("./check-local-flow");
    await flushPromises();

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("exits with 1 when an unknown FEE_ID is set", async () => {
    process.env.FEE_ID = "UNKNOWN_FEE";

    require("./check-local-flow");
    await flushPromises();

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it("exits with 1 when /init response contains neither token nor paymentRedirect", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(
      makeFetchResponse({ json: { someOtherField: "data" } }),
    );

    require("./check-local-flow");
    await flushPromises();

    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
