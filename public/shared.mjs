export const STAT_LABELS = { hp: 'PS', attack: 'Ataque', defense: 'Defensa', 'special-attack': 'At. especial', 'special-defense': 'Def. especial', speed: 'Velocidad' };
export const GENERATIONS = { 1:'I · Kanto', 2:'II · Johto', 3:'III · Hoenn', 4:'IV · Sinnoh', 5:'V · Teselia', 6:'VI · Kalos', 7:'VII · Alola', 8:'VIII · Galar / Hisui', 9:'IX · Paldea' };
export const PAGE_SIZE = 24;
export const STORAGE_KEY = 'pokelab-notebook-v1';
export const totalStats = pokemon => Object.values(pokemon.stats).reduce((a,b) => a + b, 0);
export const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
export const searchText = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9♀♂]/g, '');

export function filterPokemon(pokemon, options = {}) {
  const query = searchText(options.search || '');
  const numeric = /^\d+$/.test(query) ? Number(query) : null;
  const favorites = new Set(options.favorites || []);
  const result = pokemon.filter(p =>
    (options.forms || p.isDefault) &&
    (!options.onlyFavorites || favorites.has(p.id)) &&
    (!options.type || options.type === 'all' || p.types.includes(options.type)) &&
    (!options.generation || options.generation === 'all' || p.generation === Number(options.generation)) &&
    (!query || (numeric !== null ? p.speciesId === numeric || p.id === numeric : searchText(p.name).includes(query) || searchText(p.slug).includes(query)))
  );
  result.sort((a,b) => options.sort === 'name' ? a.name.localeCompare(b.name, 'es') || a.id-b.id : options.sort === 'total' ? totalStats(b)-totalStats(a) || a.id-b.id : options.sort === 'speed' ? b.stats.speed-a.stats.speed || a.id-b.id : a.speciesId-b.speciesId || Number(b.isDefault)-Number(a.isDefault) || a.id-b.id);
  return result;
}
export function validIds(value, catalog, limit = Infinity) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(id => Number.isSafeInteger(id) && catalog.has(id)))].slice(0, limit);
}
export function cleanNotebook(raw, catalog) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    team: validIds(input.team, catalog, 6),
    favorites: validIds(input.favorites, catalog),
    compare: validIds(input.compare, catalog, 2),
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0,50) : 'Mi equipo',
    saved: (Array.isArray(input.saved) ? input.saved : []).filter(s => s && typeof s.name === 'string').map(s => ({name:s.name.trim().slice(0,50) || 'Mi equipo', ids:validIds(s.ids,catalog,6)})).filter(s=>s.ids.length).slice(0,12)
  };
}
export function readStorage(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export async function loadCatalog() {
  const response = await fetch(new URL('./data/catalog.json', import.meta.url), { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('No se encontró el archivo de datos. Intenta recargar la página.');
  const data = await response.json();
  if (!Array.isArray(data.pokemon) || !data.pokemon.length || data.count !== data.pokemon.length) throw new Error('El archivo de la Pokédex está incompleto.');
  return data;
}
const detailsCache = new Map();
async function api(endpoint) {
  const response = await fetch(`https://pokeapi.co/api/v2/${endpoint}`, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('No se pudo consultar la ficha.');
  return response.json();
}
export async function loadDetails(pokemon) {
  if (detailsCache.has(pokemon.id)) return detailsCache.get(pokemon.id);
  const key = `pokelab-detail-${pokemon.id}`;
  const cached = readStorage(key);
  if (cached && Date.now()-cached.at < 7*24*60*60*1000 && typeof cached.description === 'string' && Array.isArray(cached.abilities) && cached.abilities.every(a=>typeof a==='string')) {
    detailsCache.set(pokemon.id, cached); return cached;
  }
  const [detail, species] = await Promise.allSettled([api(`pokemon/${pokemon.id}`), api(`pokemon-species/${pokemon.speciesId}`)]);
  if (detail.status === 'rejected' && species.status === 'rejected') throw new Error('Sin conexión para la información adicional. Las estadísticas siguen disponibles.');
  const d = detail.status === 'fulfilled' ? detail.value : null;
  const s = species.status === 'fulfilled' ? species.value : null;
  const entry = s?.flavor_text_entries?.find(x=>x.language.name === 'es') || s?.flavor_text_entries?.find(x=>x.language.name === 'en');
  const abilities = (d?.abilities || []).map(a=>`${a.ability.name.replaceAll('-', ' ')}${a.is_hidden ? ' (oculta)' : ''}`);
  const result = {at:Date.now(), description:entry?.flavor_text?.replace(/[\n\f\r]+/g,' ') || 'Esta especie no tiene descripción disponible.', language:entry?.language?.name || '', abilities, partial:!d || !s};
  if (!result.partial) { detailsCache.set(pokemon.id,result); writeStorage(key,result); }
  return result;
}
