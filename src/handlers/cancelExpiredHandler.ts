import type { CancelExpiredTransactionsResult } from "@useCases/cancelExpiredTransactions";
import { cancelExpiredTransactions } from "@useCases/cancelExpiredTransactions";
import { createAppContext } from "../appContext";

// EventBridge-scheduled, not API Gateway. Throwing lets Lambda record a failed invocation.
export const cancelExpiredHandler =
  async (): Promise<CancelExpiredTransactionsResult> => {
    const appContext = createAppContext();
    const result = await cancelExpiredTransactions(appContext);

    appContext.logger.info("Cancel sweep complete", result);
    return result;
  };
