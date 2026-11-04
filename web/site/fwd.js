// The homepage is at /, the game at /play. Hello Minds sign-ins come back to / (its registered address): they go
// straight on to the game. A friend's invite link (?ref=) is remembered here (the first one wins) and the page stays.
(() => {
  const q = new URLSearchParams(location.search);
  try { const r = q.get('ref'); if (r && !localStorage.getItem('mindclash.ref')) localStorage.setItem('mindclash.ref', r.slice(0, 12)); } catch { /* private mode */ }
  if (['code', 'state', 'error', 'debug', 'stage'].some(k => q.has(k))) location.replace(`/play${location.search}${location.hash}`);
})();
