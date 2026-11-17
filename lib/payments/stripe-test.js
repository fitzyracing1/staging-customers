'use strict';

function keyKind(key) {
  if (typeof key !== 'string' || key.length === 0) return 'missing';
  if (key.startsWith('sk_live_')) return 'live';
  if (key.startsWith('sk_test_')) return 'test';
  if (key.startsWith('pk_')) return 'publishable';
  if (key.startsWith('rk_')) return 'restricted';
  return 'unrecognized';
}

function assertTestKey(key) {
  const kind = keyKind(key);
  if (kind !== 'test') {
    const err = new Error(
      `Stripe test-mode adapter refused a ${kind} key. Only sk_test_ secret keys are accepted. The key itself was not printed.`,
    );
    err.code = 'STRIPE_KEY_REFUSED';
    err.keyKind = kind;
    throw err;
  }
}

function createStripeTestBackend(opts = {}) {
  const key = opts.key;
  assertTestKey(key);
  let seq = 0;
  return {
    name: 'stripe-test',
    description: 'Stripe test-mode adapter. Accepts only sk_test_ keys. Records simulated test-mode charges. Never takes real payments. The key is never printed.',
    keyKind: 'test',
    charge(input) {
      assertTestKey(key);
      if (input.amount.currency !== 'usd') {
        throw new Error('stripe-test backend only charges usd amounts (minor units are cents)');
      }
      const balance = input.balance || 0;
      if (input.amount.minor > balance) {
        const err = new Error(`insufficient test funds: need ${input.amount.minor} usd, have ${balance}`);
        err.code = 'INSUFFICIENT_FUNDS';
        throw err;
      }
      seq += 1;
      return {
        backend: 'stripe-test',
        backendRef: `ch_test_sim_${seq}`,
        amount: input.amount,
        simulated: true,
        mode: 'test',
      };
    },
    credit(input) {
      assertTestKey(key);
      if (input.amount.currency !== 'usd') {
        throw new Error('stripe-test backend only credits usd amounts (minor units are cents)');
      }
      seq += 1;
      return {
        backend: 'stripe-test',
        backendRef: `tu_test_sim_${seq}`,
        amount: input.amount,
        simulated: true,
        mode: 'test',
      };
    },
  };
}

module.exports = { createStripeTestBackend, assertTestKey, keyKind };
