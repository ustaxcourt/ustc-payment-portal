import fetch from "node-fetch";
import type * as https from "https";

export type WsdlProbeResult = { ok: boolean; latencyMs: number; body: string };

// Shared Pay.gov WSDL probe used by the scheduled health probe, the on-demand
// /test endpoint, and the deploy health check. Reads SOAP_URL and appends ?wsdl.
export async function probePayGovWsdl(
  agent: https.Agent | undefined,
  headers: Record<string, string> = {},
): Promise<WsdlProbeResult> {
  const startedAt = Date.now();
  const result = await fetch(`${process.env.SOAP_URL}?wsdl`, { agent, headers });
  const body = await result.text();
  return { ok: result.ok, latencyMs: Date.now() - startedAt, body };
}
