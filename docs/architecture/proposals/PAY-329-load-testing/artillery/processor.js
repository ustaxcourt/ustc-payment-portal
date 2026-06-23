'use strict';

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');
const aws4 = require('aws4');

module.exports = {
  signWithSigV4IfNeeded: (req, context, ee, done) => {
    req.headers = req.headers || {};

    const parsed = new URL(req.url);
    const host = parsed.host;

    const isLocalhost =
      host.includes('localhost') ||
      host.includes('127.0.0.1');

    if (isLocalhost) {
      req.headers.Authorization = process.env.PAY_GOV_DEV_SERVER_ACCESS_TOKEN;
      return done();
    }

    // ✅ Ensure headers BEFORE signing
    req.headers.Host = host;
    req.headers['Content-Type'] = 'application/json';

    if (process.env.AWS_SESSION_TOKEN) {
      req.headers['X-Amz-Security-Token'] =
        process.env.AWS_SESSION_TOKEN;
    }

    // ✅ CRITICAL: exact body reconstruction
    let body;
    if (req.json) {
      body = JSON.stringify(req.json);
    } else if (typeof req.body === 'string') {
      body = req.body;
    } else {
      body = '';
    }

    const opts = {
      host,
      method: req.method,
      path: parsed.pathname + (parsed.search || ''),
      service: 'execute-api',
      region: 'us-east-1',
      headers: {
        ...req.headers
      },
      body
    };

    aws4.sign(opts, {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN
    });

    req.headers = opts.headers;

    return done();
  },

  debugHeaders: (req, context, ee, next) => {
    console.log("Authorization header:", req.headers?.authorization);
    return next();
  },

  setTransactionReferenceId: (context, events, done) => {
    const uuid = crypto.randomUUID();
    context.vars.transactionReferenceId = uuid;
    return done();
  },

  choosePaymentOutcome: (context, events, done) => {
    const token = context.vars.paymentToken;

    // ✅ Define combinations from your HTML
    const outcomes = [
      { method: 'PAYPAL', status: 'Success' },
      { method: 'PLASTIC_CARD', status: 'Success' },
      { method: 'ACH', status: 'Success' },
      { method: 'PAYPAL', status: 'Failed' },
      { method: 'PLASTIC_CARD', status: 'Failed' },
      { method: 'ACH', status: 'Failed' }
    ];

    // ✅ Optional: include cancel scenario (~10%)
    const shouldCancel = Math.random() < 0.1;

    let path;

    if (shouldCancel) {
      // console.log('Simulating CANCEL');
      path = `/pay/CANCEL/Cancel?token=${token}`;
    } else {
      // ✅ Pick a random outcome
      const choice = outcomes[Math.floor(Math.random() * outcomes.length)];

      // console.log(`Simulating ${choice.method} - ${choice.status}`);

      path = `/pay/${choice.method}/${choice.status}?token=${token}`;
    }

    const options = {
      hostname: 'localhost',
      port: 3366,
      path,
      method: 'POST'
    };

    const req = http.request(options, (res) => {
      res.on('data', () => {}); // ignore body
      res.on('end', () => {
        // console.log('PAY call completed');
        done();
      });
    });

    req.on('error', (err) => {
      // console.error('Error calling /pay:', err);
      done(); // prevent blocking
    });

    req.end();
  },

  logResponse: (req, res, context, ee, done) => {
    console.log("STATUS:", res.statusCode);
    console.log("BODY:", res.body);
    return done();
  }
};
