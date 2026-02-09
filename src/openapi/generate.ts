#!/usr/bin/env ts-node
/**
 * Script to generate OpenAPI specification from Zod schemas.
 * Run with: npm run generate:openapi
 */

import * as fs from "fs";
import * as path from "path";
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

// Write YAML (simple conversion)
const yaml = jsonToYaml(document);
fs.writeFileSync(outputPathYaml, yaml);
console.log(`✅ OpenAPI YAML spec generated: ${outputPathYaml}`);

/**
 * Simple JSON to YAML converter for OpenAPI spec
 */
function jsonToYaml(obj: any, indent = 0): string {
  const spaces = "  ".repeat(indent);
  let result = "";

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === "object" && item !== null) {
        result += `${spaces}-\n${jsonToYaml(item, indent + 1)
          .split("\n")
          .map((line, i) => (i === 0 ? `${spaces}  ${line.trim()}` : line))
          .join("\n")}\n`;
      } else {
        result += `${spaces}- ${formatValue(item)}\n`;
      }
    }
  } else if (typeof obj === "object" && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "object" && value !== null) {
        if (Array.isArray(value) && value.length === 0) {
          result += `${spaces}${key}: []\n`;
        } else if (
          typeof value === "object" &&
          !Array.isArray(value) &&
          Object.keys(value).length === 0
        ) {
          result += `${spaces}${key}: {}\n`;
        } else {
          result += `${spaces}${key}:\n${jsonToYaml(value, indent + 1)}`;
        }
      } else {
        result += `${spaces}${key}: ${formatValue(value)}\n`;
      }
    }
  }

  return result;
}

function formatValue(value: any): string {
  if (value === null) return "null";
  if (value === undefined) return "null";
  if (typeof value === "string") {
    // Quote strings that could be misinterpreted
    if (
      value === "" ||
      value.includes(":") ||
      value.includes("#") ||
      value.includes("'") ||
      value.includes('"') ||
      value.includes("\n") ||
      value.match(/^[0-9]/) ||
      ["true", "false", "null", "yes", "no"].includes(value.toLowerCase())
    ) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return String(value);
}
