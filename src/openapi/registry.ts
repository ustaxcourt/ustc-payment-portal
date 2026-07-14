import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import {
  BadRequestErrorSchema,
  ConflictErrorSchema,
  ErrorResponseSchema,
  FeeKeySchema,
  ForbiddenErrorSchema,
  GatewayErrorSchema,
  GetDetailsPathParamsSchema,
  GetDetailsResponseSchema,
  GoneErrorSchema,
  InitPaymentRequestSchema,
  InitPaymentResponseSchema,
  MetadataDawsonSchema,
  MetadataNonattorneyExamSchema,
  MetadataSchema,
  NotFoundErrorSchema,
  PaymentMethodSchema,
  PaymentStatusSchema,
  ProcessPaymentRequestSchema,
  ProcessPaymentResponseSchema,
  RecentTransactionsResponseSchema,
  ServerErrorSchema,
  TransactionPaymentStatusResponseSchema,
  TransactionRecordSchema,
  TransactionRecordSummarySchema,
  TransactionStatusSchema,
  TransactionsByStatusPathParamsSchema,
  TransactionsByStatusResponseSchema,
  ValidationErrorResponseSchema,
} from "../schemas";

export const registry = new OpenAPIRegistry();

// ============================================
// Register Schemas
// ============================================
registry.register("FeeKey", FeeKeySchema);
registry.register("MetadataDawson", MetadataDawsonSchema);
registry.register("MetadataNonattorneyExam", MetadataNonattorneyExamSchema);
registry.register("Metadata", MetadataSchema);
registry.register("InitPaymentRequest", InitPaymentRequestSchema);
registry.register("InitPaymentResponse", InitPaymentResponseSchema);
registry.register("ErrorResponse", ErrorResponseSchema);
registry.register("BadRequestError", BadRequestErrorSchema);
registry.register("ConflictError", ConflictErrorSchema);
registry.register("ForbiddenError", ForbiddenErrorSchema);
registry.register("ServerError", ServerErrorSchema);
registry.register("NotFoundError", NotFoundErrorSchema);
registry.register("ValidationErrorResponse", ValidationErrorResponseSchema);
registry.register("GatewayError", GatewayErrorSchema);
registry.register("GetDetailsPathParams", GetDetailsPathParamsSchema);
registry.register("GetDetailsResponse", GetDetailsResponseSchema);
registry.register("TransactionRecord", TransactionRecordSchema);
registry.register("TransactionRecordSummary", TransactionRecordSummarySchema);
registry.register("TransactionStatus", TransactionStatusSchema);
registry.register("PaymentStatus", PaymentStatusSchema);
registry.register("PaymentMethod", PaymentMethodSchema);
registry.register("ProcessPaymentRequest", ProcessPaymentRequestSchema);
registry.register("ProcessPaymentResponse", ProcessPaymentResponseSchema);
registry.register("GoneError", GoneErrorSchema);
registry.register(
  "RecentTransactionsResponse",
  RecentTransactionsResponseSchema,
);
registry.register(
  "TransactionsByStatusPathParams",
  TransactionsByStatusPathParamsSchema,
);
registry.register(
  "TransactionsByStatusResponse",
  TransactionsByStatusResponseSchema,
);
registry.register(
  "TransactionPaymentStatusResponse",
  TransactionPaymentStatusResponseSchema,
);

// ============================================
// AWS Signature Version 4 Security Scheme
// ============================================
registry.registerComponent("securitySchemes", "sigv4", {
  type: "apiKey",
  in: "header",
  name: "Authorization",
  description:
    "AWS Signature Version 4 authentication. Requests must be signed using AWS credentials " +
    "with the AWS4-HMAC-SHA256 algorithm. Include the Authorization header with the signature, " +
    "along with X-Amz-Date and optionally X-Amz-Security-Token headers. " +
    "See AWS documentation for signing requests: https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html",
});

