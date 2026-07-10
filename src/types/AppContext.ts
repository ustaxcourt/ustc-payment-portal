import type { GetDetails } from "@useCases/getDetails";
import type { GetRecentTransactions } from "@useCases/getRecentTransactions";
import type { GetTransactionPaymentStatus } from "@useCases/getTransactionPaymentStatus";
import type { GetTransactionsByStatus } from "@useCases/getTransactionsByStatus";
import type { InitPayment } from "@useCases/initPayment";
import type { ProcessPayment } from "@useCases/processPayment";
import type * as https from "https";

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
		getRecentTransactions: GetRecentTransactions;
		getTransactionPaymentStatus: GetTransactionPaymentStatus;
		getTransactionsByStatus: GetTransactionsByStatus;
	};
	logger: AppContextLogger;
};
