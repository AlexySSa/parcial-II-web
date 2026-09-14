import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TYPES, TYPE_LABELS, effectiveness, analyzeTeam, normalizeTeam, addToTeam, removeFromTeam, encodeTeam, decodeTeam } from '../public/team.mjs';

test('all 324 single-type matchups and Spanish names match the cached PokeAPI source', async () => {
  const source = JSON.parse(await readFile(new URL('./type-source.json', import.meta.url), 'utf8'));
  assert.equal(TYPES.length, 18);
  for (const row of source) {
    assert.equal(TYPE_LABELS[row.type], row.spanish);
    for (const defender of TYPES) {
      const contains = name => row.damage[name].some(type => type.name === defender);
      const expected = contains('no_damage_to') ? 0 : contains('double_damage_to') ? 2 : contains('half_damage_to') ? 0.5 : 1;
      assert.equal(effectiveness(row.type, [defender]), expected, `${row.type} -> ${defender}`);
    }
  }
});

test('dual-type weakness, resistance, cancellation and immunity', () => {
  assert.equal(effectiveness('rock', ['fire', 'flying']), 4);
  assert.equal(effectiveness('grass', ['fire', 'flying']), 0.25);
  assert.equal(effectiveness('ice', ['water', 'flying']), 1);
  assert.equal(effectiveness('electric', ['water', 'ground']), 0);
  assert.equal(effectiveness('ground', ['fire', 'flying']), 0);
  assert.equal(effectiveness('dragon', ['dragon', 'fairy']), 0);
  assert.equal(effectiveness('ghost', ['steel']), 1);
  assert.equal(effectiveness('dark', ['steel']), 1);
});

test('invalid types fail explicitly instead of producing neutral predictions', () => {
  for (const types of [[], ['fire', 'fire'], ['unknown'], ['water', 'flying', 'dark'], null]) {
    assert.throws(() => effectiveness('fire', types), TypeError);
  }
  assert.throws(() => effectiveness('stellar', ['water']), TypeError);
  assert.throws(() => analyzeTeam([{}]), TypeError);
});

test('team counts partition each member exactly once, including PokeAPI type objects', () => {
  const team = [{ types: ['fire', 'flying'] }, { types: ['water', 'ground'] }, { types: ['electric'] }, { types: [{ type: { name: 'water' } }] }];
  const result = analyzeTeam(team);
  assert.deepEqual(result.find(row => row.type === 'electric'), { type: 'electric', weak: 2, resistant: 1, immune: 1, neutral: 0 });
  for (const row of result) assert.equal(row.weak + row.resistant + row.immune + row.neutral, 4);
  assert.equal(analyzeTeam([]).length, 18);
  assert.ok(analyzeTeam([]).every(row => row.weak + row.resistant + row.immune + row.neutral === 0));
  assert.throws(() => analyzeTeam(Array(7).fill(team[0])), RangeError);
});

test('normalization removes corrupt saved values, deduplicates, caps and filters known IDs', () => {
  const input = [1, 1, '2', 0, -1, 2.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 2, 3, 4, 5, 6, 7];
  assert.deepEqual(normalizeTeam(input), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(normalizeTeam(input, new Set([2, 7])), [2, 7]);
  assert.deepEqual(normalizeTeam(null), []);
});

test('add/remove enforce six distinct members without mutating inputs', () => {
  const team = Object.freeze([1, 2, 3, 4, 5, 6]);
  assert.deepEqual(addToTeam(team, 7), { team: [...team], error: 'full' });
  assert.equal(addToTeam(team, 1).error, 'duplicate');
  assert.equal(addToTeam(team, '7').error, 'invalid');
  assert.deepEqual(addToTeam([1], 25), { team: [1, 25], error: null });
  assert.deepEqual(removeFromTeam(team, 3), [1, 2, 4, 5, 6]);
  assert.deepEqual(removeFromTeam(team, 99), [...team]);
});

test('URL teams round-trip without silent loss', () => {
  const team = [6, 25, 94, 149, 448, 1025];
  assert.deepEqual(decodeTeam(encodeTeam(team)), team);
  assert.deepEqual(decodeTeam(''), []);
  assert.equal(encodeTeam([]), '');
  assert.deepEqual(decodeTeam(String(Number.MAX_SAFE_INTEGER)), [Number.MAX_SAFE_INTEGER]);
  for (const input of [null, 1, '1,1', '1,2,3,4,5,6,7', '1,,2', '1,', ',1', '01', '0', '-1', '+1', '1.2', '1e2', ' 1', '1, 2', '1%2C2', '9007199254740992', '1'.repeat(102)]) {
    assert.throws(() => decodeTeam(input), undefined, String(input));
  }
  for (const input of [[1, 1], [1, 2, 3, 4, 5, 6, 7], ['1'], [NaN], null]) assert.throws(() => encodeTeam(input));
});
