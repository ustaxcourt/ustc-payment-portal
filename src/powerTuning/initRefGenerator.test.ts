import type { APIGatewayEvent } from "aws-lambda";
import { handler, initRefGenerator } from "./initRefGenerator";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const buildEvent = (
  body: string | null,
  overrides: Partial<APIGatewayEvent> = {},
): APIGatewayEvent =>
  ({
    body,
    requestContext: {
      identity: {
        userArn:
          "arn:aws:sts::723609007960:assumed-role/ustc-power-tuning/tuning",
      },
    },
    headers: { "Content-Type": "application/json" },
    ...overrides,
  } as unknown as APIGatewayEvent);

describe("initRefGenerator", () => {
  it("rewrites transactionReferenceId with a fresh UUID", async () => {
    const event = buildEvent(
      JSON.stringify({
        transactionReferenceId: "original-ref",
        fee: "PETITION_FILING_FEE",
      }),
    );

    const result = await initRefGenerator(event);
    const body = JSON.parse(result.body ?? "{}") as Record<string, unknown>;

    expect(body.transactionReferenceId).not.toBe("original-ref");
    expect(body.transactionReferenceId).toMatch(UUID_RE);
  });

  it("preserves all other body fields", async () => {
    const event = buildEvent(
      JSON.stringify({
        transactionReferenceId: "original-ref",
        fee: "PETITION_FILING_FEE",
        urlSuccess: "http://example.com/success",
        metadata: { docketNumber: "123-26" },
      }),
    );

    const result = await initRefGenerator(event);
    const body = JSON.parse(result.body ?? "{}") as Record<string, unknown>;

    expect(body.fee).toBe("PETITION_FILING_FEE");
    expect(body.urlSuccess).toBe("http://example.com/success");
    expect(body.metadata).toEqual({ docketNumber: "123-26" });
  });

  it("passes the rest of the event through unchanged (auth context intact)", async () => {
    const event = buildEvent(JSON.stringify({ fee: "PETITION_FILING_FEE" }));

    const result = await initRefGenerator(event);

    expect(result.requestContext).toBe(event.requestContext);
    expect(result.headers).toBe(event.headers);
  });

  it("produces a unique reference on each invocation", async () => {
    const event = buildEvent(JSON.stringify({ fee: "PETITION_FILING_FEE" }));

    const first = JSON.parse((await initRefGenerator(event)).body ?? "{}") as {
      transactionReferenceId: string;
    };
    const second = JSON.parse((await initRefGenerator(event)).body ?? "{}") as {
      transactionReferenceId: string;
    };

    expect(first.transactionReferenceId).not.toBe(
      second.transactionReferenceId,
    );
  });

  it("adds transactionReferenceId when the body has none", async () => {
    const event = buildEvent(JSON.stringify({ fee: "PETITION_FILING_FEE" }));

    const body = JSON.parse((await initRefGenerator(event)).body ?? "{}") as {
      transactionReferenceId: string;
    };

    expect(body.transactionReferenceId).toMatch(UUID_RE);
  });

  it("defaults to an empty object body when body is null", async () => {
    const event = buildEvent(null);

    const body = JSON.parse((await initRefGenerator(event)).body ?? "{}") as {
      transactionReferenceId: string;
    };

    expect(body.transactionReferenceId).toMatch(UUID_RE);
  });

  it("throws when the body is not valid JSON", async () => {
    const event = buildEvent("not-json");

    await expect(initRefGenerator(event)).rejects.toThrow(
      /not a valid JSON object/,
    );
  });

  it("throws when the body is a JSON array", async () => {
    const event = buildEvent(JSON.stringify([1, 2, 3]));

    await expect(initRefGenerator(event)).rejects.toThrow(
      /not a valid JSON object/,
    );
  });

  it("throws when the body is a JSON primitive", async () => {
    const event = buildEvent(JSON.stringify("just-a-string"));

    await expect(initRefGenerator(event)).rejects.toThrow(
      /not a valid JSON object/,
    );
  });

  it("exposes handler as the entry point alias", () => {
    expect(handler).toBe(initRefGenerator);
  });
});
