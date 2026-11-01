// Wait for this interaction's cards, rather than any idle or absent panel.
// readState is supplied by the browser harness so failures retain a DOM snapshot.
export async function waitForLookupState(readState, expectedWords, { timeoutMs = 15000, pollIntervalMs = 50 } = {}) {
  if (typeof readState !== 'function') throw new TypeError('readState must be a function.');
  if (!Array.isArray(expectedWords) || expectedWords.length === 0
    || expectedWords.some(word => typeof word !== 'string' || !word.trim())) {
    throw new TypeError('expectedWords must be a non-empty array of non-empty words.');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0
    || !Number.isFinite(pollIntervalMs) || pollIntervalMs < 0) {
    throw new TypeError('Lookup timing values must be finite, non-negative milliseconds.');
  }

  const expected = [...new Set(expectedWords)];
  const expectedSet = new Set(expected);
  const started = performance.now();
  const deadline = started + timeoutMs;
  for (;;) {
    // Do not swallow protocol/evaluation errors as an ordinary lookup timeout.
    const state = await readState();
    const cards = state?.cards;
    let reason;
    if (state === null) reason = 'panel-missing';
    else if (!Array.isArray(cards)) throw new TypeError('Lookup state must be null or contain a cards array.');
    else if (cards.length !== expected.length || new Set(cards.map(card => card.word)).size !== expected.length
      || cards.some(card => !expectedSet.has(card.word))) reason = 'word-mismatch';
    else if (cards.some(card => card.busy !== false || card.loading !== false)) reason = 'lookup-pending';

    const elapsedMs = performance.now() - started;
    if (!reason) return { elapsedMs, expectedWords: expected, state };
    if (performance.now() >= deadline) {
      const error = new Error(`Lookup did not finish: ${reason}; expected ${JSON.stringify(expected)}; state ${JSON.stringify(state)}`);
      Object.assign(error, { code: 'LOOKUP_TIMEOUT', expectedWords: expected, state, elapsedMs, reason });
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(pollIntervalMs, Math.max(0, deadline - performance.now()))));
  }
}
