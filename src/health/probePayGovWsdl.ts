import type * as https from "node:https";
import fetch from "node-fetch";

export type WsdlProbeResult = { ok: boolean; latencyMs: number; body: string };

const WSDL_PROBE_TIMEOUT_MS = 10_000;

export async function probePayGovWsdl(
  agent: https.Agent | undefined,
  headers: Record<string, string> = {},
  timeoutMs: number = WSDL_PROBE_TIMEOUT_MS,
): Promise<WsdlProbeResult> {
  const soapUrl = process.env.SOAP_URL;
  if (!soapUrl) {
    throw new Error("SOAP_URL is not set");
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const result = await fetch(`${soapUrl}?wsdl`, {
      agent,
      headers,
      signal: controller.signal,
    });
    const body = await result.text();
    return { ok: result.ok, latencyMs: Date.now() - startedAt, body };
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Pay.gov WSDL probe timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
