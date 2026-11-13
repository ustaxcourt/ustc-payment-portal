// Jest cannot require ESM without --experimental-vm-modules, so objection 4 is compiled to CJS.
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

const COMPILER_OPTIONS = {
  allowJs: true,
  esModuleInterop: true,
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
};

// CJS already has a file-relative require(); redeclaring it is a SyntaxError.
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

const OWN_SOURCE = readFileSync(__filename, "utf8");

module.exports = {
  process(source, path) {
    const { outputText } = ts.transpileModule(rewrite(source, path), {
      fileName: path,
      compilerOptions: COMPILER_OPTIONS,
    });
    return { code: outputText };
  },
  getCacheKey(source, path, { configString }) {
    return createHash("sha256")
      .update(OWN_SOURCE)
      .update(ts.version)
      .update(configString)
      .update(path)
      .update(source)
      .digest("hex");
  },
};
