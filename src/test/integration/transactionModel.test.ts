import { randomUUID } from "node:crypto";
import { ConflictError } from "@errors/conflict";
import { GoneError } from "@errors/gone";
import { isLocal } from "../../config/appEnv";
import { MAX_TOKEN_AGE_MS } from "../../config/constants";
import { getKnex } from "../../db/knex";
import { getPostgresErrorCode, isUniqueViolation } from "../../db/pgErrors";
import TransactionModel, { PROCESSING_STALE_MS } from "../../db/TransactionModel";

// Pins TransactionModel's ORM-facing behavior against real Postgres so an
// objection upgrade must pass it unedited; see docs/dependency-caveats.md.
const describeIfLocal = isLocal() ? describe : describe.skip;

const CLIENT_NAME = "transaction-model-integration";

const trackingId = () => `TMI${randomUUID().replace(/-/g, "").slice(0, 18)}`;
const token = () => randomUUID().replace(/-/g, "");

const ROW_KEYS = [
  "agencyTrackingId",
  "clientName",
  "createdAt",
  "fee",
  // Not a column: the declared class field is defined on every instance.
  "feeName",
  "lastUpdatedAt",
  "metadata",
  "paygovToken",
  "paygovTrackingId",
  "paymentDate",
  "paymentMethod",
  "paymentStatus",
  "returnCode",
  "returnDetail",
  "transactionAmount",
  "transactionDate",
  "transactionReferenceId",
  "transactionStatus",
];

const createRow = (overrides: Partial<TransactionModel> = {}) =>
  TransactionModel.createReceived({
    agencyTrackingId: trackingId(),
    fee: "PETITION_FILING_FEE",
    clientName: CLIENT_NAME,
    transactionReferenceId: randomUUID(),
    transactionAmount: 60,
    metadata: { docketNumber: "123-26" },
    ...overrides,
  });

const createInitiated = async (overrides: Partial<TransactionModel> = {}) => {
  const row = await createRow(overrides);
  const paygovToken = token();
  await TransactionModel.updateToInitiated(row.agencyTrackingId, paygovToken);
  return { ...row, paygovToken } as TransactionModel & { paygovToken: string };
};

const backdate = async (
  agencyTrackingId: string,
  columns: { createdAt?: number; lastUpdatedAt?: number },
) => {
  const knex = await getKnex();
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  // The set_last_updated_at trigger overwrites any explicit value, so it is
  // bypassed for this one transaction (the local DB user is a superuser).
  await knex.transaction(async (trx) => {
    await trx.raw("set local session_replication_role = replica");
    await trx("transactions")
      .where({ agencyTrackingId })
      .update({
        ...(columns.createdAt !== undefined && {
          createdAt: ago(columns.createdAt),
        }),
        ...(columns.lastUpdatedAt !== undefined && {
          lastUpdatedAt: ago(columns.lastUpdatedAt),
        }),
      });
  });
};

// Parentheses are stripped so a harmless regrouping of the where clause
// (objection 3.7 wraps the id condition) doesn't count as a behavior change.
const captureSql = async <T>(run: () => Promise<T>) => {
  const knex = await getKnex();
  const queries: Array<{ sql: string; txId?: string }> = [];
  const listener = (q: { sql: string; __knexTxId?: string }) =>
    queries.push({ sql: q.sql.replace(/[()]/g, ""), txId: q.__knexTxId });
  knex.on("query", listener);
  try {
    const result = await run();
    return { result, queries };
  } finally {
    knex.removeListener("query", listener);
  }
};

