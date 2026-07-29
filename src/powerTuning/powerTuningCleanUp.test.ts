jest.mock("../db/knex", () => ({ getKnex: jest.fn() }));

import { getKnex } from "../db/knex";
import { handler, powerTuningCleanUp } from "./powerTuningCleanUp";

const mockGetKnex = getKnex as jest.MockedFunction<typeof getKnex>;
const mockRaw = jest.fn();

describe("powerTuningCleanUp", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetKnex.mockResolvedValue({ raw: mockRaw } as never);
  });

  it("throws when preserveReferenceIds is not provided", async () => {
    await expect(powerTuningCleanUp()).rejects.toThrow(
      "powerTuningCleanUp requires a non-empty preserveReferenceIds array",
    );
    expect(mockRaw).not.toHaveBeenCalled();
  });

  it("throws when preserveReferenceIds is an empty array", async () => {
    await expect(
      powerTuningCleanUp({ preserveReferenceIds: [] }),
    ).rejects.toThrow(
      "powerTuningCleanUp requires a non-empty preserveReferenceIds array",
    );
    expect(mockRaw).not.toHaveBeenCalled();
  });

  it("deletes power-tuning transactions except the preserved reference IDs", async () => {
    mockRaw.mockResolvedValueOnce({
      rows: [
        { transaction_reference_id: "aaa" },
        { transaction_reference_id: "bbb" },
      ],
    });

    const result = await powerTuningCleanUp({
      preserveReferenceIds: ["keep-me"],
    });

    expect(mockRaw).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM transactions"),
      ["power-tuning", "keep-me"],
    );
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ deletedCount: 2 }),
    });
  });

  it("supports multiple preserved reference IDs", async () => {
    mockRaw.mockResolvedValueOnce({ rows: [] });

    await powerTuningCleanUp({ preserveReferenceIds: ["keep-1", "keep-2"] });

    expect(mockRaw).toHaveBeenCalledWith(
      expect.stringContaining("NOT IN (?, ?)"),
      ["power-tuning", "keep-1", "keep-2"],
    );
  });

  it("propagates errors from the delete query", async () => {
    mockRaw.mockRejectedValueOnce(new Error("boom"));

    await expect(
      powerTuningCleanUp({ preserveReferenceIds: ["keep-me"] }),
    ).rejects.toThrow("boom");
  });

  it("exports handler as an alias for powerTuningCleanUp", () => {
    expect(handler).toBe(powerTuningCleanUp);
  });
});
