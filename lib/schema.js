'use strict';

const SCHEMA = 'discuss-build-job/v0.1';
const RESULTS = new Set(['lit', 'dark', 'untested']);
const SOURCES = new Set(['bot-customers', 'discuss-build', 'manual', 'ingest']);
const ISSUE_TYPES = new Set(['issue', 'discussion', 'test-run']);
const CURRENCIES = new Set(['usd', 'sats']);

function isRepo(value) {
  return typeof value === 'string' && /^[^/\s]+\/[^/\s]+$/.test(value);
}

function issueShape(issue) {
  if (issue == null) return null;
  if (typeof issue !== 'object') {
    throw new Error('job.issue must be an object or null');
  }
  const type = issue.type || 'issue';
  if (!ISSUE_TYPES.has(type)) {
    throw new Error(`job.issue.type must be issue, discussion, or test-run (got ${type})`);
  }
  const number = issue.number == null ? null : Number(issue.number);
  if (issue.number != null && !Number.isFinite(number)) {
    throw new Error('job.issue.number must be a number when present');
  }
  return {
    number,
    url: issue.url == null ? null : String(issue.url),
    title: issue.title == null ? '' : String(issue.title),
    type,
  };
}

function amountShape(amount) {
  if (amount == null) return null;
  if (typeof amount !== 'object') {
    throw new Error('job.amount must be an object or null');
  }
  const currency = String(amount.currency || 'usd');
  if (!CURRENCIES.has(currency)) {
    throw new Error(`amount.currency must be usd or sats (got ${currency})`);
  }
  const minor = Number(amount.minor);
  if (!Number.isFinite(minor) || minor < 0 || !Number.isInteger(minor)) {
    throw new Error('amount.minor must be a non-negative integer');
  }
  return { currency, minor };
}

function testerShape(tester) {
  if (tester == null) return null;
  if (typeof tester !== 'object') {
    throw new Error('job.tester must be an object or null');
  }
  return {
    tool: tester.tool == null ? null : String(tester.tool),
    version: tester.version == null ? null : String(tester.version),
    method: tester.method == null ? null : String(tester.method),
  };
}

function normalizeJob(input, defaults = {}) {
  if (!input || typeof input !== 'object') {
    throw new Error('job record must be an object');
  }
  const repo = input.repo || defaults.repo;
  if (!isRepo(repo)) {
    throw new Error(`job.repo must be owner/repo (got ${repo || '(missing)'})`);
  }
  const result = input.result;
  if (!RESULTS.has(result)) {
    throw new Error('job.result must be lit, dark, or untested');
  }
  const source = input.source || defaults.source || 'manual';
  if (!SOURCES.has(source)) {
    throw new Error(`job.source must be one of ${[...SOURCES].join(', ')}`);
  }
  const billed = Boolean(input.billed);
  return {
    schema: SCHEMA,
    id: input.id || defaults.id || null,
    customerId: input.customerId || defaults.customerId || null,
    subscriptionId: input.subscriptionId || defaults.subscriptionId || null,
    source,
    repo,
    issue: issueShape(input.issue),
    branch: input.branch == null ? null : String(input.branch),
    result,
    billed,
    billId: input.billId || null,
    amount: amountShape(input.amount),
    logsSummary: input.logsSummary == null ? '' : String(input.logsSummary),
    startedAt: input.startedAt || null,
    finishedAt: input.finishedAt || null,
    tester: testerShape(input.tester),
    createdAt: input.createdAt || defaults.createdAt || null,
  };
}

function isDiscussBuildQueue(doc) {
  return Boolean(doc && typeof doc === 'object' && !Array.isArray(doc) && Array.isArray(doc.items) && typeof doc.source === 'string');
}

function fromDiscussBuildQueue(doc, defaults = {}) {
  if (!isRepo(doc.source)) {
    throw new Error(`discuss-build queue source must be owner/repo (got ${doc.source})`);
  }
  const jobs = [];
  for (const row of doc.items) {
    if (!row || !row.built) continue;
    const item = row.item || {};
    jobs.push(normalizeJob({
      id: row.jobId || null,
      customerId: defaults.customerId || null,
      source: 'discuss-build',
      repo: doc.source,
      issue: {
        number: item.number == null ? null : item.number,
        url: item.url || null,
        title: item.title || '',
        type: item.type === 'discussion' ? 'discussion' : 'issue',
      },
      branch: row.branch || null,
      result: RESULTS.has(row.ciStatus) ? row.ciStatus : 'untested',
      billed: false,
      logsSummary: row.ciSummary || row.buildNotes || '',
      tester: { tool: 'discuss-build', version: null, method: 'ci' },
    }, defaults));
  }
  return jobs;
}

function parseJobFile(doc, defaults = {}) {
  if (Array.isArray(doc)) {
    return doc.map((row) => normalizeJob(row, defaults));
  }
  if (doc && typeof doc === 'object' && Array.isArray(doc.jobs)) {
    return doc.jobs.map((row) => normalizeJob(row, defaults));
  }
  if (isDiscussBuildQueue(doc)) {
    return fromDiscussBuildQueue(doc, defaults);
  }
  return [normalizeJob(doc, defaults)];
}

module.exports = {
  SCHEMA,
  RESULTS,
  SOURCES,
  CURRENCIES,
  isRepo,
  normalizeJob,
  parseJobFile,
  fromDiscussBuildQueue,
  isDiscussBuildQueue,
};
