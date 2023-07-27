import * as https from "https";
import * as soap from "soap";
import { InitPayment } from "../useCases/initPayment";
import { ProcessPayment } from "../useCases/processPayment";

export type AppContext = {
  getSoapClient: () => Promise<soap.Client>;
  getHttpsAgent: () => https.Agent;
  postHttpRequest: (appContext: AppContext, body: string) => Promise<any>;
  getUseCases: () => {
    initPayment: InitPayment;
    processPayment: ProcessPayment;
  };
};
