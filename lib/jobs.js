'use strict';
const { randomId } = require('./ids');
const { normalizeJob, parseJobFile } = require('./schema');
const { requireCustomer, findActiveSubscription } = require('./models');

function recordJob(state, input, now, rng) {
  if (input.customerId) requireCustomer(state, input.customerId);
  const job = normalizeJob(input, {
    id: input.id || randomId('job', rng),
    createdAt: input.createdAt || now(),
    source: input.source || 'manual',
    customerId: input.customerId || null,
  });
  if (!job.id) job.id = randomId('job', rng);
  if (!job.createdAt) job.createdAt = now();
  if (state.jobs.some((j) => j.id === job.id)) {
    throw new Error(`job already exists: ${job.id}`);
  }
  if (job.customerId && job.repo) {
    const sub = findActiveSubscription(state, job.customerId, job.repo);
    if (sub) job.subscriptionId = job.subscriptionId || sub.id;
  }
  job.billed = false;
  job.billId = null;
  // A newly recorded job is never already billed, even if the incoming
  // record claimed otherwise. Billing happens only through `bill`.
  job.amount = null;
  state.jobs.push(job);
  return job;
}

function ingestJobs(state, doc, defaults, now, rng) {
  const rows = parseJobFile(doc, defaults);
  const ingested = [];
  for (const row of rows) {
    const job = recordJob(state, {
      ...row,
      customerId: defaults.customerId || row.customerId,
      source: row.source || 'ingest',
    }, now, rng);
    ingested.push(job);
  }
  return ingested;
}

module.exports = { recordJob, ingestJobs };
