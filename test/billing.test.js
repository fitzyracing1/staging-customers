'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { emptyState, save, load } = require('../lib/store');
const { createCustomer, fundCustomer, subscribe, cancelSubscription, balanceOf } = require('../lib/models');
const { recordJob, ingestJobs } = require('../lib/jobs');
const { billJobs, pendingLitJobs } = require('../lib/billing');
const { createMemoryBackend } = require('../lib/payments/memory');
const { createStripeTestBackend } = require('../lib/payments/stripe-test');
const { createBitrateRegtestStub } = require('../lib/payments/bitrate-regtest');

function clock() {
  let n = 0;
  return () => `2026-11-17T00:00:0${n++}.000Z`;
}

function rng() {
  let n = 1;
  return () => (n++ * 0.01) % 1;
}

describe('customers, jobs, and billing', () => {
  let state, now, rand, payments;

  beforeEach(() => {
    state = emptyState();
    now = clock();
    rand = rng();
    payments = createMemoryBackend();
  });

  it('creates a customer and funds the test ledger', () => {
    const customer = createCustomer(state, { name: 'Acme Bot', id: 'cust_acme' }, now, rand);
    assert.equal(customer.id, 'cust_acme');
    fundCustomer(state, payments, { customerId: 'cust_acme', minor: 5000, currency: 'usd' }, now, rand);
    assert.equal(balanceOf(state, 'cust_acme', 'usd'), 5000);
  });

  it('refuses a duplicate customer id', () => {
    createCustomer(state, { name: 'A', id: 'cust_a' }, now, rand);
    assert.throws(() => createCustomer(state, { name: 'B', id: 'cust_a' }, now, rand), /already exists/);
  });

  it('requires a customer name', () => {
    assert.throws(() => createCustomer(state, { name: '  ' }, now, rand), /name is required/);
  });

  it('subscribes a customer to a repo and refuses a second active subscription', () => {
    createCustomer(state, { name: 'Acme', id: 'cust_acme' }, now, rand);
    const sub = subscribe(state, { customerId: 'cust_acme', repo: 'fitzyracing1/fakegreen', priceMinor: 150 }, now, rand);
    assert.equal(sub.priceMinor, 150);
    assert.equal(sub.plan, 'lit-build');
    assert.throws(
      () => subscribe(state, { customerId: 'cust_acme', repo: 'fitzyracing1/fakegreen' }, now, rand),
      /already has an active subscription/,
    );
  });

  it('bills only lit jobs, and only once', () => {
    createCustomer(state, { name: 'Acme', id: 'cust_acme' }, now, rand);
    fundCustomer(state, payments, { customerId: 'cust_acme', minor: 1000 }, now, rand);
    subscribe(state, { customerId: 'cust_acme', repo: 'acme/app', priceMinor: 100 }, now, rand);
    const lit = recordJob(state, { customerId: 'cust_acme', repo: 'acme/app', result: 'lit', source: 'manual' }, now, rand);
    recordJob(state, { customerId: 'cust_acme', repo: 'acme/app', result: 'dark', source: 'manual' }, now, rand);
    recordJob(state, { customerId: 'cust_acme', repo: 'acme/app', result: 'untested', source: 'manual' }, now, rand);
    assert.equal(pendingLitJobs(state).length, 1);
    const first = billJobs(state, payments, {}, now, rand);
    assert.equal(first.filter((r) => r.billed).length, 1);
    assert.equal(first[0].jobId, lit.id);
    assert.equal(lit.billed, true);
    assert.equal(balanceOf(state, 'cust_acme', 'usd'), 900);
    const second = billJobs(state, payments, {}, now, rand);
    assert.equal(second.length, 0);
    assert.equal(state.jobs.filter((j) => j.billed).length, 1);
  });

  it('does not bill a lit job when funds are short, and leaves it unbilled', () => {
    createCustomer(state, { name: 'Acme', id: 'cust_acme' }, now, rand);
    fundCustomer(state, payments, { customerId: 'cust_acme', minor: 50 }, now, rand);
    subscribe(state, { customerId: 'cust_acme', repo: 'acme/app', priceMinor: 100 }, now, rand);
    const job = recordJob(state, { customerId: 'cust_acme', repo: 'acme/app', result: 'lit' }, now, rand);
    const results = billJobs(state, payments, {}, now, rand);
    assert.equal(results[0].billed, false);
    assert.match(results[0].reason, /insufficient test funds/);
    assert.equal(job.billed, false);
    assert.equal(balanceOf(state, 'cust_acme', 'usd'), 50);
  });

  it('does not bill after the subscription is canceled', () => {
    createCustomer(state, { name: 'Acme', id: 'cust_acme' }, now, rand);
    fundCustomer(state, payments, { customerId: 'cust_acme', minor: 500 }, now, rand);
    const sub = subscribe(state, { customerId: 'cust_acme', repo: 'acme/app', priceMinor: 100 }, now, rand);
    cancelSubscription(state, sub.id, now);
    recordJob(state, { customerId: 'cust_acme', repo: 'acme/app', result: 'lit' }, now, rand);
    const results = billJobs(state, payments, {}, now, rand);
    assert.equal(results[0].billed, false);
    assert.match(results[0].reason, /no active subscription/);
  });

  it('ingests a bot-customers job record and a discuss-build queue', () => {
    createCustomer(state, { name: 'Acme', id: 'cust_acme' }, now, rand);
    fundCustomer(state, payments, { customerId: 'cust_acme', minor: 500 }, now, rand);
    subscribe(state, { customerId: 'cust_acme', repo: 'acme/app', priceMinor: 25 }, now, rand);
    const ingested = ingestJobs(state, {
      schema: 'discuss-build-job/v0.1',
      id: 'job_from_bot',
      source: 'bot-customers',
      repo: 'acme/app',
      result: 'lit',
      tester: { tool: 'bot-customers', version: '0.1.0', method: 'npm test' },
      logsSummary: 'ok',
    }, { customerId: 'cust_acme' }, now, rand);
    assert.equal(ingested[0].id, 'job_from_bot');
    assert.equal(ingested[0].customerId, 'cust_acme');
    const fromQueue = ingestJobs(state, {
      source: 'acme/app',
      items: [
        { built: true, ciStatus: 'lit', branch: 'feat/x', item: { number: 9, title: 'x', type: 'issue' } },
      ],
    }, { customerId: 'cust_acme' }, now, rand);
    assert.equal(fromQueue[0].source, 'discuss-build');
    assert.equal(fromQueue[0].issue.number, 9);
    const billed = billJobs(state, payments, {}, now, rand);
    assert.equal(billed.filter((r) => r.billed).length, 2);
    assert.equal(balanceOf(state, 'cust_acme', 'usd'), 450);
  });

  it('refuses to record a job for an unknown customer', () => {
    assert.throws(
      () => recordJob(state, { customerId: 'cust_missing', repo: 'acme/app', result: 'lit' }, now, rand),
      /unknown customer/,
    );
  });

  it('persists and reloads the store', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-customers-'));
    const file = path.join(dir, 'store.json');
    createCustomer(state, { name: 'Acme', id: 'cust_acme' }, now, rand);
    save(file, state);
    const loaded = load(file);
    assert.equal(loaded.customers[0].id, 'cust_acme');
    assert.deepEqual(load(path.join(dir, 'missing.json')).customers, []);
  });

  it('bills usd through the stripe-test adapter when a sk_test_ key is provided', () => {
    const stripe = createStripeTestBackend({ key: 'sk_test_fakefakefake' });
    createCustomer(state, { name: 'Acme', id: 'cust_acme' }, now, rand);
    fundCustomer(state, stripe, { customerId: 'cust_acme', minor: 200, currency: 'usd' }, now, rand);
    subscribe(state, { customerId: 'cust_acme', repo: 'acme/app', priceMinor: 80, currency: 'usd' }, now, rand);
    recordJob(state, { customerId: 'cust_acme', repo: 'acme/app', result: 'lit' }, now, rand);
    const results = billJobs(state, stripe, {}, now, rand);
    assert.equal(results[0].billed, true);
    assert.equal(results[0].backend, 'stripe-test');
    assert.equal(balanceOf(state, 'cust_acme', 'usd'), 120);
  });

  it('bills sats through the bitrate-regtest stub', () => {
    const stub = createBitrateRegtestStub();
    createCustomer(state, { name: 'Acme', id: 'cust_acme' }, now, rand);
    fundCustomer(state, stub, { customerId: 'cust_acme', minor: 1000, currency: 'sats' }, now, rand);
    subscribe(state, { customerId: 'cust_acme', repo: 'acme/app', priceMinor: 250, currency: 'sats' }, now, rand);
    recordJob(state, { customerId: 'cust_acme', repo: 'acme/app', result: 'lit' }, now, rand);
    const results = billJobs(state, stub, {}, now, rand);
    assert.equal(results[0].billed, true);
    assert.equal(results[0].amount.currency, 'sats');
    assert.equal(balanceOf(state, 'cust_acme', 'sats'), 750);
  });
});
