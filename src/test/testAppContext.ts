import type { AppContext } from "@appTypes/AppContext";

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
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
};

