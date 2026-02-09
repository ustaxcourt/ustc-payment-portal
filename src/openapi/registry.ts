import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import {
  InitPaymentRequestSchema,
  InitPaymentResponseSchema,
  ProcessPaymentRequestSchema,
  ProcessPaymentResponseSchema,
  GetDetailsRequestSchema,
  GetDetailsResponseSchema,
  ErrorResponseSchema,
} from "../schemas";

export const registry = new OpenAPIRegistry();

// ============================================
// Register Schemas
// ============================================
registry.register("InitPaymentRequest", InitPaymentRequestSchema);
registry.register("InitPaymentResponse", InitPaymentResponseSchema);
registry.register("ProcessPaymentRequest", ProcessPaymentRequestSchema);
registry.register("ProcessPaymentResponse", ProcessPaymentResponseSchema);
registry.register("GetDetailsRequest", GetDetailsRequestSchema);
registry.register("GetDetailsResponse", GetDetailsResponseSchema);
registry.register("ErrorResponse", ErrorResponseSchema);

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
// POST /process - Process Payment
// ============================================
registry.registerPath({
  method: "post",
  path: "/process",
  summary: "Process a payment",
  description:
    "Completes a payment transaction after the user has authorized it on Pay.gov. Returns the transaction status and tracking information.",
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
      description: "Payment processed (check transactionStatus for result)",
      content: {
        "application/json": {
          schema: ProcessPaymentResponseSchema,
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
// GET /details/{appId}/{payGovTrackingId} - Get Transaction Details
// ============================================
registry.registerPath({
  method: "get",
  path: "/details/{appId}/{payGovTrackingId}",
  summary: "Get transaction details",
  description:
    "Retrieves the current status and details of a payment transaction by its tracking ID.",
  tags: ["Payments"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: GetDetailsRequestSchema,
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
      description: "Invalid request - missing required parameters",
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
// Generate OpenAPI Document
// ============================================
export const generateOpenAPIDocument = () => {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.3",
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
        url: "https://api.example.com",
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
