/**
 * Request body for initializing a payment
 * @example {
 *   "trackingId": "TRK-12345",
 *   "amount": 150.00,
 *   "appId": "USTC_APP",
 *   "urlSuccess": "https://example.com/success",
 *   "urlCancel": "https://example.com/cancel"
 * }
 */
export interface InitPaymentRequest {
  /**
   * Unique identifier for tracking the payment
   * @example "TRK-12345"
   */
  trackingId: string;

  /**
   * Payment amount in dollars
   * @example 150.00
   * @minimum 0.01
   */
  amount: number;

  /**
   * The TCS application ID
   * @example "USTC_APP"
   */
  appId: string;

  /**
   * URL to redirect to after successful payment
   * @example "https://example.com/success"
   */
  urlSuccess: string;

  /**
   * URL to redirect to if payment is cancelled
   * @example "https://example.com/cancel"
   */
  urlCancel: string;
}

/**
 * Response from payment initialization
 */
export interface InitPaymentResponse {
  /**
   * Payment token for the initiated transaction
   * @example "abc123token"
   */
  token: string;

  /**
   * URL to redirect the user to complete payment on Pay.gov
   * @example "https://pay.gov/payment?token=abc123token&tcsAppID=USTC_APP"
   */
  paymentRedirect: string;
}

/**
 * Request body for processing a payment
 * @example {
 *   "appId": "USTC_APP",
 *   "token": "abc123token"
 * }
 */
export interface ProcessPaymentRequest {
  /**
   * The TCS application ID
   * @example "USTC_APP"
   */
  appId: string;

  /**
   * Payment token received from init payment
   * @example "abc123token"
   */
  token: string;
}

/**
 * The current status of the transaction
 */
export type TransactionStatus = "Success" | "Failed" | "Pending";

/**
 * Successful payment processing response
 */
export interface SuccessfulProcessPaymentResponse {
  /**
   * The Pay.gov tracking ID for the transaction
   * @example "PAYGOV-789"
   */
  trackingId: string;

  /**
   * The current status of the transaction
   * @example "Success"
   */
  transactionStatus: TransactionStatus;
}

/**
 * Failed payment processing response
 */
export interface FailedProcessPaymentResponse {
  /**
   * The transaction status (always "Failed" for this response type)
   */
  transactionStatus: "Failed";

  /**
   * Error message if payment failed
   * @example "Card declined"
   */
  message?: string;

  /**
   * Error code if payment failed
   * @example 4001
   */
  code?: number;
}

/**
 * Response from payment processing
 */
export type ProcessPaymentResponse =
  | SuccessfulProcessPaymentResponse
  | FailedProcessPaymentResponse;

/**
 * Request parameters for getting transaction details
 */
export interface GetDetailsRequest {
  /**
   * The TCS application ID
   * @example "USTC_APP"
   */
  appId: string;

  /**
   * The Pay.gov tracking ID
   * @example "PAYGOV-789"
   */
  payGovTrackingId: string;
}

/**
 * Response containing transaction details
 */
export interface GetDetailsResponse {
  /**
   * The Pay.gov tracking ID
   * @example "PAYGOV-789"
   */
  trackingId: string;

  /**
   * The current status of the transaction
   * @example "Success"
   */
  transactionStatus: TransactionStatus;
}

/**
 * Error response
 */
export interface ErrorResponse {
  /**
   * HTTP status code
   * @example 400
   */
  statusCode: number;

  /**
   * Error message
   * @example "Invalid request payload"
   */
  message: string;
}
