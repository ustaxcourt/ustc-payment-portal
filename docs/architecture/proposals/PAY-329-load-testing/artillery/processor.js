'use strict';

module.exports = {
  processor: {
    choosePaymentOutcome: (context, events, done) => {
      const methods = ["PAYPAL", "PLASTIC_CARD", "ACH"];

      // 80% success, 20% failure
      const status = Math.random() < 0.8 ? "success" : "failed";
      const method = methods[Math.floor(Math.random() * methods.length)];

      // Make variables available to Artillery
      context.vars.paymentMethod = method;
      context.vars.paymentStatus = status;

      return done();
    }
  }
};
