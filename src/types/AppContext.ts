import * as https from "https";
import { InitPayment } from "@useCases/initPayment";
import { ProcessPayment } from "@useCases/processPayment";
import { GetDetails } from "@useCases/getDetails";
import { GetRevenueSummary } from "@useCases/getRevenueSummary";
import { GetTransactionLog } from "@useCases/getTransactionLog";

export type AppContextLogger = {
  debug: (message: string, additionalFields?: Record<string, unknown>) => void;
  error: (message: string, additionalFields?: Record<string, unknown>) => void;
  info: (message: string, additionalFields?: Record<string, unknown>) => void;
  warn: (message: string, additionalFields?: Record<string, unknown>) => void;
};

export type AppContext = {
  getHttpsAgent: () => Promise<https.Agent | undefined>;
  postHttpRequest: (appContext: AppContext, body: string) => Promise<string>;
  getUseCases: () => {
    initPayment: InitPayment;
    processPayment: ProcessPayment;
    getDetails: GetDetails;
    getRevenueSummary: GetRevenueSummary;
    getTransactionLog: GetTransactionLog;
  };
  logger: AppContextLogger;
};
