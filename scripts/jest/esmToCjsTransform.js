// Compiles ESM-only node_modules (objection 4) to CommonJS for Jest, which
// cannot require ESM without --experimental-vm-modules.
const { TsJestTransformer } = require("ts-jest");

// CommonJS already provides a require() relative to the file, and redeclaring
// it collides with the module wrapper's parameter.
const ESM_REQUIRE_SHIM =
  /^const require = createRequire\(import\.meta\.url\);$/m;

const rewrite = (source, path) => {
  const result = source.replace(ESM_REQUIRE_SHIM, "");
  if (result.includes("import.meta")) {
    throw new Error(
      `${path} uses import.meta in a way esmToCjsTransform cannot rewrite`,
    );
  }
  return result;
};

module.exports = {
  createTransformer() {
    const tsJest = new TsJestTransformer({
      tsconfig: { allowJs: true, module: "commonjs" },
    });
    return {
      canInstrument: false,
      process: (source, path, options) =>
        tsJest.process(rewrite(source, path), path, options),
      getCacheKey: (source, path, options) =>
        tsJest.getCacheKey(rewrite(source, path), path, options),
    };
  },
};
