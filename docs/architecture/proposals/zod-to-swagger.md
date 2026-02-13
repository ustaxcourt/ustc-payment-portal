# Zod & Zod-to-Swagger Implementation

Zod works by moving all of our request and response objects into index.ts as a single source of truth. Types are generated from `schemas/index.ts`, which we then use in our endpoints. These generated types can be used for runtime validation (via .parse()) and for generating the OpenAPI documentation. If the schema for a given request/response object changes, we need to run npm run generate:openapi to regenerate the swagger docs. TypeScript types derived from the schemas update automatically at compile time. When handlers use Zod's .parse() for validation, changes to schemas will also enforce the contract at runtime, rejecting requests that don't match. By the nature of this option, we are proposing changing our validation from `Joi` to `Zod` in order to take advantage of `@asteasolutions/zod-to-openapi` for automating documentation updates.

# How Zod-to-OpenAPI Works

The OpenAPI generation relies on three key files:

## 1. Schema Definitions (`src/schemas/index.ts`)

Zod schemas define request/response shapes with `.openapi()` metadata for documentation:

**NOTE: Below are examples, they don't reflect our final expected schema definitions**

```typescript
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export const InitPaymentRequestSchema = z
  .object({
    trackingId: z.string().openapi({
      description: "Unique identifier for tracking the payment",
      example: "TRK-12345",
    }),
    amount: z.number().positive().openapi({
      description: "Payment amount in dollars",
      example: 150.0,
    }),
    // ...
  })
  .openapi("InitPaymentRequest");

// TypeScript type derived from schema
export type InitPaymentRequest = z.infer<typeof InitPaymentRequestSchema>;
```

## 2. OpenAPI Registry (`src/openapi/registry.ts`)

Registers schemas and API paths with HTTP methods, request bodies, and responses:

```typescript
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  InitPaymentRequestSchema,
  InitPaymentResponseSchema,
} from "../schemas";

export const registry = new OpenAPIRegistry();

// Register schemas
registry.register("InitPaymentRequest", InitPaymentRequestSchema);

// Register endpoints
registry.registerPath({
  method: "post",
  path: "/init",
  summary: "Initialize a payment",
  tags: ["Payments"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: { "application/json": { schema: InitPaymentRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Payment initialized successfully",
      content: { "application/json": { schema: InitPaymentResponseSchema } },
    },
  },
});
```

## 3. Generation Script (`src/openapi/generate.ts`)

Generates the OpenAPI JSON/YAML from the registry:

```typescript
import { generateOpenAPIDocument } from "./registry";

const document = generateOpenAPIDocument();
fs.writeFileSync("docs/openapi.json", JSON.stringify(document, null, 2));
```

Run with: `npm run generate:openapi`

## What Requires Manual Updates

| Change                             | Files to Update                                                    |
| ---------------------------------- | ------------------------------------------------------------------ |
| Add/modify request/response fields | `schemas/index.ts` only                                            |
| Add new endpoint                   | `schemas/index.ts` + `registry.ts` + Lambda handler                |
| Change endpoint path/method        | `registry.ts`                                                      |
| Update descriptions/examples       | `schemas/index.ts` (field-level) or `registry.ts` (endpoint-level) |

After any changes, run `npm run generate:openapi` to regenerate the docs.

# Alternatives (and why they don't really work for us)
## Hono + Hono-openapi
Hono is another framework similar to express/node that has a feature built in to directly generate the docs from the API code. Not really practically here because it would require starting Payment Portal from Scratch.

## OpenAPI Specs from CDK
We can use aws apigateway get-export to grab the API endpoint definitions from API Gateway, but it only provides the route structure - no request/response schemas, descriptions, or examples unless we duplicate that information in Terraform.

## TSOA
TSOA lets us define routes in endpoints via decorators, getting us pretty close to the goal of having our code be our source of truth. It can then generate the docs based on those routes. It doesn't work for our setup since it requires class-based controllers with decorators, and generates Express/Koa route handlers - neither of which align with our Lambda function-per-endpoint architecture.
