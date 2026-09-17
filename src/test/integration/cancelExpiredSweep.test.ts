import { randomUUID } from "crypto";
import { isLocal } from "../../config/appEnv";
import { getKnex } from "../../db/knex";
import TransactionModel from "../../db/TransactionModel";
import { cancelExpiredTransactions } from "../../useCases/cancelExpiredTransactions";
import { testAppContext } from "../testAppContext";

const describeIfLocal = isLocal() ? describe : describe.skip;

const CLIENT_NAME = "cancel-sweep-integration";

const trackingId = () => `SWP${randomUUID().replace(/-/g, "").slice(0, 18)}`;

type Seed = {
  agencyTrackingId: string;
  transactionStatus: string;
  ageHours: number;
};

const seedRow = async ({
  agencyTrackingId,
  transactionStatus,
  ageHours,
}: Seed) => {
  const knex = await getKnex();
  const at = new Date(Date.now() - ageHours * 60 * 60 * 1000).toISOString();

  await knex("transactions").insert({
    agencyTrackingId,
    fee: "PETITION_FILING_FEE",
    clientName: CLIENT_NAME,
    transactionReferenceId: randomUUID(),
    paymentStatus: "pending",
    transactionStatus,
    transactionAmount: 60,
    createdAt: at,
    lastUpdatedAt: at,
  });

  return at;
};

const readRow = async (agencyTrackingId: string) => {
  const knex = await getKnex();
  const [row] = await knex("transactions")
    .select("transactionStatus", "paymentStatus", "lastUpdatedAt")
    .where({ agencyTrackingId });
  return row as {
    transactionStatus: string;
    paymentStatus: string;
    lastUpdatedAt: Date;
  };
};

describeIfLocal("cancellation sweep against real Postgres", () => {
  afterEach(async () => {
    const knex = await getKnex();
    await knex("transactions").where({ clientName: CLIENT_NAME }).delete();
  });

  afterAll(async () => {
    const knex = await getKnex();
    await knex.destroy();
  });

  it("cancels an abandoned attempt without moving last_updated_at", async () => {
    const id = trackingId();
    const seededAt = await seedRow({
      agencyTrackingId: id,
      transactionStatus: "initiated",
      ageHours: 4,
    });

    const result = await cancelExpiredTransactions(testAppContext);

    const row = await readRow(id);
    expect(row.transactionStatus).toBe("cancelled");
    expect(row.paymentStatus).toBe("failed");
    expect(result.cancelledCount).toBeGreaterThanOrEqual(1);

    expect(new Date(row.lastUpdatedAt).toISOString()).toBe(
      new Date(seededAt).toISOString(),
    );
  });

  it.each([
    ["an initiated attempt inside the TTL", "initiated", 1],
    ["a processing attempt past the TTL", "processing", 4],
  ])("leaves %s alone", async (_label, transactionStatus, ageHours) => {
    const id = trackingId();
    const seededAt = await seedRow({
      agencyTrackingId: id,
      transactionStatus,
      ageHours,
    });

    await cancelExpiredTransactions(testAppContext);

    const row = await readRow(id);
    expect(row.transactionStatus).toBe(transactionStatus);
    expect(row.paymentStatus).toBe("pending");
    expect(new Date(row.lastUpdatedAt).toISOString()).toBe(
      new Date(seededAt).toISOString(),
    );
  });

  it("advances last_updated_at on a later edit to an already-cancelled row", async () => {
    const id = trackingId();
    const seededAt = await seedRow({
      agencyTrackingId: id,
      transactionStatus: "initiated",
      ageHours: 4,
    });

    await cancelExpiredTransactions(testAppContext);

    const knex = await getKnex();
    await knex("transactions")
      .where({ agencyTrackingId: id })
      .update({ returnDetail: "manual correction" });

    const row = await readRow(id);
    expect(new Date(row.lastUpdatedAt).getTime()).toBeGreaterThan(
      new Date(seededAt).getTime(),
    );
  });

  it("is a no-op when nothing has expired", async () => {
    await cancelExpiredTransactions(testAppContext);

    await seedRow({
      agencyTrackingId: trackingId(),
      transactionStatus: "initiated",
      ageHours: 1,
    });

    const result = await cancelExpiredTransactions(testAppContext);

    expect(result.cancelledCount).toBe(0);
  });

  it("preserves last_updated_at through updateToCancelled as well", async () => {
    const id = trackingId();
    const seededAt = await seedRow({
      agencyTrackingId: id,
      transactionStatus: "initiated",
      ageHours: 1,
    });

    await TransactionModel.updateToCancelled(id);

    const row = await readRow(id);
    expect(row.transactionStatus).toBe("cancelled");
    expect(row.paymentStatus).toBe("failed");
    expect(new Date(row.lastUpdatedAt).toISOString()).toBe(
      new Date(seededAt).toISOString(),
    );
  });
});
