import { defineConfig } from "tsup";

// ESM-only dependencies: left external, consumers' Jest (CommonJS) fails to load
// them. shims supplies the import.meta.url objection's CJS bundle would lack.
const bundleEsmOnlyDeps = {
  noExternal: ["objection", "node-fetch"],
  shims: true,
};

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    ...bundleEsmOnlyDeps,
  },
  { entry: ["src/devServer.ts"], format: ["cjs"], ...bundleEsmOnlyDeps },
]);
