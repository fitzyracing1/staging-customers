'use strict';
const { randomId } = require('./ids');
const { balanceOf, addLedger, findActiveSubscription } = require('./models');

function pendingLitJobs(state, opts = {}) {
  return state.jobs.filter((job) => {
    if (job.result !== 'lit') return false;
    if (job.billed) return false;
    if (opts.customerId && job.customerId !== opts.customerId) return false;
    if (opts.jobId && job.id !== opts.jobId) return false;
    return true;
  });
}

function billJobs(state, payments, opts, now, rng) {
  const jobs = pendingLitJobs(state, opts);
  const results = [];
  for (const job of jobs) {
    if (!job.customerId) {
      results.push({ jobId: job.id, billed: false, reason: 'job has no customerId' });
      continue;
    }
    const sub = findActiveSubscription(state, job.customerId, job.repo);
    if (!sub) {
      results.push({ jobId: job.id, billed: false, reason: `no active subscription for ${job.repo}` });
      continue;
    }
    const amount = { currency: sub.currency, minor: sub.priceMinor };
    const balance = balanceOf(state, job.customerId, amount.currency);
    try {
      const charge = payments.charge({
        customerId: job.customerId,
        amount,
        reason: `lit job ${job.id} for ${job.repo}`,
        jobId: job.id,
        balance,
      });
      const entry = addLedger(state, {
        type: 'debit',
        customerId: job.customerId,
        amount,
        reason: `bill for lit job ${job.id} (${job.repo})`,
        jobId: job.id,
        backend: charge.backend,
        backendRef: charge.backendRef,
      }, now, rng);
      const bill = {
        id: randomId('bill', rng),
        customerId: job.customerId,
        jobId: job.id,
        subscriptionId: sub.id,
        amount,
        ledgerId: entry.id,
        backend: charge.backend,
        backendRef: charge.backendRef,
        createdAt: now(),
      };
      state.bills.push(bill);
      job.billed = true;
      job.billId = bill.id;
      job.amount = amount;
      job.subscriptionId = job.subscriptionId || sub.id;
      results.push({ jobId: job.id, billed: true, billId: bill.id, amount, backend: charge.backend });
    } catch (err) {
      results.push({ jobId: job.id, billed: false, reason: err.message });
    }
  }
  return results;
}

module.exports = { pendingLitJobs, billJobs };
