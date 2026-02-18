import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import {
  InitPaymentRequestSchema,
  InitPaymentResponseSchema,
  ErrorResponseSchema,
  GetDetailsResponseSchema,
  TransactionRecordSchema,
  TransactionStatusSchema,
  ProcessPaymentRequestSchema,
  ProcessPaymentSuccessResponseSchema,
  ProcessPaymentFailedResponseSchema,
  FeeIdSchema,
  MetadataDawsonSchema,
  MetadataNonattorneyExamSchema,
  MetadataSchema,
} from "../schemas";
import { z } from "zod";

export const registry = new OpenAPIRegistry();

// ============================================
// Register Schemas
// ============================================
registry.register("FeeId", FeeIdSchema);
registry.register("MetadataDawson", MetadataDawsonSchema);
registry.register("MetadataNonattorneyExam", MetadataNonattorneyExamSchema);
registry.register("Metadata", MetadataSchema);
registry.register("InitPaymentRequest", InitPaymentRequestSchema);
registry.register("InitPaymentResponse", InitPaymentResponseSchema);
registry.register("ErrorResponse", ErrorResponseSchema);
registry.register("GetDetailsResponse", GetDetailsResponseSchema);
registry.register("TransactionRecord", TransactionRecordSchema);
registry.register("TransactionStatus", TransactionStatusSchema);
registry.register("ProcessPaymentRequest", ProcessPaymentRequestSchema);
registry.register(
  "ProcessPaymentSuccessResponse",
  ProcessPaymentSuccessResponseSchema
);
registry.register(
  "ProcessPaymentFailedResponse",
  ProcessPaymentFailedResponseSchema
);

// ============================================
// API Key Security Scheme
// ============================================
registry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "x-api-key",
  description: "API key for authorization",
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
  security: [{ ApiKeyAuth: [] }],
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
      description: "Invalid request payload",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized - invalid or missing API key",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

// ============================================
// GET /details/:appId/:transactionReferenceId - Get Transaction Details
// ============================================
registry.registerPath({
  method: "get",
  path: "/details/{appId}/{transactionReferenceId}",
  summary: "Get transaction details",
  description:
    "Retrieves the payment status and all transaction records associated with a transaction reference ID. " +
    "If there is a pending transaction, it will query Pay.gov for the latest status before returning.",
  tags: ["Payments"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: z.object({
      appId: z.string().openapi({
        description: "The application ID",
        example: "DAWSON",
      }),
      transactionReferenceId: z.string().uuid().openapi({
        description: "Unique UUID for the transaction reference",
        example: "550e8400-e29b-41d4-a716-446655440000",
      }),
    }),
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
    401: {
      description: "Unauthorized - invalid or missing API key",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden - application not authorized for this transaction",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: "Transaction not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
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
    "This endpoint must be called regardless of payment type used to finalize the transaction.",
  tags: ["Payments"],
  security: [{ ApiKeyAuth: [] }],
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
      description: "Payment processed successfully",
      content: {
        "application/json": {
          schema: ProcessPaymentSuccessResponseSchema,
        },
      },
    },
    400: {
      description: "Invalid request payload",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized - invalid or missing API key",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    403: {
      description: "Forbidden - application not authorized for this fee type",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: "No pending transaction found for the provided token",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    422: {
      description: "Payment processing failed",
      content: {
        "application/json": {
          schema: ProcessPaymentFailedResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
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
      version: "0.1.3",
      description:
        "API for integrating with Pay.gov payment services for the US Tax Court.",
      contact: {
        name: "US Tax Court",
      },
    },
    servers: [
      {
        url: "https://5740jj3tq0.execute-api.us-east-1.amazonaws.com/prod",
        description: "Production server",
      },
      {
        url: "http://localhost:8080",
        description: "Local development server",
      },
    ],
    tags: [
      {
        name: "Payments",
        description: "Payment initialization, processing, and status operations",
      },
    ],
  });
};
