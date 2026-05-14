import { EventEmitter } from "events";

type MockLogger = {
  child: jest.Mock;
  debug: jest.Mock;
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

const mockBaseLogger = {} as MockLogger;
mockBaseLogger.child = jest.fn(() => mockBaseLogger);
mockBaseLogger.debug = jest.fn();
mockBaseLogger.info = jest.fn();
mockBaseLogger.warn = jest.fn();
mockBaseLogger.error = jest.fn();

jest.mock("./logger", () => ({
  createLogger: jest.fn(() => mockBaseLogger),
}));

import { expressLogger } from "./expressLogger";

describe("expressLogger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a request-scoped logger and logs request/response lifecycle", () => {
    const req = {
      body: {
        username: "test-user",
        password: "secret-password",
        nested: {
          passwordConfirmation: "secret-password-confirmation",
        },
      },
      headers: {
        "x-request-id": "request-123",
      },
      method: "POST",
      url: "/init",
      get: jest.fn((headerName: string) =>
        headerName === "x-request-id" ? "request-123" : undefined,
      ),
    } as any;

    const res = new EventEmitter() as any;
    res.statusCode = 201;
    res.get = jest.fn((headerName: string) =>
      headerName === "content-length" ? "42" : undefined,
    );

    const next = jest.fn();

    expressLogger(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.locals?.logger).toBeDefined();
    expect(req.locals?.startTime).toEqual(expect.any(Number));

    expect(mockBaseLogger.child).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: {
          color: "green",
          stage: "local",
        },
        requestId: {
          application: "request-123",
        },
        request: expect.objectContaining({
          method: "POST",
          url: "/init",
          body: JSON.stringify({
            username: "test-user",
            password: "*** REDACTED ***",
            nested: {
              passwordConfirmation: "*** REDACTED ***",
            },
          }),
        }),
      }),
    );

    expect(mockBaseLogger.info).toHaveBeenCalledWith(
      "Request started: POST /init",
      undefined,
    );

    res.emit("finish");

    expect(mockBaseLogger.info).toHaveBeenCalledWith(
      "Request ended: POST /init",
      undefined,
    );
  });
});
