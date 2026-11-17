'use strict';
const { randomId } = require('./ids');
const { isRepo, CURRENCIES } = require('./schema');

function requireCustomer(state, customerId) {
  const customer = state.customers.find((c) => c.id === customerId);
  if (!customer) {
    throw new Error(`unknown customer: ${customerId}`);
  }
  return customer;
}

function createCustomer(state, opts, now, rng) {
  const name = String(opts.name || '').trim();
  if (!name) throw new Error('customer name is required');
  const id = opts.id || randomId('cust', rng);
  if (state.customers.some((c) => c.id === id)) {
    throw new Error(`customer already exists: ${id}`);
  }
  const customer = {
    id,
    name,
    createdAt: now(),
  };
  state.customers.push(customer);
  return customer;
}

function parseAmount(minor, currency) {
  const cur = currency || 'usd';
  if (!CURRENCIES.has(cur)) {
    throw new Error(`currency must be usd or sats (got ${cur})`);
  }
  const n = Number(minor);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('amount minor units must be a non-negative integer');
  }
  return { currency: cur, minor: n };
}

function balanceOf(state, customerId, currency) {
  let bal = 0;
  for (const row of state.ledger) {
    if (row.customerId !== customerId) continue;
    if (row.currency !== currency) continue;
    if (row.type === 'credit') bal += row.minor;
    else if (row.type === 'debit') bal -= row.minor;
  }
  return bal;
}

function addLedger(state, opts, now, rng) {
  const entry = {
    id: opts.id || randomId('led', rng),
    customerId: opts.customerId,
    type: opts.type,
    currency: opts.amount.currency,
    minor: opts.amount.minor,
    reason: opts.reason || '',
    jobId: opts.jobId || null,
    backend: opts.backend,
    backendRef: opts.backendRef || null,
    createdAt: now(),
  };
  state.ledger.push(entry);
  return entry;
}

function fundCustomer(state, payments, opts, now, rng) {
  const customer = requireCustomer(state, opts.customerId);
  const amount = parseAmount(opts.minor, opts.currency);
  const result = payments.credit({
    customerId: customer.id,
    amount,
    reason: opts.reason || 'test funds',
  });
  return addLedger(state, {
    type: 'credit',
    customerId: customer.id,
    amount,
    reason: opts.reason || 'test funds',
    backend: result.backend,
    backendRef: result.backendRef,
  }, now, rng);
}

function subscribe(state, opts, now, rng) {
  const customer = requireCustomer(state, opts.customerId);
  if (!isRepo(opts.repo)) {
    throw new Error(`repo must be owner/repo (got ${opts.repo || '(missing)'})`);
  }
  const amount = parseAmount(opts.priceMinor == null ? 100 : opts.priceMinor, opts.currency);
  const existing = state.subscriptions.find(
    (s) => s.customerId === customer.id && s.repo === opts.repo && s.status === 'active',
  );
  if (existing) {
    throw new Error(`customer ${customer.id} already has an active subscription to ${opts.repo}`);
  }
  const sub = {
    id: opts.id || randomId('sub', rng),
    customerId: customer.id,
    repo: opts.repo,
    plan: opts.plan || 'lit-build',
    priceMinor: amount.minor,
    currency: amount.currency,
    status: 'active',
    createdAt: now(),
  };
  state.subscriptions.push(sub);
  return sub;
}

function cancelSubscription(state, subscriptionId, now) {
  const sub = state.subscriptions.find((s) => s.id === subscriptionId);
  if (!sub) throw new Error(`unknown subscription: ${subscriptionId}`);
  if (sub.status === 'canceled') return sub;
  sub.status = 'canceled';
  sub.canceledAt = now();
  return sub;
}

function findActiveSubscription(state, customerId, repo) {
  return state.subscriptions.find(
    (s) => s.customerId === customerId && s.repo === repo && s.status === 'active',
  ) || null;
}

module.exports = {
  requireCustomer,
  createCustomer,
  parseAmount,
  balanceOf,
  addLedger,
  fundCustomer,
  subscribe,
  cancelSubscription,
  findActiveSubscription,
};
