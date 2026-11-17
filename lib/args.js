'use strict';

const USAGE = `staging-customers — simulate discuss-build customers with test money only.

Usage:
  staging-customers customer create --name NAME [--id ID]
  staging-customers customer list
  staging-customers customer show <id>

  staging-customers fund <customerId> --minor N [--currency usd|sats] [--reason TEXT]

  staging-customers subscribe <customerId> --repo owner/repo [--plan NAME] [--price-minor N] [--currency usd|sats]
  staging-customers subscription list [--customer ID]
  staging-customers subscription cancel <id>

  staging-customers job record --customer ID --repo owner/repo --result lit|dark|untested
      [--issue N] [--issue-url URL] [--title TEXT] [--type issue|discussion|test-run]
      [--branch NAME] [--logs-summary TEXT] [--source manual|discuss-build|bot-customers]
  staging-customers job ingest <file> [--customer ID]
  staging-customers job list [--customer ID] [--repo owner/repo]

  staging-customers bill [--customer ID] [--job ID]
  staging-customers ledger [--customer ID]
  staging-customers backend

Global options:
  --store <path>          JSON store (default out/store.json)
  --backend memory|stripe-test|bitrate-regtest   (default memory)
  --stripe-key <key>      sk_test_ key for stripe-test (or STRIPE_SECRET_KEY)
  --help

This tool never takes real payments. The memory backend is the default.
The stripe-test adapter refuses any key that is not sk_test_.
The bitrate-regtest backend is a clearly marked stub, not a real Bitcoin payment.
Switching to real money later is a deliberate change that is not part of this tool.
`;

function takeFlag(argv, name) {
  const i = argv.indexOf(name);
  if (i === -1) return { value: undefined, rest: argv };
  if (i === argv.length - 1) {
    throw new Error(`${name} needs a value`);
  }
  const value = argv[i + 1];
  return { value, rest: argv.slice(0, i).concat(argv.slice(i + 2)) };
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function parseArgs(argv) {
  const raw = argv.slice();
  if (hasFlag(raw, '--help') || hasFlag(raw, '-h')) {
    return { help: true, command: 'help' };
  }

  let rest = raw;
  let store, backend, stripeKey;
  ({ value: store, rest } = takeFlag(rest, '--store'));
  ({ value: backend, rest } = takeFlag(rest, '--backend'));
  ({ value: stripeKey, rest } = takeFlag(rest, '--stripe-key'));

  const command = rest[0] || '';
  const sub = rest[1];
  const args = rest.slice(1);

  const opts = {
    help: false,
    command,
    sub,
    args,
    store: store || process.env.STAGING_CUSTOMERS_STORE || 'out/store.json',
    backend: backend || process.env.STAGING_PAYMENTS || 'memory',
    stripeKey: stripeKey || process.env.STRIPE_SECRET_KEY || '',
  };

  function opt(name) {
    const found = takeFlag(args, name);
    args.splice(0, args.length, ...found.rest);
    return found.value;
  }

  if (command === 'customer' && sub === 'create') {
    opts.name = opt('--name');
    opts.id = opt('--id');
  }
  if (command === 'customer' && (sub === 'show' || sub === 'get')) {
    opts.customerId = args[1] || args[0];
  }
  if (command === 'fund') {
    opts.customerId = args[0];
    opts.minor = opt('--minor');
    opts.currency = opt('--currency');
    opts.reason = opt('--reason');
  }
  if (command === 'subscribe') {
    opts.customerId = args[0];
    opts.repo = opt('--repo');
    opts.plan = opt('--plan');
    opts.priceMinor = opt('--price-minor');
    opts.currency = opt('--currency');
  }
  if (command === 'subscription' && sub === 'list') {
    opts.customerId = opt('--customer');
  }
  if (command === 'subscription' && sub === 'cancel') {
    opts.subscriptionId = args[1] || args[0];
  }
  if (command === 'job' && sub === 'record') {
    opts.customerId = opt('--customer');
    opts.repo = opt('--repo');
    opts.result = opt('--result');
    opts.issue = opt('--issue');
    opts.issueUrl = opt('--issue-url');
    opts.title = opt('--title');
    opts.type = opt('--type');
    opts.branch = opt('--branch');
    opts.logsSummary = opt('--logs-summary');
    opts.source = opt('--source');
    opts.id = opt('--id');
  }
  if (command === 'job' && sub === 'ingest') {
    opts.file = args[1] || args[0];
    opts.customerId = opt('--customer');
  }
  if (command === 'job' && sub === 'list') {
    opts.customerId = opt('--customer');
    opts.repo = opt('--repo');
  }
  if (command === 'bill') {
    opts.customerId = opt('--customer');
    opts.jobId = opt('--job');
  }
  if (command === 'ledger') {
    opts.customerId = opt('--customer');
  }

  return opts;
}

module.exports = { parseArgs, USAGE };
