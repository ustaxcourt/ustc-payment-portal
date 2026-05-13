import { EventEmitter } from "events";

jest.mock("./getPortalLogger", () => ({
  logger: {
    clearContext: jest.fn(),
    addContext: jest.fn(),
    info: jest.fn(),
  },
}));

import { logger } from "./getPortalLogger";
import { expressLogger } from "./expressLogger";

describe("expressLogger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("logs request and response context using the shared logger", () => {
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
    expect(logger.clearContext).toHaveBeenCalledTimes(1);
    expect(logger.addContext).toHaveBeenCalledWith(
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
    expect(logger.info).toHaveBeenCalledWith("Request started: POST /init");

    res.emit("finish");

    expect(logger.addContext).toHaveBeenCalledWith(
      expect.objectContaining({
        response: {
          responseSize: 42,
          responseTimeMs: expect.any(Number),
          statusCode: 201,
          event: "finished",
        },
      }),
    );
    expect(logger.info).toHaveBeenCalledWith("Request ended: POST /init");
    expect(logger.clearContext).toHaveBeenCalledTimes(2);
  });
});
