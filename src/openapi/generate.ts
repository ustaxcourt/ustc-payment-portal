#!/usr/bin/env ts-node
/**
 * Script to generate OpenAPI specification from Zod schemas.
 * Run with: npm run generate:openapi
 */

import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import { generateOpenAPIDocument } from "./registry";

const outputDir = path.resolve(__dirname, "../../docs");
const outputPath = path.join(outputDir, "openapi.json");
const outputPathYaml = path.join(outputDir, "openapi.yaml");

// Ensure docs directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const document = generateOpenAPIDocument();

// Write JSON
fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));
console.log(`✅ OpenAPI JSON spec generated: ${outputPath}`);

// Write YAML
fs.writeFileSync(outputPathYaml, yaml.dump(document, { noRefs: true }));
console.log(`✅ OpenAPI YAML spec generated: ${outputPathYaml}`);
