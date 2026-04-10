/**
 * Section F — DB-exercising integration tests (PAY-271).
 *
 * These tests verify:
 *   1. The correct migration has been applied (schema matches expectations).
 *   2. Seeded data is present and queryable through the dashboard API endpoints.
 *   3. The PR database is isolated (scoped to TEST_NAMESPACE).
 *
 * Dashboard endpoints (/transactions, /transactions/{paymentStatus},
 * /transaction-payment-status) are public (authorization = NONE) — no SigV4
 * signing is required.
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

const TOTAL_SEEDED_ROWS = 270; // 200 success + 50 failed + 20 pending from 02_dummy_data.ts

const baseUrl = process.env.BASE_URL;
const isDeployed =
  !!baseUrl &&
  baseUrl.startsWith("https://") &&
  process.env.NODE_ENV !== "local";

// Skip the entire suite when not running against a deployed environment.
const describeIfDeployed = isDeployed ? describe : describe.skip;

describeIfDeployed("database migration and seed verification", () => {
  // ── GET /transactions ─────────────────────────────────────────────────────
  describe("GET /transactions (all seeded data)", () => {
    let body: { data: Record<string, unknown>[]; total: number };

    beforeAll(async () => {
      const response = await fetch(`${baseUrl}/transactions`);
      if (!response.ok) {
        throw new Error(`GET /transactions failed: ${response.status} ${await response.text()}`);
      }
      body = (await response.json()) as typeof body;
    });

    it("should return a capped page of results", () => {
      expect(body.total).toBeGreaterThan(0);
      expect(body.total).toBeLessThanOrEqual(100);
      expect(body.data).toHaveLength(body.total);
    });

    it("should return transactions with the correct schema shape", () => {
      const row = body.data[0];

      // Columns from 20260305195503_init_db migration
      expect(row).toHaveProperty("agencyTrackingId");
      expect(row).toHaveProperty("transactionReferenceId");
      expect(row).toHaveProperty("feeName");
      expect(row).toHaveProperty("feeId");
      expect(row).toHaveProperty("transactionAmount");
      expect(row).toHaveProperty("clientName");
      expect(row).toHaveProperty("paymentStatus");
      expect(row).toHaveProperty("transactionStatus");
      expect(row).toHaveProperty("paymentMethod");
      expect(row).toHaveProperty("createdAt");
      expect(row).toHaveProperty("lastUpdatedAt");
    });

    it("should contain only valid payment statuses", () => {
      const validStatuses = ["success", "failed", "pending"];
      for (const row of body.data) {
        expect(validStatuses).toContain(row.paymentStatus);
      }
    });

    it("should contain only valid fee IDs from the seed data", () => {
      const validFeeIds = [
        "PETITION_FILING_FEE",
        "NONATTORNEY_EXAM_REGISTRATION_FEE",
      ];
      for (const row of body.data) {
        expect(validFeeIds).toContain(row.feeId);
      }
    });

    it("should have non-negative fee amounts", () => {
      for (const row of body.data) {
        expect(Number(row.transactionAmount)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── GET /transactions/{paymentStatus} ─────────────────────────────────────
  describe("GET /transactions/{paymentStatus} (filtered queries)", () => {
    it.each(["pending", "success", "failed"])(
      "should return rows for payment status '%s'",
      async (status) => {
        const response = await fetch(
          `${baseUrl}/transactions/${status}`,
        );
        expect(response.status).toBe(200);

        const body = (await response.json()) as {
          data: Record<string, unknown>[];
          total: number;
        };

        // Seeds create a realistic distribution — each status has > 0 rows.
        expect(body.total).toBeGreaterThan(0);
        expect(body.data).toHaveLength(body.total);

        // Every returned row must have the requested payment status.
        for (const row of body.data) {
          expect(row.paymentStatus).toBe(status);
        }
      },
    );

    it("should reject an invalid payment status with 400", async () => {
      const response = await fetch(
        `${baseUrl}/transactions/nonexistent`,
      );
      expect(response.status).toBe(400);
    });
  });

  // ── GET /transaction-payment-status ───────────────────────────────────────
  describe("GET /transaction-payment-status (aggregated counts)", () => {
    it("should return status counts that include the seeded total", async () => {
      const response = await fetch(
        `${baseUrl}/transaction-payment-status`,
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        pending: number;
        success: number;
        failed: number;
        total: number;
      };

      expect(body).toHaveProperty("pending");
      expect(body).toHaveProperty("success");
      expect(body).toHaveProperty("failed");
      expect(body).toHaveProperty("total");

      expect(body.total).toBeGreaterThanOrEqual(TOTAL_SEEDED_ROWS);
      expect(body.pending + body.success + body.failed).toBe(body.total);
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
