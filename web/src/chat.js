// Quick chat: players can only send these preset lines (no typing = no spam, no abuse).
// The server validates by index, so ONLY APPEND new lines; never reorder or remove.
export const PHRASES = [
  'Hi! 👋', 'Good luck, have fun!', "Let's go!", 'Nice to meet you!',
  'Nice move!', 'Wow!', 'Haha 😂', 'Oops!', 'Well played!', 'GG!',
  'Is that all? 😏', 'I saw that coming 👀', 'Too easy!', 'My crown now 👑', 'I read your mind 🧠', 'Watch this…', 'Lucky…', 'Hurry up! ⏰',
  'Thanks!', 'Rematch?', 'Sorry!', 'Good game!',
  'Wanna duel?', "I'm online!", 'Brb', 'See you later!', 'Check the leaderboard!', 'Congrats! 🎉',
];
// which lines show in which menu (indexes into PHRASES)
export const MATCH_CHAT = [
  { name: 'Hello', ids: [0, 1, 2, 3] },
  { name: 'React', ids: [4, 5, 6, 7, 8, 9] },
  { name: 'Tease', ids: [10, 11, 12, 13, 14, 15, 16, 17] },
  { name: 'Nice', ids: [18, 19, 20, 21] },
];
export const FRIEND_CHAT = [0, 22, 23, 19, 24, 25, 26, 27, 9, 6, 13, 14, 18];
// what a bot may answer with
export const BOT_REPLIES = { greet: [0, 1, 2], tease: [10, 11, 12, 13, 14, 16], nice: [8, 9, 18, 21], default: [5, 6, 15] };
export const phraseOk = i => Number.isInteger(i) && i >= 0 && i < PHRASES.length;
