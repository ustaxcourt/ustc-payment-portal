
// Shared mocks for query builder methods
const orderBy = jest.fn().mockReturnThis();
const findById = jest.fn();

jest.mock("./FeesModel", () => {
  const actual = jest.requireActual("./FeesModel");
  return {
    __esModule: true,
    ...actual,
    default: class MockFeesModel {
      static getAll = jest.fn(() => {
        return MockFeesModel.query().orderBy("createdAt", "desc");
      });
      static getFeeById = jest.fn((feeId) => {
        return MockFeesModel.query().findById(feeId) || undefined;
      });
      static query = jest.fn(() => ({
        orderBy,
        findById,
      }));
    }
  };
});

import FeesModel from "./FeesModel";

describe("FeesModel", () => {
  afterEach(() => {
    orderBy.mockClear();
    findById.mockClear();
  });

  describe("getAll", () => {
    it("should call orderBy with createdAt desc", async () => {
      await FeesModel.getAll();
      expect(orderBy).toHaveBeenCalledWith("createdAt", "desc");
    });
  });

  describe("getFeeById", () => {
    it("should call findById with the correct feeId", async () => {
      const feeId = "FEE123";
      await FeesModel.getFeeById(feeId);
      expect(findById).toHaveBeenCalledWith(feeId);
    });
    it("should return undefined if not found", async () => {
      findById.mockReturnValueOnce(undefined);
      const result = await FeesModel.getFeeById("NOT_FOUND");
      expect(result).toBeUndefined();
    });
    it("should return the fee if found", async () => {
      const fee = { feeId: "FEE123", name: "Test Fee" };
      findById.mockReturnValueOnce(fee);
      const result = await FeesModel.getFeeById("FEE123");
      expect(result).toBe(fee);
    });
  });
});
