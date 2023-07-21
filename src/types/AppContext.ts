import * as https from "https";
import * as soap from "soap";
import { InitPaymentResponse } from "./InitPaymentResponse";
import { InitPaymentRequest } from "./InitPaymentRequest";
import { ProcessPaymentRequest } from "./ProcessPaymentRequest";
import { ProcessPaymentResponse } from "./ProcessPaymentResponse";

export type AppContext = {
  getSoapClient: () => Promise<soap.Client>;
  getHttpsAgent: () => https.Agent;
  postHttpRequest: (appContext: AppContext, body: string) => Promise<any>;
  getUseCases: () => {
    initPayment: (
      appContext: AppContext,
      request: InitPaymentRequest
    ) => Promise<InitPaymentResponse>;
    processPayment: (
      appContext: AppContext,
      request: ProcessPaymentRequest
    ) => Promise<ProcessPaymentResponse>;
  };
};
