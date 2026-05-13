import { AppContext } from "../types/AppContext";
const mockPortalLogger = {
  addUser: jest.fn(),
  addContext: jest.fn(),
  getContext: jest.fn(() => ({})),
  clearContext: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

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
  logger: mockPortalLogger,
};
