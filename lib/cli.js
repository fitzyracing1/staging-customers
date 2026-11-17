'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs, USAGE } = require('./args');
const store = require('./store');
const { createBackend } = require('./payments');
const {
  createCustomer,
  requireCustomer,
  fundCustomer,
  subscribe,
  cancelSubscription,
  balanceOf,
} = require('./models');
const { recordJob, ingestJobs } = require('./jobs');
const { billJobs } = require('./billing');
const { CURRENCIES } = require('./schema');

function print(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function openSession(opts) {
  const storePath = path.resolve(opts.store);
  const state = store.load(storePath);
  const payments = createBackend(opts.backend, { stripeKey: opts.stripeKey });
  state.backend = payments.name;
  return { storePath, state, payments };
}

function persist(session) {
  store.save(session.storePath, session.state);
}

function balancesFor(state, customerId) {
  const out = {};
  for (const currency of CURRENCIES) {
    out[currency] = balanceOf(state, customerId, currency);
  }
  return out;
}

async function main(argv, deps = {}) {
  const opts = deps.parseArgs ? deps.parseArgs(argv) : parseArgs(argv);
  if (opts.help || !opts.command) {
    console.log(USAGE);
    if (!opts.help && !opts.command) {
      throw new Error('a command is required');
    }
    return { usage: true };
  }

  const now = deps.now || (() => new Date().toISOString());
  const rng = deps.rng || Math.random;
  const session = (deps.openSession || openSession)(opts);
  const { state, payments } = session;

  const cmd = opts.command;
  const sub = opts.sub;

  if (cmd === 'backend') {
    const info = {
      backend: payments.name,
      description: payments.description,
      stub: Boolean(payments.stub),
      store: session.storePath,
    };
    print(info);
    return info;
  }

  if (cmd === 'customer' && sub === 'create') {
    const customer = createCustomer(state, { name: opts.name, id: opts.id }, now, rng);
    persist(session);
    print(customer);
    return customer;
  }

  if (cmd === 'customer' && sub === 'list') {
    const rows = state.customers.map((c) => ({ ...c, balances: balancesFor(state, c.id) }));
    print(rows);
    return rows;
  }

  if (cmd === 'customer' && (sub === 'show' || sub === 'get')) {
    const customer = requireCustomer(state, opts.customerId);
    const result = {
      ...customer,
      balances: balancesFor(state, customer.id),
      subscriptions: state.subscriptions.filter((s) => s.customerId === customer.id),
      jobs: state.jobs.filter((j) => j.customerId === customer.id).length,
    };
    print(result);
    return result;
  }

  if (cmd === 'fund') {
    if (!opts.customerId) throw new Error('fund needs a customer id');
    if (opts.minor == null) throw new Error('fund needs --minor');
    const entry = fundCustomer(state, payments, {
      customerId: opts.customerId,
      minor: opts.minor,
      currency: opts.currency,
      reason: opts.reason,
    }, now, rng);
    persist(session);
    print({
      entry,
      balances: balancesFor(state, opts.customerId),
    });
    return entry;
  }

  if (cmd === 'subscribe') {
    const subn = subscribe(state, {
      customerId: opts.customerId,
      repo: opts.repo,
      plan: opts.plan,
      priceMinor: opts.priceMinor,
      currency: opts.currency,
    }, now, rng);
    persist(session);
    print(subn);
    return subn;
  }

  if (cmd === 'subscription' && sub === 'list') {
    let rows = state.subscriptions;
    if (opts.customerId) rows = rows.filter((s) => s.customerId === opts.customerId);
    print(rows);
    return rows;
  }

  if (cmd === 'subscription' && sub === 'cancel') {
    const canceled = cancelSubscription(state, opts.subscriptionId, now);
    persist(session);
    print(canceled);
    return canceled;
  }

  if (cmd === 'job' && sub === 'record') {
    if (!opts.customerId) throw new Error('job record needs --customer');
    if (!opts.repo) throw new Error('job record needs --repo');
    if (!opts.result) throw new Error('job record needs --result lit|dark|untested');
    const job = recordJob(state, {
      id: opts.id,
      customerId: opts.customerId,
      source: opts.source || 'manual',
      repo: opts.repo,
      result: opts.result,
      branch: opts.branch,
      logsSummary: opts.logsSummary,
      issue: (opts.issue || opts.issueUrl || opts.title || opts.type)
        ? {
          number: opts.issue == null ? null : Number(opts.issue),
          url: opts.issueUrl || null,
          title: opts.title || '',
          type: opts.type || (opts.issue ? 'issue' : 'test-run'),
        }
        : null,
    }, now, rng);
    persist(session);
    print(job);
    return job;
  }

  if (cmd === 'job' && sub === 'ingest') {
    if (!opts.file) throw new Error('job ingest needs a file path');
    const filePath = path.resolve(opts.file);
    const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const ingested = ingestJobs(state, doc, { customerId: opts.customerId || null }, now, rng);
    persist(session);
    print({ ingested: ingested.length, jobs: ingested });
    return ingested;
  }

  if (cmd === 'job' && sub === 'list') {
    let rows = state.jobs;
    if (opts.customerId) rows = rows.filter((j) => j.customerId === opts.customerId);
    if (opts.repo) rows = rows.filter((j) => j.repo === opts.repo);
    print(rows);
    return rows;
  }

  if (cmd === 'bill') {
    const results = billJobs(state, payments, {
      customerId: opts.customerId,
      jobId: opts.jobId,
    }, now, rng);
    persist(session);
    print({ billed: results.filter((r) => r.billed).length, results });
    return results;
  }

  if (cmd === 'ledger') {
    let rows = state.ledger;
    if (opts.customerId) rows = rows.filter((r) => r.customerId === opts.customerId);
    const summary = opts.customerId
      ? { customerId: opts.customerId, balances: balancesFor(state, opts.customerId), entries: rows }
      : { entries: rows };
    print(summary);
    return summary;
  }

  throw new Error(`unknown command: ${cmd}${sub ? ' ' + sub : ''}. Pass --help to see usage.`);
}

module.exports = { main, USAGE };
