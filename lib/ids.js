'use strict';

function randomId(prefix, rng = Math.random) {
  const n = rng();
  const tail = Date.now().toString(36) + Math.floor(n * 1e9).toString(36);
  return `${prefix}_${tail}`;
}

module.exports = { randomId };
