## How to View OpenAPI/Swagger Docs

To view our OpenAPI docs, start the server and visit [http://localhost:8080/docs](http://localhost:8080/docs) in your web browser.

## Endpoints changed, or new ones added?

You can find the detailed Zod documention for defining schemas [here](https://zod.dev/api) under `Defining schemas`.

When endpoints are added, modified, or removed, you need to update the OpenAPI documentation. Here's what to change:

### 1. Update Zod Schemas (if request/response shapes changed)
Create a schema file, under the schema folder and export it via [src/schemas/index.ts](../../../src/schemas/index.ts). The schema file will look like the following:

```typescript
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { PaymentStatusSchema } from "./PaymentStatus.schema";
import { TransactionRecordSummarySchema } from "./TransactionRecord.schema";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

export const GetDetailsResponseSchema = z
  .object({
    paymentStatus: PaymentStatusSchema.openapi({
      description:
        "Overall payment status representing the current state of the payment",
    }),
    transactions: z.array(TransactionRecordSummarySchema).openapi({
      description:
        "Array of all transaction records associated with this payment reference",
    }),
  })
  .openapi("GetDetailsResponse");

export type GetDetailsResponse = z.infer<typeof GetDetailsResponseSchema>;
```

### 2. Register the Schema (if new)

In [src/openapi/registry.ts](../../../src/openapi/registry.ts), register any new schemas:

```typescript
import { MyNewRequestSchema } from "../schemas";

registry.register("MyNewRequest", MyNewRequestSchema);
```

### 3. Add/Update/Remove the Endpoint

In the same [registry.ts](../../../src/openapi/registry.ts) file, use `registry.registerPath()`:

**Adding a new endpoint:**

```typescript
registry.registerPath({
  method: "post", // or "get", "put", "delete"
  path: "/my-endpoint",
  summary: "Short description",
  description: "Longer description of what this endpoint does.",
  tags: ["Payments"],
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: MyNewRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      description: "Success response",
      content: {
        "application/json": {
          schema: MyNewResponseSchema,
        },
      },
    },
    // Add other response codes as needed
  },
});
```

**Removing an endpoint:** Delete the corresponding `registry.registerPath()` block.

**Modifying an endpoint:** Update the relevant `registry.registerPath()` block with new paths, methods, schemas, or response codes.

### 4. Regenerate the OpenAPI Spec

Run the generator to update `docs/openapi.json` and `docs/openapi.yaml`:

```bash
npm run generate:openapi
```

### 5. Verify Your Changes

Start the dev server and check the Swagger UI:

```bash
npm run dev
# Visit http://localhost:8080/docs
```

### Quick Reference: File Locations

| What to Update                         | File                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| Request/response shapes                | [src/schemas/index.ts](../../../src/schemas/index.ts)                                    |
| Endpoint definitions                   | [src/openapi/registry.ts](../../../src/openapi/registry.ts)                              |
| API metadata (title, version, servers) | Bottom of [registry.ts](../../../src/openapi/registry.ts) in `generateOpenAPIDocument()` |
| Generated output                       | `docs/openapi.json`, `docs/openapi.yaml` (auto-generated, don't edit directly)           |
