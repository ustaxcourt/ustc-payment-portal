import { initPayment } from "./useCases/initPayment";
import { AppContext } from "./types/AppContext";

export const createAppContext = (): AppContext => {
  return {
    getUseCases: () => ({
      initPayment,
    }),
  };
};
