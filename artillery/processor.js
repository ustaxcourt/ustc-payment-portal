'use strict';

const crypto = require('crypto');
const { URL } = require('url');
const aws4 = require('aws4');

require('dotenv').config();

module.exports = {
  setSignedInitBody: (req, context, ee, done) => {
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

  signWithSigV4IfNeeded: (req, context, ee, done) => {
    let body = req.body || '';
    let opts;
    let path;
    req.headers = req.headers || {};

    const parsedBase = new URL(context.vars.target);
    const host = parsedBase.host;

    const isApiGw =
      host.includes('execute-api') &&
      host.includes('amazonaws.com');

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

    if (isApiGw) {
      // API Gateway needs stage in path
      path = fullUrl.pathname + (fullUrl.search || "");
    } else {
      // Custom domain strips stage
      path = fullUrl.pathname + (fullUrl.search || "");
    }

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

    if (!isLocalhost && process.env.AWS_SESSION_TOKEN) {
      req.headers['x-amz-security-token'] = process.env.AWS_SESSION_TOKEN;
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

      req.headers = opts.headers;
      // req.body = opts.body;
      req.body = (req.method === 'GET') ? undefined : opts.body;
      req._artilleryRawBody = true;

      return done();
    }

    return done();
  },

  debugHeaders: (req, context, ee, next) => {
    if (process.env.ARTILLERY_DEBUG_HEADERS === "1") {
      console.log("Authorization header:", req.headers?.authorization);
    }
    return next();
  },

  setTransactionReferenceId: (context, events, done) => {
    const uuid = crypto.randomUUID();
    context.vars.transactionReferenceId = uuid;
    return done();
  },

  logResponse: (req, res, context, ee, done) => {
     if (process.env.ARTILLERY_DEBUG_RESPONSES === "1" || (res.statusCode ?? 0) >= 400) {
      console.log("REQUEST:", req.method, req.url, req.body, req.json, req.headers);
      console.log("RESPONSE:", res.statusCode, res.body, res.headers);
     }
    return done();
  },

  validatePaymentComplete: (req, res, context, ee, done) => {
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

  setPaymentOutcome: (context, events, done) => {
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

  setTokenHeader: (req, context, ee, done) => {
    req.headers = {
      ...req.headers,
      Authorization: `Bearer ${process.env.PAY_GOV_DEV_SERVER_ACCESS_TOKEN}`,
      'content-type': 'application/json',
      accept: 'application/json',
    };

    return done();
  }
};
