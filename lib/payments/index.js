'use strict';
const { createMemoryBackend } = require('./memory');
const { createStripeTestBackend } = require('./stripe-test');
const { createBitrateRegtestStub } = require('./bitrate-regtest');

const BACKENDS = new Set(['memory', 'stripe-test', 'bitrate-regtest']);

function createBackend(name, opts = {}) {
  const kind = name || 'memory';
  if (!BACKENDS.has(kind)) {
    throw new Error(`unknown payment backend: ${kind}. Use memory, stripe-test, or bitrate-regtest.`);
  }
  if (kind === 'memory') return createMemoryBackend();
  if (kind === 'stripe-test') return createStripeTestBackend({ key: opts.stripeKey });
  return createBitrateRegtestStub();
}

module.exports = { createBackend, BACKENDS };
