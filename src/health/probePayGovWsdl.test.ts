import fetch from "node-fetch";
import { probePayGovWsdl } from "./probePayGovWsdl";

jest.mock("node-fetch", () => jest.fn());
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe("probePayGovWsdl", () => {
  beforeAll(() => {
    process.env.SOAP_URL = "http://localhost:3366";
  });

  beforeEach(() => jest.clearAllMocks());

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
});
