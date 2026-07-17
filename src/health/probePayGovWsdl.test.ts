import fetch from "node-fetch";
import { probePayGovWsdl } from "./probePayGovWsdl";

jest.mock("node-fetch", () => jest.fn());
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe("probePayGovWsdl", () => {
  beforeAll(() => {
    process.env.SOAP_URL = "http://localhost:3366";
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SOAP_URL = "http://localhost:3366";
  });

  it("appends ?wsdl and reports ok with the body", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue("wsdl body"),
    } as any);

    const result = await probePayGovWsdl({ mockAgent: true } as any, {
      Authorization: "Bearer x",
    });

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3366?wsdl", {
      agent: { mockAgent: true },
      headers: { Authorization: "Bearer x" },
      signal: expect.any(AbortSignal),
    });
    expect(result.ok).toBe(true);
    expect(result.body).toBe("wsdl body");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("reports ok=false on a non-2xx response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      text: jest.fn().mockResolvedValue(""),
    } as any);

    const result = await probePayGovWsdl(undefined);
    expect(result.ok).toBe(false);
  });

  it("rejects when fetch fails with a network error", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));

    await expect(probePayGovWsdl(undefined)).rejects.toThrow("network down");
  });

  it("throws a clear error when SOAP_URL is unset", async () => {
    delete (process.env as Record<string, string | undefined>).SOAP_URL;

    await expect(probePayGovWsdl(undefined)).rejects.toThrow(
      "SOAP_URL is not set",
    );
  });

  it("throws a timeout error when the request exceeds the timeout", async () => {
    jest.useFakeTimers();
    mockFetch.mockImplementation((_url, opts) =>
      new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () =>
          reject(new Error("The operation was aborted")),
        );
      }) as ReturnType<typeof fetch>,
    );

    const assertion = expect(
      probePayGovWsdl(undefined, {}, 3000),
    ).rejects.toThrow("Pay.gov WSDL probe timed out after 3000ms");
    await jest.advanceTimersByTimeAsync(3000);
    await assertion;
    jest.useRealTimers();
  });
});
