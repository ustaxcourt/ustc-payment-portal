import type { PaymentStatus } from "../../../../src/schemas/PaymentStatus.schema";
import type { TransactionStatus } from "../../../../src/schemas/TransactionStatus.schema";

/**
 * A seed row's lifecycle stage. Each stage fixes the (`payment_status`,
 * `transaction_status`) pair and gates which nullable columns are populated,
 * mirroring the transitions in `TransactionModel` / the payment use cases:
 *
 *   received   createReceived            — row inserted, not yet redirected
 *   initiated  updateToInitiated         — Pay.gov token issued, user redirected
 *   processing claimForProcessing        — POST /process holds the token, in flight
 *   settling   updateAfterPayGovResponse — Pay.gov accepted; ACH debit not yet settled
 *   success    updateAfterPayGovResponse — terminal, funds captured/settled
 *   failed     updateToFailed            — terminal, Pay.gov returned a fault
 */
export type Archetype =
  | "received"
  | "initiated"
  | "processing"
  | "settling"
  | "success"
  | "failed";

/** One row as inserted into the `transactions` table (snake_case columns). */
export type TransactionRow = {
  agency_tracking_id: string;
  paygov_tracking_id: string | null;
  fee: string;
  client_name: string;
  transaction_reference_id: string;
  payment_status: PaymentStatus;
  transaction_status: TransactionStatus;
  paygov_token: string | null;
  payment_method: string | null;
  transaction_amount: number;
  transaction_date: string | null;
  payment_date: string | null;
  return_code: number | null;
  return_detail: string | null;
  metadata: Record<string, string>;
  created_at: string;
  last_updated_at: string;
};
