import type { CancelExpiredTransactionsResult } from "@useCases/cancelExpiredTransactions";
import { cancelExpiredTransactions } from "@useCases/cancelExpiredTransactions";
import { createAppContext } from "../appContext";

// EventBridge-scheduled, not API Gateway: no request to validate and no HTTP response.
// Throwing lets Lambda record the invocation as failed so the error alarm sees it.
export const cancelExpiredHandler =
  async (): Promise<CancelExpiredTransactionsResult> => {
    const appContext = createAppContext();
    const result = await cancelExpiredTransactions(appContext);

    appContext.logger.info("Cancel sweep complete", result);
    return result;
  };
