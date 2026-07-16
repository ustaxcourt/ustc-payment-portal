---
"@ustaxcourt/payment-portal": patch
---

Update dependency range: @asteasolutions/zod-to-openapi ^8.5.0 → ^9.0.0 and move
the generated OpenAPI spec from 3.1.0 to 3.2.0 (switches to the new
OpenApiGeneratorV32; the only change to the spec is the declared `openapi`
version — schema output is otherwise identical). Refreshed in-range patch
resolutions for @aws-sdk/*, fast-xml-parser, and tsx (no range changes).
