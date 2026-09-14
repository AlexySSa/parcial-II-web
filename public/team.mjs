/**
 * Team and defensive type utilities (current, Generation VI onward chart).
 * Source: https://pokeapi.co/api/v2/type/{name}, damage_relations, fetched 2026-09-14.
 * This models types only; abilities, items, moves and battle conditions are excluded.
 */
export const TYPES = Object.freeze(['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy']);
export const TYPE_LABELS = Object.freeze({ normal: 'Normal', fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta', ice: 'Hielo', fighting: 'Lucha', poison: 'Veneno', ground: 'Tierra', flying: 'Volador', psychic: 'Psíquico', bug: 'Bicho', rock: 'Roca', ghost: 'Fantasma', dragon: 'Dragón', dark: 'Siniestro', steel: 'Acero', fairy: 'Hada' });

// Each attack row lists: double damage, half damage, no damage.
const CHART = {
  normal: [[], ['rock', 'steel'], ['ghost']],
  fire: [['bug', 'steel', 'grass', 'ice'], ['rock', 'fire', 'water', 'dragon'], []],
  water: [['ground', 'rock', 'fire'], ['water', 'grass', 'dragon'], []],
  electric: [['flying', 'water'], ['grass', 'electric', 'dragon'], ['ground']],
  grass: [['ground', 'rock', 'water'], ['flying', 'poison', 'bug', 'steel', 'fire', 'grass', 'dragon'], []],
  ice: [['flying', 'ground', 'grass', 'dragon'], ['steel', 'fire', 'water', 'ice'], []],
  fighting: [['normal', 'rock', 'steel', 'ice', 'dark'], ['flying', 'poison', 'bug', 'psychic', 'fairy'], ['ghost']],
  poison: [['grass', 'fairy'], ['poison', 'ground', 'rock', 'ghost'], ['steel']],
  ground: [['poison', 'rock', 'steel', 'fire', 'electric'], ['bug', 'grass'], ['flying']],
  flying: [['fighting', 'bug', 'grass'], ['rock', 'steel', 'electric'], []],
  psychic: [['fighting', 'poison'], ['steel', 'psychic'], ['dark']],
  bug: [['grass', 'psychic', 'dark'], ['fighting', 'flying', 'poison', 'ghost', 'steel', 'fire', 'fairy'], []],
  rock: [['flying', 'bug', 'fire', 'ice'], ['fighting', 'ground', 'steel'], []],
  ghost: [['ghost', 'psychic'], ['dark'], ['normal']],
  dragon: [['dragon'], ['steel'], ['fairy']],
  dark: [['ghost', 'psychic'], ['fighting', 'dark', 'fairy'], []],
  steel: [['rock', 'ice', 'fairy'], ['steel', 'fire', 'water', 'electric'], []],
  fairy: [['fighting', 'dragon', 'dark'], ['poison', 'steel', 'fire'], []],
};

function checkedTypes(defenseTypes) {
  if (!Array.isArray(defenseTypes) || defenseTypes.length < 1 || defenseTypes.length > 2) {
    throw new TypeError('Se necesitan uno o dos tipos defensivos.');
  }
  const names = defenseTypes.map(value => typeof value === 'string' ? value : value?.type?.name);
  if (names.some(type => !TYPES.includes(type)) || new Set(names).size !== names.length) {
    throw new TypeError('Los tipos deben ser válidos y diferentes.');
  }
  return names;
}

/** Returns 0, 0.25, 0.5, 1, 2 or 4. Invalid/unknown types throw TypeError. */
export function effectiveness(attackType, defenseTypes) {
  if (!TYPES.includes(attackType)) throw new TypeError('Tipo de ataque desconocido.');
  const defenders = checkedTypes(defenseTypes);
  const [double, half, immune] = CHART[attackType];
  return defenders.reduce((value, type) => value * (immune.includes(type) ? 0 : double.includes(type) ? 2 : half.includes(type) ? 0.5 : 1), 1);
}

/** Counts Pokémon per incoming attack type. Pokémon must have a valid types array. */
export function analyzeTeam(pokemonArray) {
  if (!Array.isArray(pokemonArray)) throw new TypeError('El equipo debe ser un arreglo.');
  if (pokemonArray.length > 6) throw new RangeError('El equipo admite seis Pokémon como máximo.');
  const defenders = pokemonArray.map(pokemon => checkedTypes(pokemon?.types));
  return TYPES.map(type => {
    const result = { type, weak: 0, resistant: 0, immune: 0, neutral: 0 };
    for (const types of defenders) {
      const multiplier = effectiveness(type, types);
      result[multiplier === 0 ? 'immune' : multiplier > 1 ? 'weak' : multiplier < 1 ? 'resistant' : 'neutral']++;
    }
    return result;
  });
}

const isValidId = id => Number.isSafeInteger(id) && id > 0;

/** Tolerant cleanup for saved state: preserves order, removes bad IDs/duplicates, caps at 6. */
export function normalizeTeam(ids, validIds) {
  if (!Array.isArray(ids)) return [];
  const allowed = validIds === undefined ? null : new Set(validIds);
  return [...new Set(ids.filter(id => isValidId(id) && (!allowed || allowed.has(id))))].slice(0, 6);
}

/** error is null, 'invalid', 'duplicate' or 'full'; input arrays are never changed. */
export function addToTeam(ids, id) {
  const team = normalizeTeam(ids);
  if (!isValidId(id)) return { team, error: 'invalid' };
  if (team.includes(id)) return { team, error: 'duplicate' };
  if (team.length === 6) return { team, error: 'full' };
  return { team: [...team, id], error: null };
}

export function removeFromTeam(ids, id) {
  return normalizeTeam(ids).filter(value => value !== id);
}

function checkedIds(ids) {
  if (!Array.isArray(ids) || ids.some(id => !isValidId(id))) throw new TypeError('El equipo contiene identificadores inválidos.');
  if (ids.length > 6) throw new RangeError('El equipo admite seis Pokémon como máximo.');
  if (new Set(ids).size !== ids.length) throw new TypeError('El equipo contiene Pokémon repetidos.');
  return [...ids];
}

/** Strict serialization: malformed teams throw instead of silently dropping members. */
export function encodeTeam(ids) {
  return checkedIds(ids).join(',');
}

/**
 * Parses a decoded URLSearchParams value (not a complete URL); '' means empty team.
 * Rejects non-strings, spaces, signs, decimals, empty tokens, leading zeros, unsafe IDs,
 * duplicates and more than six members. Throws TypeError/RangeError; never truncates.
 * After decoding, callers must check IDs exist in their loaded catalog.
 */
export function decodeTeam(value) {
  if (typeof value !== 'string') throw new TypeError('El enlace de equipo no es válido.');
  if (value === '') return [];
  if (value.length > 101) throw new RangeError('El enlace de equipo es demasiado largo.');
  if (!/^[1-9]\d*(,[1-9]\d*)*$/.test(value)) throw new TypeError('El enlace contiene identificadores inválidos.');
  return checkedIds(value.split(',').map(Number));
}
