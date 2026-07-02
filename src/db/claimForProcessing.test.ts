import { ConflictError } from "../errors/conflict";
import { GoneError } from "../errors/gone";
import TransactionModel, {
  PROCESSING_CONFLICT_MESSAGE,
} from "./TransactionModel";

const mockTrx = { __trx: true };

jest.mock("./knex", () => ({
  getKnex: jest.fn(),
}));

import { getKnex } from "./knex";

const getKnexMock = getKnex as jest.MockedFunction<typeof getKnex>;

type QueryStep =
  | { kind: "first"; result: TransactionModel | undefined }
  | { kind: "patchAndFetchById"; result: TransactionModel }
  | { kind: "patch"; result: number };

const baseRow = (): TransactionModel =>
  ({
    agencyTrackingId: "agency-001",
    paygovToken: "token-abc",
    clientName: "Test Client",
    transactionReferenceId: "ref-123",
    transactionStatus: "initiated",
    paymentStatus: "pending",
    feeId: "fee-123",
    lastUpdatedAt: new Date().toISOString(),
  }) as TransactionModel;

const buildQueryMock = (steps: QueryStep[]) => {
  let stepIndex = 0;

  const next = () => {
    const step = steps[stepIndex++];
    if (!step) {
      throw new Error(`Unexpected query() call #${stepIndex}`);
    }
    return step;
  };

  const chain: Record<string, jest.Mock> = {
    where: jest.fn(),
    whereIn: jest.fn(),
    whereNot: jest.fn(),
    forUpdate: jest.fn(),
    noWait: jest.fn(),
    first: jest.fn(),
    patch: jest.fn(),
    patchAndFetchById: jest.fn(),
  };

  for (const key of Object.keys(chain)) {
    if (key === "first") {
      chain.first.mockImplementation(async () => {
        const step = next();
        if (step.kind !== "first") {
          throw new Error(`Expected first(), got ${step.kind}`);
        }
        return step.result;
      });
    } else if (key === "patchAndFetchById") {
      chain.patchAndFetchById.mockImplementation(async () => {
        const step = next();
        if (step.kind !== "patchAndFetchById") {
          throw new Error(`Expected patchAndFetchById(), got ${step.kind}`);
        }
        return step.result;
      });
    } else if (key === "patch") {
      const patchChain = {
        where: jest.fn(),
      };
      patchChain.where.mockImplementation(() => ({
        where: patchChain.where,
        then: (
          resolve: (value: number) => void,
          reject?: (reason: unknown) => void,
        ) => {
          try {
            const step = next();
            if (step.kind !== "patch") {
              throw new Error(`Expected patch(), got ${step.kind}`);
            }
            resolve(step.result);
          } catch (err) {
            reject?.(err);
          }
        },
      }));
      chain.patch.mockReturnValue(patchChain);
    } else {
      chain[key].mockReturnValue(chain);
    }
  }

  return chain;
};

beforeEach(() => {
  getKnexMock.mockResolvedValue({
    transaction: (cb: (trx: typeof mockTrx) => Promise<unknown>) => cb(mockTrx),
  } as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("TransactionModel.claimForProcessing", () => {
  it("returns undefined when no row exists for the token", async () => {
    jest
      .spyOn(TransactionModel, "query")
      .mockReturnValue(
        buildQueryMock([{ kind: "first", result: undefined }]) as never,
      );

    await expect(
      TransactionModel.claimForProcessing("missing-token"),
    ).resolves.toBeUndefined();
  });

  it("claims an initiated row by setting status to processing", async () => {
    const row = baseRow();
    const claimed = { ...row, transactionStatus: "processing" } as TransactionModel;

    jest.spyOn(TransactionModel, "query").mockReturnValue(
      buildQueryMock([
        { kind: "first", result: row },
        { kind: "first", result: undefined },
        { kind: "patchAndFetchById", result: claimed },
      ]) as never,
    );

    const result = await TransactionModel.claimForProcessing("token-abc");
    expect(result?.transactionStatus).toBe("processing");
  });

  it("throws GoneError when a sibling is already pending or processed", async () => {
    const row = baseRow();
    const sibling = {
      ...row,
      agencyTrackingId: "agency-002",
      paygovToken: "other-token",
      transactionStatus: "processed",
    } as TransactionModel;

    jest.spyOn(TransactionModel, "query").mockReturnValue(
      buildQueryMock([
        { kind: "first", result: row },
        { kind: "first", result: sibling },
      ]) as never,
    );

    await expect(TransactionModel.claimForProcessing("token-abc")).rejects.toThrow(
      GoneError,
    );
  });

  it("throws ConflictError when the row is already processing (fresh)", async () => {
    const row = {
      ...baseRow(),
      transactionStatus: "processing",
      lastUpdatedAt: new Date().toISOString(),
    } as TransactionModel;

    jest.spyOn(TransactionModel, "query").mockReturnValue(
      buildQueryMock([
        { kind: "first", result: row },
        { kind: "first", result: undefined },
      ]) as never,
    );

    await expect(TransactionModel.claimForProcessing("token-abc")).rejects.toThrow(
      new ConflictError(PROCESSING_CONFLICT_MESSAGE),
    );
  });

  it("releases a stale processing claim and allows the current request to proceed", async () => {
    const staleTime = new Date(Date.now() - 601_000).toISOString();
    const row = {
      ...baseRow(),
      transactionStatus: "processing",
      lastUpdatedAt: staleTime,
    } as TransactionModel;
    const reclaimed = {
      ...row,
      transactionStatus: "processing",
      lastUpdatedAt: new Date().toISOString(),
    } as TransactionModel;

    jest.spyOn(TransactionModel, "query").mockReturnValue(
      buildQueryMock([
        { kind: "first", result: row },
        { kind: "first", result: undefined },
        { kind: "patch", result: 1 },
        { kind: "patchAndFetchById", result: reclaimed },
      ]) as never,
    );

    const result = await TransactionModel.claimForProcessing("token-abc");
    expect(result?.transactionStatus).toBe("processing");
  });

  it("throws GoneError when transaction status is not initiated or processing", async () => {
    const row = {
      ...baseRow(),
      transactionStatus: "failed",
    } as TransactionModel;

    jest.spyOn(TransactionModel, "query").mockReturnValue(
      buildQueryMock([
        { kind: "first", result: row },
        { kind: "first", result: undefined },
      ]) as never,
    );

    await expect(TransactionModel.claimForProcessing("token-abc")).rejects.toThrow(
      GoneError,
    );
  });

  it("propagates Postgres lock-not-available errors from the transaction", async () => {
    getKnexMock.mockResolvedValue({
      transaction: async () => {
        const err = new Error("could not obtain lock on row") as Error & {
          code: string;
        };
        err.code = "55P03";
        throw err;
      },
    } as never);

    await expect(TransactionModel.claimForProcessing("token-abc")).rejects.toMatchObject({
      code: "55P03",
    });
  });
});
