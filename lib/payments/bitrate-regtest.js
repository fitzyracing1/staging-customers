'use strict';

// OPTIONAL STUB. This is not the Bitrate tool, not Bitcoin mainnet, and
// not a real payment. It records satoshi-denominated test ledger entries
// as a stand-in for a later Bitrate regtest hook. Do not use this with
// real funds. Switching to real money requires a deliberate change and
// Joshua's explicit OK — and is not part of this software's default path.

const STUB_BANNER = 'BITRATE REGTEST STUB — not a real Bitcoin payment, not mainnet, not the Bitrate tool. Test ledger entries only.';

function createBitrateRegtestStub() {
  let seq = 0;
  return {
    name: 'bitrate-regtest',
    description: STUB_BANNER,
    stub: true,
    charge(input) {
      if (input.amount.currency !== 'sats') {
        throw new Error('bitrate-regtest stub only records sats amounts');
      }
      const balance = input.balance || 0;
      if (input.amount.minor > balance) {
        const err = new Error(`insufficient test sats: need ${input.amount.minor}, have ${balance}`);
        err.code = 'INSUFFICIENT_FUNDS';
        throw err;
      }
      seq += 1;
      return {
        backend: 'bitrate-regtest',
        backendRef: `brt_stub_${seq}`,
        amount: input.amount,
        simulated: true,
        stub: true,
        banner: STUB_BANNER,
      };
    },
    credit(input) {
      if (input.amount.currency !== 'sats') {
        throw new Error('bitrate-regtest stub only records sats amounts');
      }
      seq += 1;
      return {
        backend: 'bitrate-regtest',
        backendRef: `brt_stub_credit_${seq}`,
        amount: input.amount,
        simulated: true,
        stub: true,
        banner: STUB_BANNER,
      };
    },
  };
}

module.exports = { createBitrateRegtestStub, STUB_BANNER };