// ============================================
// POST /init - Initialize Payment
// ============================================
registry.registerPath({
  method: "post",
  path: "/init",
  summary: "Initialize a payment",
  description:
    "Creates a new payment session with Pay.gov and returns a redirect URL for the user to complete payment.",
  tags: ["Payments"],
  security: [{ sigv4: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: InitPaymentRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Payment initialized successfully",
      content: {
        "application/json": {
          schema: InitPaymentResponseSchema,
        },
      },
    },
    400: {
      description:
        "Invalid request payload (e.g., missing body, validation error)",
      content: {
        "application/json": {
          schema: BadRequestErrorSchema,
        },
      },
    },
    403: {
      description:
        "Forbidden - invalid SigV4 signature or client not authorized",
      content: {
        "application/json": {
          schema: ForbiddenErrorSchema,
        },
      },
    },
    409: {
      description:
        "Returned when a prior attempt is still `initiated` (awaiting redirect) or is actively " +
        "being finalized by an in-flight POST /process. The duplicate request does not call Pay.gov. " +
        "Retry with backoff; once the in-flight attempt finishes, a subsequent POST /init returns 200 " +
        "with the payment redirect (or a fresh session if the prior attempt expired or was abandoned).",
      content: {
        "application/json": {
          schema: ConflictErrorSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ServerErrorSchema,
        },
      },
    },
    504: {
      description: "Gateway timeout communicating with Pay.gov",
      content: {
        "application/json": {
          schema: GatewayErrorSchema,
        },
      },
    },
  },
});

// ============================================
// GET /details/:transactionReferenceId - Get Transaction Details
// ============================================
registry.registerPath({
  method: "get",
  path: "/details/{transactionReferenceId}",
  summary: "Get transaction details",
  description:
    "Retrieves the payment status and all transaction records associated with a transaction reference ID. " +
    "If there is a pending transaction, it will query Pay.gov for the latest status before returning.",
  tags: ["Payments"],
  security: [{ sigv4: [] }],
  request: {
    params: GetDetailsPathParamsSchema,
  },
  responses: {
    200: {
      description: "Transaction details retrieved successfully",
      content: {
        "application/json": {
          schema: GetDetailsResponseSchema,
        },
      },
    },
    400: {
      description:
        "Invalid request - transactionReferenceId is missing or not a valid UUID.",
      content: {
        "application/json": {
          schema: BadRequestErrorSchema,
        },
      },
    },
    403: {
      description:
        "Forbidden - invalid SigV4 signature, client not registered, " +
        "or the transactionReferenceId belongs to a different client.",
      content: {
        "application/json": {
          schema: ForbiddenErrorSchema,
        },
      },
    },
    404: {
      description:
        "No transaction was found for the supplied transactionReferenceId.",
      content: {
        "application/json": {
          schema: NotFoundErrorSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ServerErrorSchema,
        },
      },
    },
  },
});

// ============================================
// POST /process - Process Payment
// ============================================
registry.registerPath({
  method: "post",
  path: "/process",
  summary: "Process a payment",
  description:
    "Completes a payment transaction after the user has submitted payment information on Pay.gov. " +
    "This endpoint must be called regardless of payment type used to finalize the transaction. " +
    "Concurrent requests for the same token are serialized: only one Pay.gov complete call proceeds; " +
    "duplicates receive HTTP 409 Conflict. " +
    "Note: When the transaction reaches Pay.gov, both approved and declined outcomes return HTTP 200 — " +
    "check the transactionStatus field to determine the outcome.",
  tags: ["Payments"],
  security: [{ sigv4: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: ProcessPaymentRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description:
        "Payment processed. The paymentStatus field indicates the overall outcome (success, failed, pending). " +
        "It includes all attempts for the same transactionReferenceId.",
      content: {
        "application/json": {
          schema: ProcessPaymentResponseSchema,
        },
      },
    },
    400: {
      description:
        "Invalid request payload. Returned when the body is missing, not valid JSON, " +
        "or fails schema validation (missing `token`, wrong type, empty string, or unknown fields in strict mode).",
      content: {
        "application/json": {
          schema: ValidationErrorResponseSchema,
        },
      },
    },
    403: {
      description:
        "Forbidden - invalid SigV4 signature, client not authorized, or client does not have access to the fee associated with the supplied token",
      content: {
        "application/json": {
          schema: ForbiddenErrorSchema,
        },
      },
    },
    404: {
      description:
        "Token not found - no transaction exists for the supplied token",
      content: {
        "application/json": {
          schema: NotFoundErrorSchema,
        },
      },
    },
    409: {
      description:
        "Conflict - this token is already being processed by another in-flight POST /process request. " +
        "The duplicate request does not call Pay.gov. " +
        "Retry with backoff while responses are 409; once the in-flight request finishes, a retry returns " +
        "200 (success/failure/pending), 410 (token no longer valid), or 404.",
      content: {
        "application/json": {
          schema: ConflictErrorSchema,
        },
      },
    },
    410: {
      description:
        "Gone - the token is no longer valid for processing. " +
        "Another transaction may already be fulfilling the same obligation (check getDetails), " +
        "the transaction is not in an initiatable state (e.g. already processed), " +
        "or a prior POST /process claim was abandoned and marked failed after the processing timeout. " +
        "This is not returned for concurrent in-flight requests on the same token (see 409).",
      content: {
        "application/json": {
          schema: GoneErrorSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ServerErrorSchema,
        },
      },
    },
    502: {
      description:
        "Bad Gateway - Pay.gov returned an invalid or unparseable response",
      content: {
        "application/json": {
          schema: GatewayErrorSchema,
        },
      },
    },
    504: {
      description: "Gateway timeout communicating with Pay.gov",
      content: {
        "application/json": {
          schema: GatewayErrorSchema,
        },
      },
    },
  },
});

