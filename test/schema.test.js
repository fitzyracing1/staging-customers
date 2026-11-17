'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeJob, parseJobFile, fromDiscussBuildQueue, SCHEMA } = require('../lib/schema');

function base(extra = {}) {
  return {
    repo: 'fitzyracing1/discuss-build',
    result: 'lit',
    source: 'manual',
    ...extra,
  };
}

describe('job schema', () => {
  it('normalizes a valid job and stamps the shared schema name', () => {
    const job = normalizeJob(base({ logsSummary: 'ok' }));
    assert.equal(job.schema, SCHEMA);
    assert.equal(job.repo, 'fitzyracing1/discuss-build');
    assert.equal(job.result, 'lit');
    assert.equal(job.billed, false);
    assert.equal(job.logsSummary, 'ok');
  });

  it('rejects a missing repo', () => {
    assert.throws(() => normalizeJob({ result: 'lit' }), /owner\/repo/);
  });

  it('rejects an invalid result', () => {
    assert.throws(() => normalizeJob(base({ result: 'green' })), /lit, dark, or untested/);
  });

  it('rejects an unknown source', () => {
    assert.throws(() => normalizeJob(base({ source: 'paypal' })), /job.source/);
  });

  it('accepts a null issue', () => {
    const job = normalizeJob(base({ issue: null }));
    assert.equal(job.issue, null);
  });

  it('normalizes issue fields', () => {
    const job = normalizeJob(base({
      issue: { number: 12, url: 'https://example.com/12', title: 'Fix typo', type: 'issue' },
    }));
    assert.equal(job.issue.number, 12);
    assert.equal(job.issue.type, 'issue');
  });

  it('rejects a bad issue type', () => {
    assert.throws(() => normalizeJob(base({ issue: { type: 'pr' } })), /issue, discussion, or test-run/);
  });

  it('parses a single record, an array, and a jobs wrapper', () => {
    const one = parseJobFile(base({ id: 'job_a' }));
    assert.equal(one.length, 1);
    const many = parseJobFile([base({ id: 'job_b', result: 'dark' }), base({ id: 'job_c', result: 'untested' })]);
    assert.equal(many.length, 2);
    const wrapped = parseJobFile({ jobs: [base({ id: 'job_d' })] });
    assert.equal(wrapped[0].id, 'job_d');
  });

  it('maps a discuss-build queue.json, skipping items that were not built', () => {
    const jobs = fromDiscussBuildQueue({
      source: 'fitzyracing1/fakegreen',
      items: [
        { built: true, ciStatus: 'lit', branch: 'feat/typo', ciSummary: 'green', item: { number: 3, url: 'https://github.com/fitzyracing1/fakegreen/issues/3', title: 'Typo', type: 'issue' } },
        { built: false, ciStatus: null, item: { number: 4, title: 'RFC' } },
        { built: true, ciStatus: 'dark', branch: 'feat/fail', item: { number: 5, type: 'discussion' } },
      ],
    });
    assert.equal(jobs.length, 2);
    assert.equal(jobs[0].source, 'discuss-build');
    assert.equal(jobs[0].result, 'lit');
    assert.equal(jobs[0].issue.number, 3);
    assert.equal(jobs[1].result, 'dark');
    assert.equal(jobs[1].issue.type, 'discussion');
  });

  it('treats an unknown discuss-build ciStatus as untested', () => {
    const jobs = fromDiscussBuildQueue({
      source: 'acme/app',
      items: [{ built: true, ciStatus: 'running', item: { number: 1 } }],
    });
    assert.equal(jobs[0].result, 'untested');
  });

  it('rejects a negative amount', () => {
    assert.throws(() => normalizeJob(base({ amount: { currency: 'usd', minor: -1 } })), /non-negative/);
  });
});
