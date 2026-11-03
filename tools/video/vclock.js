// Frame-exact clock for recording MINDS CLASH (injected before the page loads; the game itself is unchanged).
// Runs in real time until __vc.freeze(); after that the page's time only moves when __vc.step(ms) is called:
// timers, animation frames, performance.now/Date.now and CSS/Web animations all advance by exactly ms.
(() => {
  const R = { now: performance.now.bind(performance), date: Date.now, raf: window.requestAnimationFrame.bind(window), caf: window.cancelAnimationFrame.bind(window),
    st: window.setTimeout.bind(window), ct: window.clearTimeout.bind(window), si: window.setInterval.bind(window), ci: window.clearInterval.bind(window) };
  let manual = false, vt = 0, dateOff = 0, id = 1e7;
  const timers = new Map(), rafs = new Map();
  performance.now = () => (manual ? vt : R.now());
  Date.now = () => (manual ? Math.round(dateOff + vt) : R.date());
  window.requestAnimationFrame = cb => { if (!manual) return R.raf(cb); const i = ++id; rafs.set(i, cb); return i; };
  window.cancelAnimationFrame = i => { rafs.delete(i); R.caf(i); };
  window.setTimeout = (cb, ms = 0, ...a) => { if (!manual) return R.st(cb, ms, ...a); const i = ++id; timers.set(i, { at: vt + Math.max(0, +ms || 0), cb, a }); return i; };
  window.clearTimeout = i => { timers.delete(i); R.ct(i); };
  window.setInterval = (cb, ms = 0, ...a) => { if (!manual) return R.si(cb, ms, ...a); const every = Math.max(4, +ms || 4), i = ++id; timers.set(i, { at: vt + every, cb, a, every }); return i; };
  window.clearInterval = i => { timers.delete(i); R.ci(i); };
  const anims = () => { try { return document.getAnimations(); } catch { return []; } };
  window.__vc = {
    freeze() { if (manual) return; vt = R.now(); dateOff = R.date() - vt; manual = true; anims().forEach(a => { try { a.pause(); } catch { /* finished */ } }); },
    step(ms = 1000 / 30) {
      const end = vt + ms;
      for (let guard = 0; guard < 2000; guard++) {   // timers that fall due inside this step, in order
        let next = null;
        for (const [i, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [i, t];
        if (!next) break;
        const [i, t] = next; vt = Math.max(vt, t.at);
        if (t.every) t.at += t.every; else timers.delete(i);
        try { typeof t.cb === 'function' ? t.cb(...t.a) : 0; } catch (e) { console.error(e); }
      }
      vt = end;
      const due = [...rafs.values()]; rafs.clear();
      for (const cb of due) { try { cb(vt); } catch (e) { console.error(e); } }
      for (const a of anims()) { try { if (a.playState === 'running') a.pause(); if (a.playState === 'paused') a.currentTime = (a.currentTime || 0) + ms; } catch { /* gone */ } }
      return vt;
    },
  };
})();
