// Public config only. Secret keys never go in this repo: they live in Vercel environment variables.
export const GAME_NAME = 'Mindclash';
export const COLLECTION = {
  contract: '0x947c1501fdeb97d2aa0642c14afbd8a99427d227',
  chain: 'Robinhood Chain',
  opensea: 'https://opensea.io/collection/mindsdotgames',
  supply: 3333,
};
export const SUPABASE = {
  url: 'https://yohvqlblzejgfzujxotm.supabase.co',
  publishableKey: 'sb_publishable_w1utMzXIm4RnzbEwRgGamQ_GEaoBglD',   // safe to be public
};

// bump when web/data changes so browsers never show stale Minds (old cached files)
export const DATA_VERSION = '2026-10-29';
