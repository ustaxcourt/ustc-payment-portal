import * as https from "https";
import { InitPayment } from "../useCases/initPayment";
import { ProcessPayment } from "../useCases/processPayment";
import { GetDetails } from "../useCases/getDetails";
import { GetRecentTransactions } from "../useCases/getRecentTransactions";
import { GetTransactionPaymentStatus } from "../useCases/getTransactionPaymentStatus";
import { GetTransactionsByStatus } from "../useCases/getTransactionsByStatus";

export type AppContext = {
  getHttpsAgent: () => Promise<https.Agent | undefined>;
  postHttpRequest: (appContext: AppContext, body: string) => Promise<string>;
  getUseCases: () => {
    initPayment: InitPayment;
    processPayment: ProcessPayment;
    getDetails: GetDetails;
    getRecentTransactions: GetRecentTransactions;
    getTransactionPaymentStatus: GetTransactionPaymentStatus;
    getTransactionsByStatus: GetTransactionsByStatus;
  };
};
