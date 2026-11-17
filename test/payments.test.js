'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createBackend } = require('../lib/payments');
const { createMemoryBackend } = require('../lib/payments/memory');
const { createStripeTestBackend, assertTestKey, keyKind } = require('../lib/payments/stripe-test');
const { createBitrateRegtestStub, STUB_BANNER } = require('../lib/payments/bitrate-regtest');

describe('payment backends', () => {
  it('defaults to the memory backend through the factory', () => {
    const backend = createBackend('memory');
    assert.equal(backend.name, 'memory');
    const charge = backend.charge({
      jobId: 'job_1',
      amount: { currency: 'usd', minor: 100 },
      balance: 500,
    });
    assert.equal(charge.backend, 'memory');
    assert.equal(charge.simulated, true);
  });

  it('memory backend refuses a charge larger than the available test funds', () => {
    const backend = createMemoryBackend();
    assert.throws(
      () => backend.charge({ amount: { currency: 'usd', minor: 200 }, balance: 50 }),
      /insufficient test funds/,
    );
  });

  it('classifies Stripe key kinds without echoing the key', () => {
    assert.equal(keyKind('sk_test_abc'), 'test');
    assert.equal(keyKind('sk_live_abc'), 'live');
    assert.equal(keyKind('pk_test_abc'), 'publishable');
    assert.equal(keyKind('rk_test_abc'), 'restricted');
    assert.equal(keyKind(''), 'missing');
    assert.equal(keyKind('nope'), 'unrecognized');
  });

  it('stripe-test accepts only sk_test_ keys', () => {
    const backend = createStripeTestBackend({ key: 'sk_test_fakefakefake' });
    assert.equal(backend.name, 'stripe-test');
    const charge = backend.charge({
      jobId: 'job_2',
      amount: { currency: 'usd', minor: 100 },
      balance: 100,
    });
    assert.equal(charge.mode, 'test');
    assert.equal(charge.simulated, true);
    assert.match(charge.backendRef, /^ch_test_sim_/);
  });

  it('stripe-test refuses a live secret key and does not print it', () => {
    const live = 'sk_live_this_must_not_appear';
    assert.throws(() => assertTestKey(live), (err) => {
      assert.equal(err.code, 'STRIPE_KEY_REFUSED');
      assert.equal(err.keyKind, 'live');
      assert.equal(err.message.includes(live), false);
      assert.match(err.message, /refused a live key/);
      return true;
    });
    assert.throws(() => createStripeTestBackend({ key: live }), /refused a live key/);
  });

  it('stripe-test refuses missing, publishable, and unrecognized keys', () => {
    assert.throws(() => createStripeTestBackend({ key: '' }), /refused a missing key/);
    assert.throws(() => createStripeTestBackend({ key: 'pk_test_abc' }), /refused a publishable key/);
    assert.throws(() => createStripeTestBackend({ key: 'not-a-key' }), /refused a unrecognized key/);
  });

  it('stripe-test only charges usd', () => {
    const backend = createStripeTestBackend({ key: 'sk_test_fakefakefake' });
    assert.throws(
      () => backend.charge({ amount: { currency: 'sats', minor: 10 }, balance: 10 }),
      /only charges usd/,
    );
  });

  it('bitrate-regtest stub is clearly marked and only records sats', () => {
    const backend = createBitrateRegtestStub();
    assert.equal(backend.stub, true);
    assert.match(backend.description, /not a real Bitcoin payment/);
    assert.match(STUB_BANNER, /STUB/);
    const credit = backend.credit({ customerId: 'cust_1', amount: { currency: 'sats', minor: 2500 } });
    assert.equal(credit.stub, true);
    assert.equal(credit.simulated, true);
    const charge = backend.charge({ amount: { currency: 'sats', minor: 100 }, balance: 2500, jobId: 'job_3' });
    assert.equal(charge.backend, 'bitrate-regtest');
    assert.throws(
      () => backend.charge({ amount: { currency: 'usd', minor: 1 }, balance: 100 }),
      /only records sats/,
    );
  });

  it('rejects an unknown backend name', () => {
    assert.throws(() => createBackend('mainnet'), /unknown payment backend/);
  });
});
