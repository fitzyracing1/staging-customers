'use strict';

function createMemoryBackend() {
  return {
    name: 'memory',
    description: 'Fake in-memory test-money backend. No network. Default.',
    charge(input) {
      const amount = input.amount;
      const balance = input.balance || 0;
      if (amount.minor > balance) {
        const err = new Error(`insufficient test funds: need ${amount.minor} ${amount.currency}, have ${balance}`);
        err.code = 'INSUFFICIENT_FUNDS';
        throw err;
      }
      return {
        backend: 'memory',
        backendRef: `mem_${input.jobId || 'charge'}`,
        amount,
        simulated: true,
      };
    },
    credit(input) {
      return {
        backend: 'memory',
        backendRef: `mem_credit_${input.customerId}`,
        amount: input.amount,
        simulated: true,
      };
    },
  };
}

module.exports = { createMemoryBackend };
