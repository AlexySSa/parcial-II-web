#!/usr/bin/env node
// Node 18+. Usage: node scripts/update-catalog.mjs [public/data/catalog.json]
// Fetches official tables in a handful of requests, never one request per Pokemon.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] || 'public/data/catalog.json');
const headers = { 'User-Agent': 'PokeLab-catalog-updater', Accept: 'application/json' };
async function get(url, json = true) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
  return json ? response.json() : response.text();
}

// Handles quoted fields and commas in localized names without dependencies.
function csv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(field.replace(/\r$/, '')); field = '';
      if (c === '\n') { rows.push(row); row = []; }
    } else field += c;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const fields = rows.shift();
  return rows.filter(r => r.length === fields.length).map(r => Object.fromEntries(fields.map((f, i) => [f, r[i]])));
}

const commit = process.env.POKEAPI_REF || (await get('https://api.github.com/repos/PokeAPI/pokeapi/commits/master')).sha;
const base = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${commit}/data/v2/csv/`;
const files = ['pokemon', 'pokemon_types', 'pokemon_stats', 'types', 'stats', 'pokemon_species', 'pokemon_species_names'];
const entries = await Promise.all(files.map(async name => [name, csv(await get(`${base}${name}.csv`, false))]));
const tables = Object.fromEntries(entries);
const apiIndex = await get('https://pokeapi.co/api/v2/pokemon?limit=100000');
if (apiIndex.next || apiIndex.results.length !== apiIndex.count) throw new Error('Incomplete API index');
const apiIds = new Set(apiIndex.results.map(p => Number(p.url.split('/').filter(Boolean).pop())));
const types = new Map(tables.types.map(t => [t.id, t.identifier]));
const statNames = new Map(tables.stats.map(s => [s.id, s.identifier]));
const species = new Map(tables.pokemon_species.map(s => [s.id, s]));
const names = new Map(tables.pokemon_species_names.filter(n => n.local_language_id === '9').map(n => [n.pokemon_species_id, n.name]));
for (const n of tables.pokemon_species_names.filter(n => n.local_language_id === '7')) names.set(n.pokemon_species_id, n.name);
const typeRows = new Map(), statRows = new Map();
for (const r of tables.pokemon_types) {
  if (!typeRows.has(r.pokemon_id)) typeRows.set(r.pokemon_id, []);
  typeRows.get(r.pokemon_id).push(r);
}
for (const r of tables.pokemon_stats) {
  if (!statRows.has(r.pokemon_id)) statRows.set(r.pokemon_id, {});
  statRows.get(r.pokemon_id)[statNames.get(r.stat_id)] = Number(r.base_stat);
}
const title = value => value.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
const pokemon = tables.pokemon.filter(p => apiIds.has(Number(p.id))).map(p => {
  const s = species.get(p.species_id);
  if (!s) throw new Error(`Missing species for ${p.identifier}`);
  const suffix = p.identifier.startsWith(`${s.identifier}-`) ? p.identifier.slice(s.identifier.length + 1) : '';
  const name = names.get(p.species_id) || title(s.identifier);
  const record = {
    id: Number(p.id), speciesId: Number(p.species_id), slug: p.identifier,
    name: suffix ? `${name} · ${title(suffix)}` : name,
    types: (typeRows.get(p.id) || []).sort((a, b) => Number(a.slot) - Number(b.slot)).map(t => types.get(t.type_id)),
    stats: statRows.get(p.id), height: Number(p.height) / 10, weight: Number(p.weight) / 10,
    generation: Number(s.generation_id), isDefault: p.is_default === '1',
    image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${p.id}.png`
  };
  if (!record.types.length || Object.keys(record.stats || {}).length !== 6 || Object.values(record.stats).some(n => !Number.isInteger(n) || n < 1)) {
    throw new Error(`Incomplete types or stats: ${p.identifier}`);
  }
  return record;
}).sort((a, b) => a.id - b.id);
if (pokemon.length !== apiIndex.count || new Set(pokemon.map(p => p.id)).size !== apiIndex.count) {
  throw new Error(`Coverage mismatch: CSV ${pokemon.length}; API ${apiIndex.count}. No output written.`);
}
const byId = new Map(pokemon.map(p => [p.id, p]));
for (const p of apiIndex.results) {
  const id = Number(p.url.split('/').filter(Boolean).pop());
  if (byId.get(id)?.slug !== p.name) throw new Error(`API/CSV slug mismatch for ${id}`);
}
const payload = {
  updatedAt: new Date().toISOString(),
  source: { name: 'PokéAPI', url: 'https://pokeapi.co/', repository: 'https://github.com/PokeAPI/pokeapi', commit, apiCount: apiIndex.count },
  count: pokemon.length,
  pokemon
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(payload) + '\n', 'utf8');
console.log(`Saved ${pokemon.length} entries (${new Set(pokemon.map(p => p.speciesId)).size} species) to ${output}`);
console.log(`Official CSV commit: ${commit}`);
