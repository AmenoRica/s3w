/* Seeded Fisher–Yates shuffle. Independent of language and viewport. */
window.WEAPON_RANDOM = {
  shuffle(weapons, seed) {
    const result = weapons.filter(w => w.key === 'Shooter_First_00' || (Number.isFinite(w.rank) && w.rank >= 0));
    let state = 2166136261;
    for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619) >>> 0;
    function next() {
      state = (state + 0x6D2B79F5) >>> 0;
      let n = Math.imul(state ^ (state >>> 15), state | 1);
      n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
      return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
    }
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  },
  newSeed() {
    return crypto.getRandomValues(new Uint16Array(1))[0].toString(16).padStart(4, '0');
  }
};
