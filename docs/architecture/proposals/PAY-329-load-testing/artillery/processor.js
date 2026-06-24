'use strict';

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const aws4 = require('aws4');

module.exports = {
  signWithSigV4IfNeeded: (req, context, ee, done) => {
    req.headers = req.headers || {};
    let body;
    let opts;

    const parsed = new URL(req.url);
    const host = parsed.host;

    const isLocalhost =
      host.includes('localhost') ||
      host.includes('127.0.0.1');

    req.headers.Host = host;
    req.headers['Content-Type'] = 'application/json';

    if (req.json) {
      body = JSON.stringify(req.json);
    } else if (typeof req.body === 'string') {
      body = req.body;
    } else {
      body = '';
    }

    if (!isLocalhost && process.env.AWS_SESSION_TOKEN) {
      req.headers['X-Amz-Security-Token'] = process.env.AWS_SESSION_TOKEN;
      const region =
        process.env.SIGV4_REGION ??
        process.env.AWS_REGION ??
        "us-east-1";

      opts = {
        host,
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

    const req = https.request(options, (res) => {
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
       console.log("STATUS:", res.statusCode);
       console.log("BODY:", res.body);
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
