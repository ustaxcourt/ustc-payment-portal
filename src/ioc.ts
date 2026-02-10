import { PaymentController } from "./controllers/paymentController";

// Simple IoC container for tsoa
// Maps controller names to their instances
const iocContainer = {
  get<T>(controller: { prototype: T }): T {
    // For now, just create new instances
    // In a more complex app, you might use a DI framework
    if (controller.prototype instanceof PaymentController || controller === PaymentController as any) {
      return new PaymentController() as unknown as T;
    }
    throw new Error(`Unknown controller: ${controller}`);
  },
};

export { iocContainer };
