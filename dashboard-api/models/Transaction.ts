import { Model } from 'objection';

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CANCELED = 'CANCELED'
}

export enum TransactionStatus {
  INITIATED = 'INITIATED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export enum PaymentMethod {
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  ACH = 'ACH',
  CHECK = 'CHECK'
}

export default class Transaction extends Model {
  static tableName = 'transactions';

  agencyTrackingId!: string; // Agency Tracking ID
  paygovTrackingId?: string | null; // Pay.gov Tracking ID (if one exists)
  feeName!: string; // Fee Name
  feeId!: string; // Fee Identifier
  feeAmount!: number; // Fee Amount
  appClientName!: string; // App/Client Name
  transactionReferenceId!: string; // Transaction Reference ID
  paymentStatus!: PaymentStatus; // Payment Status
  transactionStatus?: TransactionStatus; // Transaction Status
  paygovToken?: string | null; // Pay.gov token
  paymentMethod!: PaymentMethod; // Payment Method
  lastUpdatedAt!: string; // Last Updated Timestamp (ISO 8601)
  createdAt!: string; // Created Timestamp (ISO 8601)
  metadata?: Record<string, string> | null; // Metadata supplied (free-form key/value bag)
}
