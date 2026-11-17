'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, USAGE } = require('../lib/args');
const { main } = require('../lib/cli');

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-cli-'));
  return path.join(dir, 'store.json');
}

async function run(store, argv) {
  return main(['--store', store, ...argv], {
    now: (() => {
      let n = 0;
      return () => `2026-11-17T01:00:0${n++}.000Z`;
    })(),
    rng: (() => {
      let n = 1;
      return () => (n++ * 0.02) % 1;
    })(),
  });
}

describe('args and CLI', () => {
  it('prints usage for --help', async () => {
    const opts = parseArgs(['--help']);
    assert.equal(opts.help, true);
    assert.match(USAGE, /never takes real payments/);
    const result = await main(['--help']);
    assert.equal(result.usage, true);
  });

  it('requires a command when help was not asked', async () => {
    await assert.rejects(() => main([]), /a command is required/);
  });

  it('parses global backend and stripe-key flags without leaking them into commands', () => {
    const opts = parseArgs(['--backend', 'stripe-test', '--stripe-key', 'sk_test_abc', 'backend']);
    assert.equal(opts.backend, 'stripe-test');
    assert.equal(opts.stripeKey, 'sk_test_abc');
    assert.equal(opts.command, 'backend');
  });

  it('runs the subscribe-record-bill loop from the CLI', async () => {
    const store = tmpStore();
    const customer = await run(store, ['customer', 'create', '--name', 'Acme Bot', '--id', 'cust_acme']);
    assert.equal(customer.id, 'cust_acme');
    await run(store, ['fund', 'cust_acme', '--minor', '1000']);
    const sub = await run(store, ['subscribe', 'cust_acme', '--repo', 'acme/app', '--price-minor', '100']);
    assert.equal(sub.repo, 'acme/app');
    await run(store, ['job', 'record', '--customer', 'cust_acme', '--repo', 'acme/app', '--result', 'lit', '--issue', '7', '--title', 'Fix typo']);
    await run(store, ['job', 'record', '--customer', 'cust_acme', '--repo', 'acme/app', '--result', 'dark']);
    const billed = await run(store, ['bill']);
    assert.equal(billed.filter((r) => r.billed).length, 1);
    const shown = await run(store, ['customer', 'show', 'cust_acme']);
    assert.equal(shown.balances.usd, 900);
    const ledger = await run(store, ['ledger', '--customer', 'cust_acme']);
    assert.equal(ledger.entries.length, 2);
  });

  it('ingests a job file from the CLI', async () => {
    const store = tmpStore();
    await run(store, ['customer', 'create', '--name', 'Acme', '--id', 'cust_acme']);
    await run(store, ['fund', 'cust_acme', '--minor', '500']);
    await run(store, ['subscribe', 'cust_acme', '--repo', 'acme/app', '--price-minor', '40']);
    const dir = path.dirname(store);
    const jobFile = path.join(dir, 'job.json');
    fs.writeFileSync(jobFile, JSON.stringify({
      schema: 'discuss-build-job/v0.1',
      source: 'bot-customers',
      repo: 'acme/app',
      result: 'lit',
      logsSummary: 'npm test exited 0',
      tester: { tool: 'bot-customers', version: '0.1.0', method: 'npm test' },
    }));
    const ingested = await run(store, ['job', 'ingest', jobFile, '--customer', 'cust_acme']);
    assert.equal(ingested.length, 1);
    const billed = await run(store, ['bill', '--customer', 'cust_acme']);
    assert.equal(billed[0].billed, true);
  });

  it('refuses to start the stripe-test backend with a live key', async () => {
    const store = tmpStore();
    await assert.rejects(
      () => main(['--store', store, '--backend', 'stripe-test', '--stripe-key', 'sk_live_nope', 'backend']),
      /refused a live key/,
    );
  });

  it('describes the bitrate-regtest stub when selected', async () => {
    const store = tmpStore();
    const info = await main(['--store', store, '--backend', 'bitrate-regtest', 'backend']);
    assert.equal(info.stub, true);
    assert.match(info.description, /not a real Bitcoin payment/);
  });

  it('rejects an unknown command', async () => {
    const store = tmpStore();
    await assert.rejects(() => run(store, ['pay-real-money']), /unknown command/);
  });
});
