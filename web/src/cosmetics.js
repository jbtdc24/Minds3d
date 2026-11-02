// Cosmetics: how the bought looks are shown. The rules (prices, owning, equipping) are in island/rules.js COSMETICS.
// Card backs are pictures; frames are drawn in CSS around a profile picture. Looks only, never power.
export const BACK_IMG = { back_ember: 'assets/back_ember.webp', back_frost: 'assets/back_frost.webp', back_night: 'assets/back_night.webp', back_sun: 'assets/back_sun.webp' };
export const SKY_IMG = { sky_aurora: 'assets/sky_aurora.webp', sky_sakura: 'assets/sky_sakura.webp', sky_storm: 'assets/sky_storm.webp' };
export const FRAME_CLASS = { frame_gold: 'fr-gold', frame_frost: 'fr-frost', frame_flame: 'fr-flame', frame_rainbow: 'fr-prism' };
const ALL_FRAMES = Object.values(FRAME_CLASS);
// put the equipped looks on: your card backs in duels, and the frame on your own pictures
export function wear(cos, pics = ['#hub-pfp', '#d-pfp0']) {
  const back = BACK_IMG[cos?.back];
  document.documentElement.style.setProperty('--my-back', back ? `url(${back})` : 'url(assets/card_back.webp)');
  for (const sel of pics) {
    const el = document.querySelector(sel);
    if (!el) continue;
    el.classList.remove(...ALL_FRAMES);
    if (FRAME_CLASS[cos?.frame]) el.classList.add(FRAME_CLASS[cos.frame]);
  }
}
