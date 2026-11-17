'use strict';
const fs = require('fs');
const path = require('path');

function emptyState() {
  return {
    version: 1,
    backend: 'memory',
    customers: [],
    subscriptions: [],
    jobs: [],
    ledger: [],
    bills: [],
  };
}

function load(storePath) {
  if (!storePath) {
    throw new Error('a store path is required');
  }
  if (!fs.existsSync(storePath)) {
    return emptyState();
  }
  const doc = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  return {
    version: doc.version || 1,
    backend: doc.backend || 'memory',
    customers: Array.isArray(doc.customers) ? doc.customers : [],
    subscriptions: Array.isArray(doc.subscriptions) ? doc.subscriptions : [],
    jobs: Array.isArray(doc.jobs) ? doc.jobs : [],
    ledger: Array.isArray(doc.ledger) ? doc.ledger : [],
    bills: Array.isArray(doc.bills) ? doc.bills : [],
  };
}

function save(storePath, state) {
  const dir = path.dirname(storePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${storePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, storePath);
}

module.exports = { emptyState, load, save };