// ============================================
// GET /transactions - Recent Transactions
// ============================================
registry.registerPath({
  method: "get",
  path: "/transactions",
  summary: "Get recent transactions",
  description:
    "Returns up to 100 most recent transactions across all payment statuses.",
  tags: ["Payments"],
  security: [{ sigv4: [] }],
  responses: {
    200: {
      description: "Recent transactions retrieved successfully",
      content: {
        "application/json": {
          schema: RecentTransactionsResponseSchema,
        },
      },
    },
    403: {
      description:
        "Forbidden - invalid SigV4 signature or client not authorized",
      content: {
        "application/json": {
          schema: ForbiddenErrorSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ServerErrorSchema,
        },
      },
    },
  },
});

// ============================================
// GET /transactions/{paymentStatus} - Transactions By Status
// ============================================
registry.registerPath({
  method: "get",
  path: "/transactions/{paymentStatus}",
  summary: "Get transactions by payment status",
  description:
    "Returns up to 100 transactions matching the requested payment status.",
  tags: ["Payments"],
  security: [{ sigv4: [] }],
  request: {
    params: TransactionsByStatusPathParamsSchema,
  },
  responses: {
    200: {
      description:
        "Transactions for the requested status retrieved successfully",
      content: {
        "application/json": {
          schema: TransactionsByStatusResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid payment status path parameter",
      content: {
        "application/json": {
          schema: BadRequestErrorSchema,
        },
      },
    },
    403: {
      description:
        "Forbidden - invalid SigV4 signature or client not authorized",
      content: {
        "application/json": {
          schema: ForbiddenErrorSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ServerErrorSchema,
        },
      },
    },
  },
});

// ============================================
// GET /transaction-payment-status - Aggregate Payment Status
// ============================================
registry.registerPath({
  method: "get",
  path: "/transaction-payment-status",
  summary: "Get aggregate transaction payment status",
  description: "Returns counts of transactions grouped by payment status.",
  tags: ["Payments"],
  security: [{ sigv4: [] }],
  responses: {
    200: {
      description: "Aggregate status counts retrieved successfully",
      content: {
        "application/json": {
          schema: TransactionPaymentStatusResponseSchema,
        },
      },
    },
    403: {
      description:
        "Forbidden - invalid SigV4 signature or client not authorized",
      content: {
        "application/json": {
          schema: ForbiddenErrorSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ServerErrorSchema,
        },
      },
    },
  },
});

// ============================================
// Generate OpenAPI Document
// ============================================
export const generateOpenAPIDocument = () => {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "USTC Payment Portal API",
      version: "1.0.1",
      description:
        "API for integrating with Pay.gov payment services for the US Tax Court.",
      contact: {
        name: "US Tax Court",
      },
    },
    servers: [
      {
        url: "http://localhost:8080",
        description: "Local development server",
      },
      {
        url: "https://dev-payments.ustaxcourt.gov",
        description: "Dev",
      },
      {
        url: "https://stg-payments.ustaxcourt.gov",
        description: "Test/Staging",
      },
      {
        url: "https://payments.ustaxcourt.gov",
        description: "Production",
      },
    ],
    tags: [
      {
        name: "Payments",
        description:
          "Payment initialization, processing, and status operations",
      },
    ],
  });
};
