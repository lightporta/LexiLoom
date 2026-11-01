import test from 'node:test';
import assert from 'node:assert/strict';
import { hasLinearExpansion } from '../tools/browser-animation-probe.js';
import { waitForLookupState } from '../tools/browser-lookup-wait.js';

test('linear expansion accepts exact 280ms samples and rejects reduced motion', () => {
  const ok = {
    collapsed: 312, expanded: 424, duration: 280, easing: 'linear', reducedMotion: false,
    samples: [{ progress: 0.25, width: 340 }, { progress: 0.5, width: 368 }, { progress: 0.75, width: 396 }]
  };
  assert.equal(hasLinearExpansion(ok), true);
  assert.equal(hasLinearExpansion({ ...ok, reducedMotion: true, duration: null, samples: [] }), false);
  assert.equal(hasLinearExpansion({ ...ok, duration: 200 }), false);
  assert.equal(hasLinearExpansion({ ...ok, samples: ok.samples.slice(0, 2) }), false);
});

test('lookup wait resolves on matching idle cards and times out with a reason', async () => {
  let tick = 0;
  const result = await waitForLookupState(() => {
    tick += 1;
    if (tick < 3) return { cards: [{ word: 'serendipity', busy: true, loading: true }] };
    return { cards: [{ word: 'serendipity', busy: false, loading: false }] };
  }, ['serendipity'], { timeoutMs: 1000, pollIntervalMs: 1 });
  assert.deepEqual(result.expectedWords, ['serendipity']);
  assert.equal(result.state.cards[0].busy, false);

  await assert.rejects(
    () => waitForLookupState(() => ({ cards: [{ word: 'other', busy: false, loading: false }] }), ['serendipity'], {
      timeoutMs: 20, pollIntervalMs: 5
    }),
    error => error.code === 'LOOKUP_TIMEOUT' && error.reason === 'word-mismatch'
  );
  await assert.rejects(
    () => waitForLookupState(() => null, ['serendipity'], { timeoutMs: 20, pollIntervalMs: 5 }),
    error => error.code === 'LOOKUP_TIMEOUT' && error.reason === 'panel-missing'
  );
});
