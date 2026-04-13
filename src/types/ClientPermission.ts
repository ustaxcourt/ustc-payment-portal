/**
 * Represents a client's permissions for accessing the Payment Portal.
 * Stored in Secrets Manager as a JSON array.
 */
export type ClientPermission = {
  /** Human-readable client name (e.g., "DAWSON", "Nonattorney Admissions Exam App") */
  clientName: string;
  /** IAM role ARN for the client (e.g., "arn:aws:iam::123456789012:role/dawson-client") */
  clientRoleArn: string;
  /** List of feeIds this client is authorized to use */
  allowedFeeIds: string[];
};
