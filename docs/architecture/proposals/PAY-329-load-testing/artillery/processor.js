'use strict';

const http = require('http');
const crypto = require('crypto');

module.exports = {
  setTransactionReferenceId: (context, events, done) => {

 // Simple UUID generator (no external deps)
    const uuid = crypto.randomUUID();
    context.vars.transactionReferenceId = uuid;
    // console.log('Generated transactionReferenceId:', uuid);
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
  }
};
