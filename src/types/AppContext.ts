import * as https from "https";
import { InitPayment } from "../useCases/initPayment";
import { ProcessPayment } from "../useCases/processPayment";
import { GetDetails } from "../useCases/getDetails";
import { RecentTransactionsResponse } from "./RecentTransactions";
import {
  TransactionsByStatusPathParams,
  TransactionsByStatusResponse,
} from "./TransactionsByStatus";
import { TransactionPaymentStatusResponse } from "./TransactionPaymentStatus";

export type AppContext = {
  getHttpsAgent: () => Promise<https.Agent | undefined>;
  postHttpRequest: (appContext: AppContext, body: string) => Promise<string>;
  getUseCases: () => {
    initPayment: InitPayment;
    processPayment: ProcessPayment;
    getDetails: GetDetails;
    getRecentTransactions: (
      appContext: AppContext
    ) => Promise<RecentTransactionsResponse>;
    getTransactionPaymentStatus: (
      appContext: AppContext
    ) => Promise<TransactionPaymentStatusResponse>;
    getTransactionsByStatus: (
      appContext: AppContext,
      request: TransactionsByStatusPathParams
    ) => Promise<TransactionsByStatusResponse>;
    isValidPaymentStatus: (paymentStatus: string) => boolean;
  };
};
