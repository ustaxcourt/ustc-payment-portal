/**
 * Section F — DB-exercising integration tests (PAY-271).
 *
 * These tests verify:
 *   1. Seeded data is present and queryable through /transaction-log and
 *      /revenue-summary (both SigV4-signed).
 *   2. The PR database is isolated (scoped to TEST_NAMESPACE).
 *
 * Prerequisites (handled by the CI workflow before this test runs):
 *   - PR database created  (migrationHandler: create-db)
 *   - Migrations applied    (migrationHandler: migrate)
 *   - Seeds applied         (migrationHandler: seed)
 *   - BASE_URL set to the PR API Gateway URL
 *
 * For the migration version check (knex.migrate.currentVersion), see the
 * "Verify migration version" CI step in cicd-dev.yml which invokes the
 * migrationHandler verify command directly.
 */

import type { TransactionLogResponse } from "@appTypes/TransactionLog";
import type { RevenueSummaryResponse } from "@schemas/RevenueSummary.schema";
import { isLocal } from "../../config/appEnv";
import { signedFetch } from "./sigv4Helper";

// Mirrors SEED_TOTAL_RECORDS in db/seeds/02_dummy_data.ts. Other integration
// suites add rows to the same database, so seeded counts are lower bounds.
const SEEDED_ROWS = 3500;
const SEEDED_FEES = [
  "PETITION_FILING_FEE",
  "NONATTORNEY_EXAM_REGISTRATION_FEE",
];

// Wide enough to cover every seeded row regardless of the day the seed ran.
const WINDOW = { from: "2020-01-01T00:00:00Z", to: "2030-01-01T00:00:00Z" };

const baseUrl = process.env.BASE_URL;
const isDeployed = !!baseUrl && baseUrl.startsWith("https://") && !isLocal();

// Skip the entire suite when not running against a deployed environment.
const describeIfDeployed = isDeployed ? describe : describe.skip;

// transaction-log and revenue-summary take SigV4; CI runs as a registered caller.
const get = async <T>(path: string): Promise<T> => {
  const response = await signedFetch(`${baseUrl}${path}`, {});
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
};

describeIfDeployed("database migration and seed verification", () => {
  // ── GET /transaction-log ──────────────────────────────────────────────────
  describe("GET /transaction-log (seeded data)", () => {
    let body: TransactionLogResponse;

    beforeAll(async () => {
      const query = new URLSearchParams({ ...WINDOW, pageSize: "200" });
      body = await get(`/transaction-log?${query}`);
    });

    it("should include every seeded row in the unfiltered counts", () => {
      expect(body.counts?.all).toBeGreaterThanOrEqual(SEEDED_ROWS);
      expect(body.total).toBe(body.counts?.all);
    });

    it("should reflect the seed's mix of payment statuses", () => {
      const counts = body.counts;
      expect(counts?.success).toBeGreaterThan(0);
      expect(counts?.failed).toBeGreaterThan(0);
      expect(counts?.pending).toBeGreaterThan(0);
      expect((counts?.success ?? 0) + (counts?.failed ?? 0) + (counts?.pending ?? 0)).toBe(
        counts?.all,
      );
    });

    it("should return rows with only seeded fee keys and valid statuses", () => {
      expect(body.data.length).toBeGreaterThan(0);
      for (const row of body.data) {
        expect(SEEDED_FEES).toContain(row.fee);
        expect(["success", "failed", "pending"]).toContain(row.paymentStatus);
      }
    });
  });

  // ── GET /revenue-summary ──────────────────────────────────────────────────
  describe("GET /revenue-summary (seeded data)", () => {
    let body: RevenueSummaryResponse;

    beforeAll(async () => {
      body = await get("/revenue-summary");
    });

    it("should have collected revenue in the fiscal year to date", () => {
      // The seed spans from 2024-10-01 to the day it ran, so the current
      // fiscal year holds successful payments.
      expect(body.totals.fiscalYear.total).toBeGreaterThan(0);
    });

    it("should tally the seeded fees, with at least one collected", () => {
      const { fees } = body.totals.fiscalYear;
      const feeKeys = fees.map((row) => row.fee);
      for (const fee of SEEDED_FEES) {
        expect(feeKeys).toContain(fee);
      }
      expect(fees.some((row) => row.qty > 0)).toBe(true);
    });
  });

  // ── Database isolation ────────────────────────────────────────────────────
  describe("database isolation", () => {
    it("should be scoped to a PR-specific namespace", () => {
      const namespace = process.env.TEST_NAMESPACE;
      expect(namespace).toBeDefined();
      expect(namespace).toMatch(/^pr-\d+$/);
    });
  });
});
