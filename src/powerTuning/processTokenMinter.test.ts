import type { APIGatewayEvent } from "aws-lambda";

const sendMock = jest.fn();
const invokeCommandMock = jest.fn((input: unknown) => ({ input }));

jest.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: jest.fn(() => ({ send: sendMock })),
  InvokeCommand: jest.fn((input: unknown) => invokeCommandMock(input)),
}));

jest.mock("@utils/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { handler, processTokenMinter } from "./processTokenMinter";

const PAYMENT_REDIRECT =
  "https://pay-gov-dev.ustaxcourt.gov/pay?token=old-tok&tcsAppID=APP1";

const encodeProxyResult = (statusCode: number, body: unknown): Uint8Array =>
  new TextEncoder().encode(
    JSON.stringify({ statusCode, body: JSON.stringify(body) }),
  );

const okInvoke = (
  token = "tok-123",
  paymentRedirect = PAYMENT_REDIRECT,
): { Payload: Uint8Array } => ({
  Payload: encodeProxyResult(200, { token, paymentRedirect }),
});

const buildEvent = (body: string | null = null): APIGatewayEvent =>
  ({
    body,
    requestContext: {
      identity: {
        userArn:
          "arn:aws:sts::723609007960:assumed-role/ustc-power-tuning/tuning",
      },
    },
  } as unknown as APIGatewayEvent);

const okFetch = (): void => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => "ok",
  });
};

beforeEach(() => {
  sendMock.mockReset();
  invokeCommandMock.mockClear();
  global.fetch = jest.fn();
});

describe("processTokenMinter", () => {
  it("mints a fresh token by invoking initPayment and completing on the mock", async () => {
    sendMock.mockResolvedValue(okInvoke("tok-123"));
    okFetch();

    const result = await processTokenMinter(buildEvent());

    expect(JSON.parse(result.body ?? "{}")).toEqual({ token: "tok-123" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("invokes the initPayment function with a fresh transactionReferenceId and the tuning caller ARN", async () => {
    sendMock.mockResolvedValue(okInvoke());
    okFetch();

    await processTokenMinter(buildEvent());

    const input = invokeCommandMock.mock.calls[0][0] as {
      FunctionName: string;
      Payload: Buffer;
    };
    expect(input.FunctionName).toBe("ustc-payment-processor-initPayment");
    const initEvent = JSON.parse(input.Payload.toString());
    const initBody = JSON.parse(initEvent.body);
    expect(initBody.transactionReferenceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(initBody.fee).toBe("PETITION_FILING_FEE");
    expect(initEvent.requestContext.identity.userArn).toBe(
      "arn:aws:sts::723609007960:assumed-role/ustc-power-tuning/tuning",
    );
  });

  it("completes the payment on the mock at the /pay/<method>/<status> path with the minted token", async () => {
    sendMock.mockResolvedValue(okInvoke("tok-xyz"));
    okFetch();

    await processTokenMinter(buildEvent());

    const calledUrl = (global.fetch as jest.Mock).mock.calls[0][0].toString();
    expect(calledUrl).toContain("/pay/PLASTIC_CARD/Success");
    expect(calledUrl).toContain("token=tok-xyz");
    expect((global.fetch as jest.Mock).mock.calls[0][1]).toEqual({
      method: "POST",
    });
  });

  it("preserves the base event and its requestContext", async () => {
    sendMock.mockResolvedValue(okInvoke());
    okFetch();

    const event = buildEvent();
    const result = await processTokenMinter(event);

    expect(result.requestContext).toBe(event.requestContext);
  });

  it("merges the minted token into an existing JSON body", async () => {
    sendMock.mockResolvedValue(okInvoke("tok-merged"));
    okFetch();

    const result = await processTokenMinter(
      buildEvent(JSON.stringify({ token: "stale", keepMe: "yes" })),
    );

    expect(JSON.parse(result.body ?? "{}")).toEqual({
      token: "tok-merged",
      keepMe: "yes",
    });
  });

  it("falls back to a token-only body when the base body is not JSON", async () => {
    sendMock.mockResolvedValue(okInvoke("tok-only"));
    okFetch();

    const result = await processTokenMinter(buildEvent("not-json"));

    expect(JSON.parse(result.body ?? "{}")).toEqual({ token: "tok-only" });
  });

  it("uses a unique transactionReferenceId on each invocation", async () => {
    sendMock.mockResolvedValue(okInvoke());
    okFetch();

    await processTokenMinter(buildEvent());
    await processTokenMinter(buildEvent());

    const first = JSON.parse(
      (
        invokeCommandMock.mock.calls[0][0] as { Payload: Buffer }
      ).Payload.toString(),
    );
    const second = JSON.parse(
      (
        invokeCommandMock.mock.calls[1][0] as { Payload: Buffer }
      ).Payload.toString(),
    );
    expect(JSON.parse(first.body).transactionReferenceId).not.toBe(
      JSON.parse(second.body).transactionReferenceId,
    );
  });

  it("throws when the initPayment invocation reports a FunctionError", async () => {
    sendMock.mockResolvedValue({
      FunctionError: "Unhandled",
      Payload: new TextEncoder().encode("boom"),
    });

    await expect(processTokenMinter(buildEvent())).rejects.toThrow(
      /initPayment invocation failed \(Unhandled\)/,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("throws when the initPayment invocation returns no payload", async () => {
    sendMock.mockResolvedValue({});

    await expect(processTokenMinter(buildEvent())).rejects.toThrow(
      /returned no payload/,
    );
  });

  it("throws when initPayment returns a non-200 status", async () => {
    sendMock.mockResolvedValue({
      Payload: encodeProxyResult(409, { message: "conflict" }),
    });

    await expect(processTokenMinter(buildEvent())).rejects.toThrow(
      /initPayment returned status 409/,
    );
  });

  it("throws when the initPayment response is missing token or paymentRedirect", async () => {
    sendMock.mockResolvedValue({
      Payload: encodeProxyResult(200, { paymentRedirect: PAYMENT_REDIRECT }),
    });

    await expect(processTokenMinter(buildEvent())).rejects.toThrow(
      /missing token or paymentRedirect/,
    );
  });

  it("throws when the mock markPayment call fails", async () => {
    sendMock.mockResolvedValue(okInvoke());
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "mock down",
    });

    await expect(processTokenMinter(buildEvent())).rejects.toThrow(
      /mock markPayment failed \(500\)/,
    );
  });

  it("exposes handler as an alias of processTokenMinter", () => {
    expect(handler).toBe(processTokenMinter);
  });
});
