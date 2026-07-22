const crypto = require('node:crypto');
const path = require('node:path');
const { URL } = require('node:url');
const { Sha256 } = require('@aws-crypto/sha256-js');
const { HttpRequest } = require('@smithy/core/protocols');
const { SignatureV4 } = require('@smithy/signature-v4');

require('dotenv').config({ path: path.join(__dirname, '.env') });

function resolveAwsCredentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    return Promise.reject(
      new Error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for SigV4 signing"),
    );
  }

  return Promise.resolve({
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  });
}

module.exports = {
  setSignedInitBody: (req, context, _ee, done) => {
    const bodyObj = {
      transactionReferenceId: context.vars.transactionReferenceId,
      fee: "PETITION_FILING_FEE",
      urlSuccess: "https://client.app/success",
      urlCancel: "https://client.app/cancel",
      metadata: {
        docketNumber: Math.random().toString(36).substring(7)
      }
    };
    req.body = JSON.stringify(bodyObj);
    return done();
  },

  setSignedProcessBody: (req, context, _ee, done) => {
    const bodyObj = {
      token: context.vars.paymentToken,
    };
    req.body = JSON.stringify(bodyObj);
    return done();
  },

  signWithSigV4IfNeeded: (req, context, _ee, done) => {
    let body = req.body || "";
    req.headers = req.headers || {};

    const parsedBase = new URL(context.vars.target);
    const host = parsedBase.host;

    const isLocalhost =
      host.includes('localhost') ||
      host.includes('127.0.0.1');

    if (req.url.includes('{{')) {
      req.url = req.url.replace(
        '{{ transactionReferenceId }}',
        context.vars.transactionReferenceId
      );
    }

    const fullUrl = new URL(req.url, context.vars.target);

    if (req.json !== undefined) {
      body = JSON.stringify(req.json);
      delete req.json;
    }

    if (req.method === 'GET') {
      body = '';
      req.headers = {
        ...req.headers,
        host,
        accept: 'application/json',
      }
    } else {
      req.headers = {
        host: host,
        'content-type': 'application/json',
        accept: 'application/json',
      };
    }

    if (!isLocalhost) {
      resolveAwsCredentials()
        .then(async (credentials) => {
          const region =
            process.env.SIGV4_REGION ??
            process.env.AWS_REGION ??
            "us-east-1";

          const signer = new SignatureV4({
            credentials: {
              accessKeyId: credentials.accessKeyId,
              secretAccessKey: credentials.secretAccessKey,
              sessionToken: credentials.sessionToken,
            },
            region,
            service: "execute-api",
            sha256: Sha256,
          });

          const request = new HttpRequest({
            method: req.method,
            hostname: fullUrl.hostname,
            path: fullUrl.pathname + (fullUrl.search || ""),
            headers: {
              host: fullUrl.hostname,
              accept: "application/json",
              ...(req.method === "GET"
                ? {}
                : { "content-type": "application/json" }),
            },
            body: req.method === "GET" ? undefined : body,
          });

          const signed = await signer.sign(request);
          req.headers = signed.headers;
          req.body = req.method === "GET" ? undefined : body;
          req._artilleryRawBody = true;
          done();
        })
        .catch(done);
      return;
    }

    return done();
  },

  setTransactionReferenceId: (context, _events, done) => {
    const uuid = crypto.randomUUID();
    context.vars.transactionReferenceId = uuid;
    return done();
  },

  logResponse: (req, res, _context, _ee, done) => {
     if (
       process.env.ARTILLERY_DEBUG_RESPONSES === "1" ||
       (res.statusCode ?? 0) >= 400
     ) {
       const headers = { ...(req.headers ?? {}) };
        if (headers.authorization) headers.authorization = "[Redacted]";
        if (headers.Authorization) headers.Authorization = "[Redacted]";
        if (headers["x-amz-security-token"]) headers["x-amz-security-token"] = "[Redacted]";
        if (headers["X-Amz-Security-Token"]) headers["X-Amz-Security-Token"] = "[Redacted]";
       console.log("REQUEST:", req.method, req.url, req.body, req.json, headers);
       console.log("RESPONSE:", res.statusCode, res.body, res.headers);
     }
    return done();
  },

  setPaymentOutcome: (context, _events, done) => {
    const target = context.vars.target || '';

    const isLocalhost =
      target.includes('localhost') ||
      target.includes('127.0.0.1');

    context.vars.PAY_GOV_URL = isLocalhost
      ? "http://localhost:3366"
      : "https://pay-gov-dev.ustaxcourt.gov";

    const outcomes = [
      { method: 'PAYPAL', status: 'Success' },
      { method: 'PLASTIC_CARD', status: 'Success' },
      { method: 'ACH', status: 'Success' },
      { method: 'PAYPAL', status: 'Failed' },
      { method: 'PLASTIC_CARD', status: 'Failed' },
      { method: 'ACH', status: 'Failed' }
    ];

    const choice = outcomes[Math.floor(Math.random() * outcomes.length)];

    context.vars.choiceMethod = choice.method;
    context.vars.choiceStatus = choice.status;

    done();
  },

  setTokenHeader: (req, _context, _ee, done) => {
    req.headers = {
      ...req.headers,
      Authorization: `Bearer ${process.env.PAY_GOV_DEV_SERVER_ACCESS_TOKEN}`,
      'content-type': 'application/json',
      accept: 'application/json',
    };

    return done();
  }
};