describeIfLocal("TransactionModel against real Postgres", () => {
  afterEach(async () => {
    const knex = await getKnex();
    await knex("transactions").where({ clientName: CLIENT_NAME }).delete();
  });

  afterAll(async () => {
    const knex = await getKnex();
    await knex.destroy();
  });

  describe("createReceived", () => {
    it("returns the full camelCase row with a numeric amount", async () => {
      const row = await createRow();

      expect(Object.keys(row).sort()).toEqual(ROW_KEYS);
      expect(row.transactionAmount).toBe(60);
      expect(row.paymentStatus).toBe("pending");
      expect(row.transactionStatus).toBe("received");
    });

    it("stores and returns metadata keys unchanged", async () => {
      const row = await createRow({
        metadata: { docketNumber: "123-26", nested_key: "x" },
      });

      expect(row.metadata).toEqual({ docketNumber: "123-26", nested_key: "x" });

      const knex = await getKnex();
      const stored = await knex.raw<{ rows: Array<{ metadata: string }> }>(
        "select metadata::text as metadata from transactions where agency_tracking_id = ?",
        [row.agencyTrackingId],
      );
      expect(JSON.parse(stored.rows[0].metadata)).toEqual({
        docketNumber: "123-26",
        nested_key: "x",
      });
    });

    it("rejects a second active row with a recognizable unique violation", async () => {
      const row = await createRow();

      const err = await createRow({
        transactionReferenceId: row.transactionReferenceId,
      }).catch((e: unknown) => e);

      expect(isUniqueViolation(err)).toBe(true);
    });
  });

  describe("lookups", () => {
    it("finds an initiated row by token and by reference id", async () => {
      const row = await createInitiated();

      const byToken = await TransactionModel.findByPaygovToken(row.paygovToken);
      const byRef = await TransactionModel.findByReferenceId(
        row.transactionReferenceId,
      );

      expect(byToken?.agencyTrackingId).toBe(row.agencyTrackingId);
      expect(byToken?.transactionStatus).toBe("initiated");
      expect(byToken?.transactionAmount).toBe(60);
      expect(byRef.map((r) => r.agencyTrackingId)).toEqual([
        row.agencyTrackingId,
      ]);
    });

    it("filters the transaction log by metadata and counts the total", async () => {
      const docketNumber = `TMI-${randomUUID().slice(0, 8)}`;
      const row = await createRow({ metadata: { docketNumber } });

      const result = await TransactionModel.queryLog({
        from: new Date(Date.now() - 60_000),
        to: new Date(Date.now() + 60_000),
        metadataSearch: { key: "docketNumber", value: docketNumber },
        sort: "createdAt",
        order: "desc",
        limit: 10,
        offset: 0,
      });

      expect(result.total).toBe(1);
      expect(result.rows.map((r) => r.agencyTrackingId)).toEqual([
        row.agencyTrackingId,
      ]);
      expect(result.rows[0].metadata).toEqual({ docketNumber });
    });
  });

  describe("claimForProcessing", () => {
    it("claims an initiated row inside one transaction and returns it refreshed", async () => {
      const row = await createInitiated();
      await backdate(row.agencyTrackingId, { lastUpdatedAt: 60_000 });
      const before = await TransactionModel.findByPaygovToken(row.paygovToken);

      const { result, queries } = await captureSql(() =>
        TransactionModel.claimForProcessing(row.paygovToken),
      );

      expect(Object.keys(result ?? {}).sort()).toEqual(ROW_KEYS);
      expect(result?.transactionStatus).toBe("processing");
      expect(result?.transactionAmount).toBe(60);
      expect(new Date(result?.lastUpdatedAt ?? 0).getTime()).toBeGreaterThan(
        new Date(before?.lastUpdatedAt ?? 0).getTime(),
      );

      const statements = queries.map((q) => q.sql);
      expect(statements).toEqual([
        "BEGIN;",
        'select "transactions".* from "transactions" where "paygov_token" = $1 for update nowait',
        'select "transactions".* from "transactions" where "transaction_status" in $1, $2 and "client_name" = $3 and "transaction_reference_id" = $4 and not "paygov_token" = $5 order by "created_at" asc',
        'update "transactions" set "transaction_status" = $1 where "transactions"."agency_tracking_id" = $2',
        'select "transactions".* from "transactions" where "transactions"."agency_tracking_id" = $1',
        "COMMIT;",
      ]);
      const txIds = new Set(queries.map((q) => q.txId));
      expect(txIds.size).toBe(1);
      expect([...txIds][0]).toBeDefined();
    });

    it("returns undefined for an unknown token", async () => {
      await expect(
        TransactionModel.claimForProcessing(token()),
      ).resolves.toBeUndefined();
    });

    it("rejects an old token with Gone once a retry of the obligation paid", async () => {
      const abandoned = await createInitiated();
      await TransactionModel.updateToCancelled(abandoned.agencyTrackingId);
      const paid = await createInitiated({
        transactionReferenceId: abandoned.transactionReferenceId,
      });
      await TransactionModel.updateAfterPayGovResponse(
        paid.agencyTrackingId,
        "PG-TMI-1",
        "processed",
        "success",
        "plastic_card",
        undefined,
        undefined,
      );

      const err = await TransactionModel.claimForProcessing(
        abandoned.paygovToken,
      ).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(GoneError);
      expect((err as GoneError).message).toMatch(/Another transaction/);
    });

    it("rejects with Conflict while another claim is in flight", async () => {
      const row = await createInitiated();
      await TransactionModel.claimForProcessing(row.paygovToken);

      await expect(
        TransactionModel.claimForProcessing(row.paygovToken),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("reclaims a stale processing row", async () => {
      const row = await createInitiated();
      await TransactionModel.claimForProcessing(row.paygovToken);
      await backdate(row.agencyTrackingId, {
        lastUpdatedAt: PROCESSING_STALE_MS + 60_000,
      });

      const reclaimed = await TransactionModel.claimForProcessing(
        row.paygovToken,
      );

      expect(reclaimed?.transactionStatus).toBe("processing");
    });

    it("rejects with Gone once the token has expired", async () => {
      const row = await createInitiated();
      await backdate(row.agencyTrackingId, {
        createdAt: MAX_TOKEN_AGE_MS + 60_000,
      });

      await expect(
        TransactionModel.claimForProcessing(row.paygovToken),
      ).rejects.toBeInstanceOf(GoneError);
    });

    it("fails fast with lock-not-available when the row is already locked", async () => {
      const row = await createInitiated();
      const knex = await getKnex();
      const holder = await knex.transaction();

      try {
        await holder("transactions")
          .where({ agencyTrackingId: row.agencyTrackingId })
          .forUpdate();

        const err = await TransactionModel.claimForProcessing(
          row.paygovToken,
        ).catch((e: unknown) => e);

        expect(getPostgresErrorCode(err)).toBe("55P03");
      } finally {
        await holder.rollback();
      }
    });
  });

  describe("updateAfterPayGovResponse", () => {
    it("patches and refetches by id when no status is expected", async () => {
      const row = await createInitiated();

      const { result, queries } = await captureSql(() =>
        TransactionModel.updateAfterPayGovResponse(
          row.agencyTrackingId,
          "PG-TMI-2",
          "processed",
          "success",
          "ach",
          "2026-11-13",
          undefined,
        ),
      );

      expect(Object.keys(result).sort()).toEqual(ROW_KEYS);
      expect(result).toMatchObject({
        paygovTrackingId: "PG-TMI-2",
        transactionStatus: "processed",
        paymentStatus: "success",
        paymentMethod: "ach",
        transactionAmount: 60,
      });
      expect(queries.map((q) => q.sql)).toEqual([
        'update "transactions" set "paygov_tracking_id" = $1, "payment_status" = $2, "transaction_status" = $3, "payment_method" = $4, "transaction_date" = $5 where "transactions"."agency_tracking_id" = $6',
        'select "transactions".* from "transactions" where "transactions"."agency_tracking_id" = $1',
      ]);
    });

    it("patches with returning when the expected status matches", async () => {
      const row = await createInitiated();
      await TransactionModel.claimForProcessing(row.paygovToken);

      const result = await TransactionModel.updateAfterPayGovResponse(
        row.agencyTrackingId,
        "PG-TMI-3",
        "failed",
        "failed",
        "plastic_card",
        undefined,
        undefined,
        "processing",
      );

      expect(Object.keys(result).sort()).toEqual(ROW_KEYS);
      expect(result.transactionStatus).toBe("failed");
      expect(result.transactionAmount).toBe(60);
    });

    it("rejects with Conflict when the expected status no longer matches", async () => {
      const row = await createInitiated();

      await expect(
        TransactionModel.updateAfterPayGovResponse(
          row.agencyTrackingId,
          "PG-TMI-4",
          "processed",
          "success",
          "plastic_card",
          undefined,
          undefined,
          "processing",
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  it("updateToFailed returns the patched row", async () => {
    const row = await createInitiated();

    const result = await TransactionModel.updateToFailed(
      row.agencyTrackingId,
      3001,
      "declined",
    );

    expect(result).toMatchObject({
      agencyTrackingId: row.agencyTrackingId,
      transactionStatus: "failed",
      paymentStatus: "failed",
      returnCode: 3001,
      returnDetail: "declined",
    });
  });

  it("cancelExpiredBatch returns the ids it cancelled", async () => {
    const row = await createInitiated();
    await backdate(row.agencyTrackingId, {
      createdAt: MAX_TOKEN_AGE_MS + 60_000,
    });

    const cancelled = await TransactionModel.cancelExpiredBatch(100);

    expect(cancelled).toContain(row.agencyTrackingId);
    expect(cancelled.every((id) => typeof id === "string")).toBe(true);
  });
});
