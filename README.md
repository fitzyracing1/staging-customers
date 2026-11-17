# staging-customers

A staging environment that simulates customers of [discuss-build](https://github.com/fitzyracing1/discuss-build). You create bot customers, subscribe them to a repository, record the jobs discuss-build (or [bot-customers](https://github.com/fitzyracing1/bot-customers)) ran, and "pay" with test money when a job comes back **lit**. This is how we prove the loop — subscribe, build, lit or dark, then bill — before any real money is involved.

Author: Joshua Almeida ([@fitzyracing1](https://github.com/fitzyracing1)). MIT.

Switching to real money later is a deliberate change that Joshua must OK. It is not part of this software, and this tool will not take real payments.

## How it connects to discuss-build

discuss-build reads a repo's issues and discussions, picks concrete asks, builds each one on a branch of the subscriber's own fork, and counts a build only once CI is lit. staging-customers sits beside that tool as the customer and billing side of a staging run:

1. A test customer is created and funded with test money.
2. That customer is subscribed to a repository, with a price per lit job.
3. discuss-build (or bot-customers) does the work and produces a lit, dark, or untested result.
4. The job is recorded here, either by hand or by ingesting a job record (or a discuss-build `queue.json`).
5. `staging-customers bill` charges the ledger only for lit jobs, and only once per job. Dark and untested work is kept on the record, not billed.

## Test money

The ledger has pluggable payment backends:

- **memory** (default) — a fake, file-backed backend. It never talks to a network. Tests and the default CLI use this.
- **stripe-test** — a Stripe test-mode adapter. It accepts only `sk_test_` secret keys and refuses anything else, including live keys. It records simulated test-mode charges. It does not take real payments, and it never prints a key.
- **bitrate-regtest** — an optional stub, clearly marked as a stub. It records satoshi amounts as a stand-in for a later Bitrate regtest hook. It is not Bitcoin mainnet, not a real payment, and not the Bitrate tool itself.

## CLI

Zero runtime dependencies. Node ≥ 18.

```
staging-customers customer create --name "Acme Bot"
staging-customers fund cust_... --minor 5000
staging-customers subscribe cust_... --repo owner/repo --price-minor 100
staging-customers job record --customer cust_... --repo owner/repo --issue 12 --result lit
staging-customers job ingest path/to/job.json --customer cust_...
staging-customers bill
staging-customers ledger
```

`--store` picks the JSON store file (default `out/store.json`). `--backend` picks the payment backend (`memory`, `stripe-test`, or `bitrate-regtest`). For `stripe-test`, pass `--stripe-key` or set `STRIPE_SECRET_KEY` to an `sk_test_` key. Any other key is refused.

## Job records

bot-customers and staging-customers share a JSON job-record schema named `discuss-build-job/v0.1`. `job ingest` accepts one record, an array of records, a `{ "jobs": [...] }` wrapper, or a discuss-build `queue.json` (built items only).

```json
{
  "schema": "discuss-build-job/v0.1",
  "id": "job_01example",
  "customerId": "cust_01example",
  "subscriptionId": "sub_01example",
  "source": "bot-customers",
  "repo": "owner/repo",
  "issue": {
    "number": 1,
    "url": "https://github.com/owner/repo/issues/1",
    "title": "A concrete ask",
    "type": "issue"
  },
  "branch": "feat/example",
  "result": "lit",
  "billed": false,
  "billId": null,
  "amount": null,
  "logsSummary": "npm test exited 0",
  "startedAt": "2026-11-17T03:00:00.000Z",
  "finishedAt": "2026-11-17T03:01:00.000Z",
  "tester": {
    "tool": "bot-customers",
    "version": "0.1.0",
    "method": "npm test"
  },
  "createdAt": "2026-11-17T03:01:00.000Z"
}
```

Field notes:

- `source` is `bot-customers`, `discuss-build`, `manual`, or `ingest`.
- `result` is `lit`, `dark`, or `untested`.
- `issue.type` is `issue`, `discussion`, or `test-run`. `issue` itself may be `null`.
- `amount` is `{ "currency": "usd" | "sats", "minor": <non-negative integer> }` or `null`. For `usd`, `minor` is cents. For `sats`, `minor` is satoshis. Amount is filled in when a lit job is billed.
- `billed` starts false. Only `staging-customers bill` marks a job billed.

The same schema is documented in the [bot-customers README](https://github.com/fitzyracing1/bot-customers).

## Tests

`npm test` runs the offline suite (no network, no live keys). CI is the `test` workflow on push and pull request.

## License

MIT. Copyright (c) 2026 Joshua Almeida.
