import { IocContainer } from "tsoa";
import { PaymentController } from "./controllers/paymentController";

// Simple IoC container for tsoa
const iocContainer: IocContainer = {
  get<T>(controller: new () => T): T {
    // For now, just create new instances
    // In a more complex app, you might use a DI framework like tsyringe
    return new controller();
  },
};

export { iocContainer };
