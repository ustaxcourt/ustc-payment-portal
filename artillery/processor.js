const crypto = require('crypto');
const { URL } = require('url');
const aws4 = require('aws4');

require('dotenv').config();

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

  setSignedProcessBody: (req, context, ee, done) => {
    const bodyObj = {
      token: context.vars.paymentToken,
    };
    req.body = JSON.stringify(bodyObj);
    return done();
  },

  signWithSigV4IfNeeded: (req, context, _ee, done) => {
    let body = req.body || "";
    let opts;
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

    // Sign the request with AWS SigV4 if not localhost and AWS_SESSION_TOKEN is present
    if (!isLocalhost && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      if (process.env.AWS_SESSION_TOKEN) {
        req.headers['x-amz-security-token'] = process.env.AWS_SESSION_TOKEN;
      }
      const region =
        process.env.SIGV4_REGION ??
        process.env.AWS_REGION ??
        "us-east-1";

      opts = {
        host,
        method: req.method,
        path: fullUrl.pathname + (fullUrl.search || ""),
        service: "execute-api",
        region,
        headers: {
          ...req.headers,
        },
        body,
      };

      aws4.sign(opts, {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
      });

      req.headers = opts.headers;      // req.body = opts.body;
      req.body = (req.method === 'GET') ? undefined : opts.body;
      req._artilleryRawBody = true;

      return done();
    }

    return done();
  },

  debugHeaders: (req, _context, _ee, next) => {
    if (process.env.ARTILLERY_DEBUG_HEADERS === "1") {
      console.log("Authorization header:", req.headers?.authorization);
    }
    return next();
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
       console.log("REQUEST:", req.method, req.url, req.body, req.json, headers);
       console.log("RESPONSE:", res.statusCode, res.body, res.headers);
     }
    return done();
  },

  validatePaymentComplete: (_req, res, _context, _ee, done) => {
    let body;

    try {
      body = JSON.parse(res.body);
    } catch (e) {
      return done(new Error("Invalid JSON response"));
    }

    const status = body.paymentStatus;

    if (!status || status === 'pending' || status === 'NOT_READY') {
      console.log("Payment not ready yet:", status);
      if (!status || status === 'pending' || status === 'NOT_READY') {
        console.log("Payment not ready yet:", status);
        return done(new Error("retry")); // keep as retry signal
      }
      return done(new Error("Payment not completed yet"));
    }

    console.log("Payment complete:", status);
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
