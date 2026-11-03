// Cosmetics: how the bought looks are shown. The rules (prices, owning, equipping) are in island/rules.js COSMETICS.
// Card backs are pictures; frames are drawn in CSS around a profile picture. Looks only, never power.
import { COSMETICS } from './island/rules.js';
export const BACK_IMG = { back_ember: 'assets/back_ember.webp', back_frost: 'assets/back_frost.webp', back_night: 'assets/back_night.webp', back_sun: 'assets/back_sun.webp' };
export const SKY_IMG = { sky_aurora: 'assets/sky_aurora.webp', sky_sakura: 'assets/sky_sakura.webp', sky_storm: 'assets/sky_storm.webp' };
export const NAME_CLASS = { name_gold: 'nm-gold', name_neon: 'nm-neon', name_rainbow: 'nm-rainbow' };
export const FRAME_CLASS = { frame_gold: 'fr-gold', frame_frost: 'fr-frost', frame_flame: 'fr-flame', frame_rainbow: 'fr-prism' };
export const AURA_CLASS = { aura_gold: 'au-gold', aura_frost: 'au-frost', aura_void: 'au-void', aura_rainbow: 'au-prism' };
export const AURA_INK = { aura_gold: '#ffd84a', aura_frost: '#9fe6ff', aura_void: '#9b6bff' };   // Prism cycles colours
export const TRAIL_INK = { trail_hearts: ['#ff6b9a', '#ff9fc0'], trail_stars: ['#ffd84a', '#fff3a8'], trail_petals: ['#ffb7d5', '#ffffff'], trail_gems: ['#5ec8ff', '#d58cff'] };
export const TRAIL_ICON = { trail_hearts: '💗 💗 💗', trail_stars: '⭐ ✨ ⭐', trail_petals: '🌸 🌸 🌸', trail_gems: '💎 ✨ 💎' };
export const titleOf = cos => COSMETICS[cos?.title]?.kind === 'title' ? COSMETICS[cos.title].name : '';
const ALL_FRAMES = [...Object.values(FRAME_CLASS), ...Object.values(AURA_CLASS)];
// class names for another player's looks inside HTML lists (leaderboard, friends, profile, town)
export const frameCls = cos => [FRAME_CLASS[cos?.frame], AURA_CLASS[cos?.aura]].filter(Boolean).join(' ');
// a title under a name in HTML lists ('' when none)
export const titleTag = cos => titleOf(cos) ? `<small class="cos-title">${titleOf(cos)}</small>` : '';
export const nameCls = cos => NAME_CLASS[cos?.name] || '';
// put the equipped looks on: your card backs in duels, and the frame on your own pictures
// a name colour on the given name elements
export function nameLook(cos, sels) {
  for (const sel of sels) {
    const el = document.querySelector(sel); if (!el) continue;
    el.classList.remove(...Object.values(NAME_CLASS)); if (NAME_CLASS[cos?.name]) el.classList.add(NAME_CLASS[cos.name]);
    if (titleOf(cos)) el.dataset.title = titleOf(cos); else delete el.dataset.title;   // the title shows under the name (CSS ::after)
  }
}
export function wear(cos, pics = ['#hub-pfp', '#d-pfp0']) {
  nameLook(cos, ['#hub-name', '#d-name0']);
  const back = BACK_IMG[cos?.back];
  document.documentElement.style.setProperty('--my-back', back ? `url(${back})` : 'url(assets/card_back.webp)');
  for (const sel of pics) {
    const el = document.querySelector(sel);
    if (!el) continue;
    el.classList.remove(...ALL_FRAMES);
    if (FRAME_CLASS[cos?.frame]) el.classList.add(FRAME_CLASS[cos.frame]);
    if (AURA_CLASS[cos?.aura]) el.classList.add(AURA_CLASS[cos.aura]);
  }
}
