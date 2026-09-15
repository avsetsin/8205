import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const valid = {
  id: 8205,
  approved: true,
  yesVotes: 7,
  yesVoteBalance: '48620000000000000000000',
  noVotes: 0,
  noVoteBalance: '0',
  abstainVotes: 1,
  abstainVoteBalance: '544000000000000000000'
};

async function render({ data = valid, failure, expire = false } = {}) {
  const fields = Object.fromEntries([...html.matchAll(/<(dd|span|time)\b([^>]*\bdata-eva-([a-z]+)[^>]*)>([^<]*)<\/\1>/g)].map((match) => [match[3], {
    textContent: match[4],
    dateTime: /datetime="([^"]+)"/.exec(match[2])?.[1]
  }]));
  assert.equal(Object.keys(fields).length, 6);
  const snapshot = structuredClone(fields);
  const panel = { hidden: false, querySelector: (selector) => fields[/data-eva-([a-z]+)/.exec(selector)?.[1]] };
  const requests = [];
  let onTimeout;
  let timerCleared = false;
  runInNewContext(script, {
    document: {
      querySelector: (selector) => selector === '[data-eva-support]' ? panel : null,
      querySelectorAll: () => []
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    AbortController,
    setTimeout(callback, delay) { assert.equal(delay, 6000); onTimeout = callback; return 1; },
    clearTimeout() { timerCleared = true; },
    async fetch(url, options) {
      requests.push({ url, options });
      if (failure === 'network') throw new Error('offline');
      if (expire) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout'))));
      return { ok: failure !== 'http', async json() { if (failure === 'json') throw new Error('invalid JSON'); return data; } };
    }
  });
  if (expire) onTimeout();
  await new Promise(setImmediate);
  assert.equal(timerCleared, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.ethva.net/eips/8205');
  assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.referrerPolicy, 'no-referrer');
  return { fields, snapshot, panel, request: requests[0] };
}

test('shows stake-weighted support, includes abstentions, and keeps signal count distinct', async () => {
  const { fields } = await render();
  assert.equal(fields.percent.textContent, '98.9%');
  assert.equal(fields.eth.textContent, '48,620');
  assert.equal(fields.total.textContent, '49,164');
  assert.equal(fields.signals.textContent, '8');
  assert.equal(fields.breakdown.textContent, '7 yes · 0 no · 1 abstain');
  assert.ok(Date.now() - Date.parse(fields.checked.dateTime) < 5000);
});

test('zero participation does not become zero-percent opposition', async () => {
  const { fields } = await render({ data: { ...valid, yesVotes: 0, yesVoteBalance: '0', abstainVotes: 0, abstainVoteBalance: '0' } });
  assert.equal(fields.percent.textContent, '—');
  assert.equal(fields.signals.textContent, '0');
});

test('rounding does not turn a tiny opposing stake into unanimity', async () => {
  const { fields } = await render({ data: { ...valid, yesVoteBalance: '9999000000000000000000', noVotes: 1, noVoteBalance: '1000000000000000000', abstainVotes: 0, abstainVoteBalance: '0' } });
  assert.equal(fields.percent.textContent, '>99.9%');
});

for (const failure of ['network', 'http', 'json']) {
  test(`${failure} failure preserves every snapshot value and its original check date`, async () => {
    const { fields, snapshot } = await render({ failure });
    assert.deepEqual(fields, snapshot);
  });
}

test('a stalled request is aborted and preserves the snapshot', async () => {
  const { fields, snapshot, request } = await render({ expire: true });
  assert.equal(request.options.signal.aborted, true);
  assert.deepEqual(fields, snapshot);
});

for (const [label, patch] of Object.entries({
  'wrong proposal': { id: 8363 },
  'missing balance': { abstainVoteBalance: undefined },
  'negative balance': { noVoteBalance: '-1' },
  'unsafe numeric balance': { yesVoteBalance: 48620e18 },
  'fractional signal count': { yesVotes: 7.5 },
  'missing signal count': { noVotes: undefined },
  'HTML in a numeric field': { yesVoteBalance: '<img src=x onerror=alert(1)>' }
})) {
  test(`${label} leaves the complete snapshot intact`, async () => {
    const { fields, snapshot } = await render({ data: { ...valid, ...patch } });
    assert.deepEqual(fields, snapshot);
  });
}

test('withdrawn approval hides the result instead of presenting outdated support', async () => {
  const { panel } = await render({ data: { ...valid, approved: false } });
  assert.equal(panel.hidden, true);
});
