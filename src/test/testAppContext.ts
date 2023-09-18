import { AppContext } from "../types/AppContext";

export const testAppContext: AppContext = {
  getHttpsAgent: jest.fn(),
  postHttpRequest: jest.fn(),
  getUseCases: () => ({
    initPayment: jest.fn(),
    processPayment: jest.fn(),
    getDetails: jest.fn(),
  }),
};
