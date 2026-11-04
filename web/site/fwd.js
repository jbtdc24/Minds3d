// The homepage is at /, the game at /play. Hello Minds sign-ins come back to / (its registered address) and old invite
// links point at /?invite=: both go straight on to the game with everything they carry.
(() => {
  const q = new URLSearchParams(location.search);
  if (['code', 'state', 'error', 'invite', 'debug', 'stage'].some(k => q.has(k))) location.replace(`/play${location.search}${location.hash}`);
})();
