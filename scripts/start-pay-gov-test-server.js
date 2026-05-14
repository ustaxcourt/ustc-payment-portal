const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

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

const port = process.env.PAY_GOV_TEST_SERVER_PORT;
const token = process.env.PAY_GOV_TEST_SERVER_ACCESS_TOKEN;

if (!port || !token) {
  throw new Error(
    'Missing PAY_GOV_TEST_SERVER_PORT or PAY_GOV_TEST_SERVER_ACCESS_TOKEN in .env'
  );
}

process.env.PORT = port;
process.env.ACCESS_TOKEN = token;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') {
    return { config() {} };
  }

  return originalLoad.call(this, request, parent, isMain);
};

require(path.join(
  process.cwd(),
  'node_modules',
  '@ustaxcourt',
  'ustc-pay-gov-test-server',
  'dist',
  'server.js'
));
