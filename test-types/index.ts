import type {
  InitPaymentRequest,
  InitPaymentResponse,
  ProcessPaymentRequest,
  ProcessPaymentResponse,
  GetDetailsPathParams,
  GetDetailsResponse,
} from "../dist/index";

// Smoke-check: verifies that tsup --dts produced a dist/index.d.ts that
// resolves all six public types. Fails at compile time if any type is missing
// or if a transitive type import wasn't bundled.
//
// Run after `npm run build` with: tsc --project tsconfig.test-types.json
export type PublicTypes = {
  initPaymentRequest: InitPaymentRequest;
  initPaymentResponse: InitPaymentResponse;
  processPaymentRequest: ProcessPaymentRequest;
  processPaymentResponse: ProcessPaymentResponse;
  getDetailsPathParams: GetDetailsPathParams;
  getDetailsResponse: GetDetailsResponse;
};
