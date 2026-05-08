export type LoggerContext = {
  requestId?: string;
  apiGatewayRequestId?: string;
  lambdaRequestId?: string;
  path?: string;
  httpMethod?: string;
  logLevel?: string;
  clientArn?: string;
  clientName?: string;
  feeId?: string;
  agencyTrackingId?: string;
  transactionReferenceId?: string;
  metadataKeys?: string[];
};
