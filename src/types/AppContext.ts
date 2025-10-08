import * as https from "https";
import { InitPayment } from "../useCases/initPayment";
import { ProcessPayment } from "../useCases/processPayment";
import { GetDetails } from "../useCases/getDetails";

export type AppContext = {
  getHttpsAgent: () => Promise<https.Agent>;
  postHttpRequest: (appContext: AppContext, body: string) => Promise<string>;
  getUseCases: () => {
    initPayment: InitPayment;
    processPayment: ProcessPayment;
    getDetails: GetDetails;
  };
};
