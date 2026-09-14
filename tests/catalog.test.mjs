import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TYPES} from '../public/team.mjs';
import {filterPokemon,cleanNotebook,totalStats,escapeHtml} from '../public/shared.mjs';
const catalog=JSON.parse(await readFile(new URL('../public/data/catalog.json',import.meta.url),'utf8'));
const pokemon=catalog.pokemon;
const byId=new Map(pokemon.map(p=>[p.id,p]));

test('catalog preserves full declared API coverage and validated records',()=>{
  assert.equal(pokemon.length,catalog.count);
  assert.equal(catalog.count,catalog.source.apiCount);
  assert.equal(byId.size,catalog.count);
  assert.ok(catalog.count>=1351);
  assert.match(catalog.source.commit,/^[a-f0-9]{40}$/);
  const species=new Set();
  for(const p of pokemon){
    assert.ok(Number.isInteger(p.id)&&p.id>0);
    assert.ok(Number.isInteger(p.speciesId)&&p.speciesId>0);
    species.add(p.speciesId);
    assert.ok(p.types.length>=1&&p.types.length<=2&&p.types.every(t=>TYPES.includes(t)));
    assert.deepEqual(Object.keys(p.stats).sort(),['attack','defense','hp','special-attack','special-defense','speed']);
    assert.ok(Object.values(p.stats).every(n=>Number.isInteger(n)&&n>0&&n<=255));
    assert.ok(p.generation>=1&&p.generation<=9);
    assert.ok(typeof p.isDefault==='boolean');
    assert.ok(Number.isFinite(p.height)&&p.height>=0&&Number.isFinite(p.weight)&&p.weight>=0);
    assert.equal(new URL(p.image).hostname,'raw.githubusercontent.com');
  }
  assert.equal(pokemon.filter(p=>p.isDefault).length,species.size);
  assert.ok(species.size>=1025);
});

test('search reaches final generation, forms and localized names without page limitations',()=>{
  assert.equal(filterPokemon(pokemon,{search:'1025'})[0].slug,'pecharunt');
  assert.equal(filterPokemon(pokemon,{search:'#025'})[0].slug,'pikachu');
  assert.equal(filterPokemon(pokemon,{search:'codigo cero'})[0].slug,'type-null');
  assert.equal(filterPokemon(pokemon,{search:'Mr. Mime'})[0].slug,'mr-mime');
  assert.equal(filterPokemon(pokemon,{search:'Charizard'}).length,1);
  const forms=filterPokemon(pokemon,{search:'006',forms:true});
  assert.ok(forms.length>=4&&forms.every(p=>p.speciesId===6));
  const variant=byId.get(10034);
  assert.equal(filterPokemon(pokemon,{search:String(variant.id),forms:true})[0].id,variant.id);
});

test('combined filters, favorites and sorting operate over all records without mutation',()=>{
  const original=pokemon.map(p=>p.id);
  const result=filterPokemon(pokemon,{type:'fire',generation:'1',forms:true,sort:'total'});
  assert.ok(result.length>0&&result.every(p=>p.types.includes('fire')&&p.generation===1));
  for(let i=1;i<result.length;i++)assert.ok(totalStats(result[i-1])>=totalStats(result[i]));
  assert.deepEqual(filterPokemon(pokemon,{onlyFavorites:true,favorites:[25,1025],forms:true}).map(p=>p.id),[25,1025]);
  assert.deepEqual(filterPokemon(pokemon,{onlyFavorites:true,favorites:[]}),[]);
  assert.deepEqual(filterPokemon(pokemon,{search:'does-not-exist'}),[]);
  assert.equal(filterPokemon(pokemon,{}).length,1025);
  assert.equal(filterPokemon(pokemon,{forms:true}).length,catalog.count);
  assert.deepEqual(pokemon.map(p=>p.id),original);
});

test('corrupt notebook data cannot introduce unknown Pokémon or oversized teams',()=>{
  const raw={team:[1,1,2,3,4,5,6,7,999999,'25'],compare:[25,25,6,9],favorites:[25,999999,null,25,1025],name:' <Mi equipo> ',saved:[null,{name:'Prueba',ids:[1,1,1025,999999]},{name:'Vacío',ids:[999999]}]};
  const clean=cleanNotebook(raw,byId);
  assert.deepEqual(clean.team,[1,2,3,4,5,6]);
  assert.deepEqual(clean.compare,[25,6]);
  assert.deepEqual(clean.favorites,[25,1025]);
  assert.deepEqual(clean.saved,[{name:'Prueba',ids:[1,1025]}]);
  assert.equal(clean.name,'<Mi equipo>');
  assert.equal(cleanNotebook(null,byId).name,'Mi equipo');
  assert.equal(cleanNotebook({saved:Array(15).fill({name:'A',ids:[1]})},byId).saved.length,12);
  assert.equal(escapeHtml('<img src=x onerror="bad">'), '&lt;img src=x onerror=&quot;bad&quot;&gt;');
});
