'use strict';

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const aws4 = require('aws4');

module.exports = {
  setSignedBody: (req, context, ee, done) => {
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

  signWithSigV4IfNeeded: (req, context, ee, done) => {
    let body = req.body || '';
    let opts;
    req.headers = req.headers || {};

    const parsed = new URL(req.url);
    const host = parsed.host;

    const isLocalhost =
      host.includes('localhost') ||
      host.includes('127.0.0.1');

    req.headers.Host = host;
    // req.headers.Accept = 'application/json';
    req.headers['content-type'] = 'application/json';
    req.headers.accept = 'application/json';

    // if (req.json !== undefined) {
    //   body = JSON.stringify(req.json);
    //   delete req.json;
    // } else if (req.body === undefined || req.body === null) {
    //   body = '';
    // } else if (typeof req.body === 'string') {
    //   body = req.body;
    // } else {
    //   body = JSON.stringify(req.body);
    // }

    if (!isLocalhost && process.env.AWS_SESSION_TOKEN) {
      req.headers['x-amz-security-token'] = process.env.AWS_SESSION_TOKEN;
      const region =
        process.env.SIGV4_REGION ??
        process.env.AWS_REGION ??
        "us-east-1";

      opts = {
        host,
        // port: parsed.protocol === 'https:' ? 443 : 80,
        method: req.method,
        path: parsed.pathname + (parsed.search || ""),
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
      req.body = opts.body;

      req._artilleryRawBody = true;

      return done();
    }

    opts = {
      host,
      method: req.method,
      path: parsed.pathname + (parsed.search || ""),
    }

    req.headers = opts.headers;

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

  choosePaymentOutcome: (context, events, done) => {
    if (!context.vars.paymentToken) {
      console.log("Skipping payment step: no token");
      return done();
    }

    const token = context.vars.paymentToken;

    const parsed = new URL(context.vars.target);

    const isLocalhost =
      parsed.hostname.includes('localhost') ||
      parsed.hostname.includes('127.0.0.1');

    const outcomes = [
      { method: 'PAYPAL', status: 'Success' },
      { method: 'PLASTIC_CARD', status: 'Success' },
      { method: 'ACH', status: 'Success' },
      { method: 'PAYPAL', status: 'Failed' },
      { method: 'PLASTIC_CARD', status: 'Failed' },
      { method: 'ACH', status: 'Failed' }
    ];

    const choice = outcomes[Math.floor(Math.random() * outcomes.length)];

    if (isLocalhost) {
      const options = {
        hostname: 'localhost',
        port: 3366,
        path: `/pay/${choice.method}/${choice.status}?token=${token}`,
        method: 'POST'
      };

      const req = http.request(options, (res) => {
        res.on('data', () => {});
        res.on('end', done);
      });

      req.on('error', (err) => {
        console.error('choosePaymentOutcome error:', err.message);
        done();
      });

      req.end();
      return;
    }

    const hostname = 'pay-gov-dev.ustaxcourt.gov';
    const path = `/pay/${choice.method}/${choice.status}?token=${token}`;

    const headers = {
      'Content-Type': 'application/json',
      Host: hostname
    };

    if (process.env.AWS_SESSION_TOKEN) {
      headers['X-Amz-Security-Token'] = process.env.AWS_SESSION_TOKEN;
    }

    const signOpts = {
      host: hostname,
      method: 'POST',
      path,
      service: 'execute-api',
      region: process.env.AWS_REGION || 'us-east-1',
      headers
    };

    aws4.sign(signOpts, {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN
    });

    const options = {
      hostname,
      port: 443,
      path,
      method: 'POST',
      headers: signOpts.headers
    };

    const req = http.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', done);
    });

    req.on('error', (err) => {
      console.error('choosePaymentOutcome error:', err.message);
      done();
    });

    req.end();
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
      return done(new Error("Payment not completed yet")); // ❌ force retry
    }

    console.log("Payment complete:", status);
    return done();
  }

};
