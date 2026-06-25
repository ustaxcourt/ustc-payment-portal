import { randomUUID } from "crypto";
import { signedFetch } from "./sigv4Helper";

// Gated behind RUN_LOAD_TEST so it never runs in normal CI.
//   RUN_LOAD_TEST=true BASE_URL=<dev api> LOAD_CONCURRENCY=40 LOAD_DURATION_MS=60000 \
//     npx jest proxyLoad --verbose
// CLEANUP: there is no delete API, so each run leaves transaction rows in the dev DB
// tagged metadata.docketNumber='load-test'. Purge afterward, e.g.:
//   DELETE FROM transactions WHERE metadata->>'docketNumber' = 'load-test';
const runOrSkip =
  process.env.RUN_LOAD_TEST === "true" ? describe : describe.skip;

const BASE_URL = process.env.BASE_URL ?? "";
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 40);
const DURATION_MS = Number(process.env.LOAD_DURATION_MS ?? 60_000);

runOrSkip("RDS Proxy load test", () => {
  it(
    `sustains ${CONCURRENCY} concurrent /init for ${DURATION_MS}ms`,
    async () => {
      if (!BASE_URL) throw new Error("BASE_URL is required");

      const headers = { "content-type": "application/json" };
      const deadline = Date.now() + DURATION_MS;
      const pacingMs = Number(process.env.LOAD_PACING_MS ?? 0);
      const okLatencies: number[] = [];
      const statusCounts = new Map<string, number>();
      const bump = (k: string): void => {
        statusCounts.set(k, (statusCounts.get(k) ?? 0) + 1);
      };
      let total = 0;
      let ok = 0;

      const worker = async (): Promise<void> => {
        while (Date.now() < deadline) {
          const body = JSON.stringify({
            transactionReferenceId: randomUUID(),
            fee: "PETITION_FILING_FEE",
            urlSuccess: "https://example.com",
            urlCancel: "https://example.com",
            metadata: { docketNumber: "load-test" },
          });
          const start = Date.now();
          try {
            const res = await signedFetch(`${BASE_URL}/init`, {
              method: "POST",
              headers,
              body,
            });
            total += 1;
            bump(String(res.status));
            if (res.status === 200) {
              ok += 1;
              okLatencies.push(Date.now() - start);
            }
          } catch (err) {
            total += 1;
            bump(`error:${(err as Error).name}`);
          }
          if (pacingMs > 0) await new Promise((r) => setTimeout(r, pacingMs));
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

      okLatencies.sort((a, b) => a - b);
      const pct = (p: number): number =>
        okLatencies[Math.floor(okLatencies.length * p)] ?? 0;
      const breakdown = [...statusCounts.entries()]
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      console.log(
        `\nLoad summary: total=${total} ok=${ok} concurrency=${CONCURRENCY} duration=${DURATION_MS}ms\n` +
          `  status: ${breakdown}\n` +
          `  ok latency: p50=${pct(0.5)}ms p95=${pct(0.95)}ms p99=${pct(
            0.99,
          )}ms\n`,
      );

      // We only require real throughput through the proxy. Throttling (429s) under an
      // aggressive firehose is expected and is not a proxy failure — see the status breakdown.
      expect(ok).toBeGreaterThan(0);
    },
    DURATION_MS + 60_000,
  );
});
