export const testAppContext = {
  getHttpsAgent: jest.fn(),
  postHttpRequest: jest.fn(),
  getUseCases: () => ({
    initPayment: jest.fn(),
    processPayment: jest.fn(),
  })
}