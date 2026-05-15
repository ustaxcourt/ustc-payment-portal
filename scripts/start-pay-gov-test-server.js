const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

function parsePort(value, fallback, envName) {
  const numericPort = Number(value || fallback);
  const isValidPort = Number.isInteger(numericPort) && numericPort > 0 && numericPort <= 65535;

  if (!isValidPort) {
    throw new Error(`[start:pay-gov-test-server] Invalid ${envName}: ${value}`);
  }

  return String(numericPort);
}

function loadEnvFile() {
  const envFilePath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envFilePath)) {
    return;
  }

  const fileContents = fs.readFileSync(envFilePath, 'utf8');
  for (const line of fileContents.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['\"]|['\"]$/g, '');

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const port = parsePort(process.env.PAY_GOV_TEST_SERVER_PORT, 3366, 'PAY_GOV_TEST_SERVER_PORT');
const token = process.env.PAY_GOV_TEST_SERVER_ACCESS_TOKEN;
const payGovNodeEnv = process.env.PAY_GOV_NODE_ENV || 'local';

if (!port || !token) {
  throw new Error(
    'Missing PAY_GOV_TEST_SERVER_PORT or PAY_GOV_TEST_SERVER_ACCESS_TOKEN in .env'
  );
}

process.env.PORT = port;
process.env.ACCESS_TOKEN = token;
process.env.NODE_ENV = payGovNodeEnv;

console.log(
  `[start:pay-gov-test-server] Using NODE_ENV=${process.env.NODE_ENV} (from PAY_GOV_NODE_ENV=${process.env.PAY_GOV_NODE_ENV || 'default:local'})`
);

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') {
    return { config() {} };
  }

  return originalLoad.call(this, request, parent, isMain);
};

try {
  require(path.join(
    process.cwd(),
    'node_modules',
    '@ustaxcourt',
    'ustc-pay-gov-test-server',
    'dist',
    'server.js'
  ));
} finally {
  Module._load = originalLoad;
}
