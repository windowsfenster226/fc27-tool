const S = require('./sbc-core.js');
const assert = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else console.log('ok  ', m); };
// Rating
assert(S.teamRating(Array(11).fill(84)) === 84, 'TR 11x84 = 84');
assert(S.teamRating([90, ...Array(10).fill(84)]) === 85, 'TR 90+10x84 = 85 (' + S.teamRatingRaw([90, ...Array(10).fill(84)]) + ')');
assert(S.teamRating([83,83,83,83,83,83,83,83,84,84,85]) === 83, 'TR mix 83 (' + S.teamRatingRaw([83,83,83,83,83,83,83,83,84,84,85]) + ')');
// Chem: 11 players same club/league/nation in position -> 33
const pos = S.FORMATIONS.f343;
const same = pos.map((p, i) => ({ assetId: i, rating: 80, clubId: 1, leagueId: 1, nationId: 1, rarity: 1, positions: [p] }));
assert(S.chemistry(same, pos).total === 33, 'Chem 33 bei gleichem Verein');
const oop = same.map((p) => ({ ...p, positions: ['GK'] }));
assert(S.chemistry(oop, pos).total === 0, 'Chem 0, wenn nur der TW in Position ist');
// Requirements decode (verifizierter FC27-Datensatz)
const elg = [
  { type: 'LEAGUE_COUNT', eligibilitySlot: 1, eligibilityKey: 8, eligibilityValue: 3 },
  { type: 'SCOPE', eligibilitySlot: 1, eligibilityKey: 13, eligibilityValue: 2 },
  { type: 'NATION_COUNT', eligibilitySlot: 2, eligibilityKey: 7, eligibilityValue: 2 },
  { type: 'SAME_LEAGUE_COUNT', eligibilitySlot: 3, eligibilityKey: 5, eligibilityValue: 6 },
  { type: 'SAME_NATION_COUNT', eligibilitySlot: 4, eligibilityKey: 4, eligibilityValue: 6 },
  { type: 'PLAYER_QUALITY', eligibilitySlot: 5, eligibilityKey: 3, eligibilityValue: 3 },
  { type: 'CHEMISTRY_POINTS', eligibilitySlot: 6, eligibilityKey: 35, eligibilityValue: 30 },
];
const dec = S.decodeRequirements(elg);
dec.constraints.forEach((c) => console.log('     ', S.describe(c)));
assert(dec.constraints.length === 6 && dec.unsupported.length === 0, 'Decode 6 Anforderungen');
// Synthetischer Verein
function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
const r = rng(42); const POS = ['GK','CB','LB','RB','CDM','CM','CAM','LM','RM','LW','RW','ST'];
const club = [];
for (let i = 0; i < 700; i++) {
  const league = 1 + Math.floor(r() * 8), clubId = league * 100 + Math.floor(r() * 8);
  const rating = 60 + Math.floor(Math.pow(r(), 1.6) * 30);
  const p1 = POS[Math.floor(r() * POS.length)];
  club.push({ id: i, assetId: 10000 + i, rating, leagueId: league, clubId, nationId: 1 + Math.floor(r() * 12),
    rarity: r() < 0.5 ? 1 : 0, positions: r() < 0.5 ? [p1] : [p1, POS[Math.floor(r() * POS.length)]],
    untradeable: r() < 0.5, owners: 1, cost: Math.round(Math.pow(1.35, Math.max(0, rating - 70)) * 200 + rating) });
}
const slots = pos.map((p) => ({ position: p }));
let t = Date.now();
const res = S.solve(club, slots, dec.constraints, { timeMs: 3000 });
console.log('     Zeit', Date.now() - t, 'ms, Iterationen', res.iters, 'Restarts', res.restarts, 'feasible', res.feasible, 'cost', res.cost);
if (res.ev) { console.log('     Rating', res.ev.rating, 'Chem', res.ev.chem.total); res.ev.results.forEach((x) => console.log('     ', x.ok ? '✓' : '✗', S.describe(x.c), '=>', x.val)); }
assert(res.feasible, 'Lösung erfüllt alle Anforderungen');
// Rating-SBC: TR 84, min 1 rare, 11 players
const elg2 = [
  { type: 'TEAM_RATING_1_TO_100', eligibilitySlot: 1, eligibilityKey: 19, eligibilityValue: 84 },
  { type: 'PLAYER_COUNT', eligibilitySlot: 2, eligibilityKey: 2, eligibilityValue: 2 },
  { type: 'PLAYER_RARITY', eligibilitySlot: 2, eligibilityKey: 18, eligibilityValue: 1 },
];
const d2 = S.decodeRequirements(elg2); d2.constraints.forEach((c) => console.log('     ', S.describe(c)));
t = Date.now();
const r2 = S.solve(club, slots, d2.constraints, { timeMs: 2500 });
console.log('     Zeit', Date.now() - t, 'feasible', r2.feasible, 'cost', r2.cost, 'rating', r2.ev.rating, 'ratings', r2.players.map((p) => p.rating).sort().join(','));
assert(r2.feasible && r2.ev.rating >= 84, 'Rating-SBC 84 gelöst');
const d3 = S.decodeRequirements([
 { type: 'PLAYER_COUNT', eligibilitySlot: 1, eligibilityKey: 2, eligibilityValue: 1 },
 { type: 'SCOPE', eligibilitySlot: 1, eligibilityKey: 13, eligibilityValue: 0 },
 { type: 'PLAYER_OVERALL_RATING_MIN', eligibilitySlot: 1, eligibilityKey: 26, eligibilityValue: 86 },
 { type: 'TEAM_RATING_1_TO_100', eligibilitySlot: 2, eligibilityKey: 19, eligibilityValue: 84 },
 { type: 'SCOPE', eligibilitySlot: 2, eligibilityKey: 13, eligibilityValue: 0 }]);
d3.constraints.forEach((c) => console.log('     ', S.describe(c)));
assert(d3.constraints[0].kind === 'COUNT' && d3.constraints[0].field === 'minOvr' && d3.constraints[0].values[0] === 86, 'TOTW-Upgrade: mind. 1 Spieler 86+ erkannt');
const r3 = S.solve(club.filter((p) => p.rating <= 86), slots, d3.constraints, { timeMs: 2500 });
console.log('     ratings', r3.players.map((p) => p.rating).sort().join(','), 'TR', r3.ev.rating, 'feasible', r3.feasible);
assert(r3.feasible && r3.players.some((p) => p.rating >= 86), 'Lösung enthält einen 86er');
const d4 = S.decodeRequirements([{ type: 'PLAYER_COUNT', eligibilitySlot: 1, eligibilityKey: 2, eligibilityValue: 2 }, { type: 'SOMETHING_NEW', eligibilitySlot: 1, eligibilityKey: 99, eligibilityValue: 5 }]);
assert(d4.unsupported.length === 1, 'Unbekannte Angabe wird markiert statt ignoriert (' + S.describe(d4.constraints[0]) + ')');
const P = { 81: 650, 82: 650, 83: 900, 84: 1500, 85: 2100, 86: 4200, 87: 7000, 88: 11000, 89: 18000, 90: 28000, 91: 45000 };
let tt = Date.now(); const cc = S.cheapestCombo(P, 86); console.log('     Kombi 86:', cc.ratings.join(','), 'Kosten', cc.cost, 'TR', S.teamRating(cc.ratings), (Date.now() - tt) + 'ms');
assert(cc && S.teamRating(cc.ratings) >= 86 && cc.cost < 11 * 4200, 'Günstigste Kombination für TR 86 billiger als 11×86');
