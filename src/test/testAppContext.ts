import { AppContext } from "../types/AppContext";
import { createRequestLogger } from "../utils/logger";

export const testAppContext: AppContext = {
  getHttpsAgent: jest.fn(),
  postHttpRequest: jest.fn(),
  getUseCases: () => ({
    initPayment: jest.fn(),
    processPayment: jest.fn(),
    getDetails: jest.fn(),
    getRecentTransactions: jest.fn(),
    getTransactionPaymentStatus: jest.fn(),
    getTransactionsByStatus: jest.fn(),
  }),
  logger: (context = {}) => createRequestLogger(context),
};
