import { TYPES, TYPE_LABELS, analyzeTeam, addToTeam, removeFromTeam, encodeTeam, decodeTeam } from './team.mjs';
import { STAT_LABELS, GENERATIONS, PAGE_SIZE, STORAGE_KEY, totalStats, escapeHtml as h, filterPokemon, cleanNotebook, readStorage, writeStorage, loadCatalog, loadDetails } from './shared.mjs';

const $ = selector => document.querySelector(selector);
const state = { pokemon:[], byId:new Map(), view:'catalog', page:1, loaded:false, team:[], favorites:[], compare:[], saved:[], name:'Mi equipo', filters:{search:'',type:'all',generation:'all',sort:'number',forms:false}, detailId:null };
const number = value => new Intl.NumberFormat('es-SV').format(value);
const dex = p => `#${String(p.speciesId).padStart(4,'0')}`;
let toastTimer, detailRequest = 0, returnFocus = null;
let storageWarned = false;

function announce(message, error = false) {
  clearTimeout(toastTimer);
  const toast = $('#toast');
  toast.textContent = message; toast.dataset.tone = error ? 'error' : 'info'; toast.hidden = false;
  if ($('#detail-dialog').open && $('#detail-notice')) $('#detail-notice').textContent = message;
  toastTimer = setTimeout(()=>{toast.hidden=true;}, 5500);
}
function persist() {
  if (!state.loaded) return false;
  const ok = writeStorage(STORAGE_KEY, {team:state.team, favorites:state.favorites, compare:state.compare, saved:state.saved, name:state.name});
  if (!ok && !storageWarned) { storageWarned=true; announce('El navegador no permite guardar. Los cambios durarán solo esta sesión.',true); }
  return ok;
}
function applyTheme(theme) {
  const dark = theme === 'dark'; document.body.dataset.theme = dark ? 'dark' : 'light';
  $('#theme-toggle').textContent = dark ? 'Claro' : 'Oscuro';
  $('#theme-toggle').setAttribute('aria-label', dark ? 'Activar tema claro' : 'Activar tema oscuro');
  $('#theme-toggle').setAttribute('aria-pressed',String(dark));
}
function types(p) { return p.types.map(type=>`<span class="type-tag" data-type="${type}">${TYPE_LABELS[type]}</span>`).join(''); }
function art(p, className='card-art', lazy=true) { return `<img class="${className}" src="${h(p.image)}" alt="${h(p.name)}" width="240" height="240" ${lazy?'loading="lazy"':''} decoding="async" data-pokemon-image="${p.id}">`; }
function imageFallbacks(scope=document) {
  scope.querySelectorAll('img[data-pokemon-image]').forEach(img=>{
    img.addEventListener('error',()=>{
      const p=state.byId.get(Number(img.dataset.pokemonImage));
      if (!img.dataset.fallback) { img.dataset.fallback='sprite'; img.src=`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png`; }
      else { img.removeAttribute('data-pokemon-image'); img.src='./favicon.svg'; img.classList.add('missing-art'); img.alt=`Ilustración de ${p.name} no disponible`; }
    });
  });
}
function card(p,mode='catalog',index=99) {
  const inTeam=state.team.includes(p.id), compared=state.compare.includes(p.id), favorite=state.favorites.includes(p.id);
  return `<article class="pokemon-card" data-pokemon="${p.id}">
    <div class="card-top"><span class="dex-number">${dex(p)}</span><button class="favorite-button" data-action="favorite" data-id="${p.id}" aria-label="${favorite?'Quitar de':'Añadir a'} favoritos: ${h(p.name)}" aria-pressed="${favorite}" title="Favorito">${favorite?'★':'☆'}</button></div>
    <button class="card-art-button" data-action="detail" data-id="${p.id}" aria-label="Ver ficha de ${h(p.name)}">${art(p,'card-art',index>3)}</button>
    <div class="card-info"><button class="card-name" data-action="detail" data-id="${p.id}">${h(p.name)}</button><div class="type-row">${types(p)}</div>${!p.isDefault?'<span class="form-note">Forma alternativa</span>':''}</div>
    <div class="card-actions">${mode==='compare'?`<button data-action="compare" data-id="${p.id}" aria-label="Quitar ${h(p.name)} del comparador">Quitar de comparación</button>`:mode==='team'?`<button data-action="team" data-id="${p.id}" aria-label="Quitar ${h(p.name)} del equipo">Quitar del equipo</button>`:`<button class="add-team" data-action="team" data-id="${p.id}" aria-pressed="${inTeam}" aria-label="${inTeam?'Quitar del':'Añadir al'} equipo: ${h(p.name)}">${inTeam?'✓ Equipo':'+ Equipo'}</button><button data-action="compare" data-id="${p.id}" aria-pressed="${compared}" aria-label="${compared?'Quitar de comparación':'Comparar'}: ${h(p.name)}">${compared?'✓ Comparar':'Comparar'}</button>`}</div>
  </article>`;
}
function renderCatalog() {
  if(!state.loaded) return;
  const filtered=filterPokemon(state.pokemon,{...state.filters,onlyFavorites:state.view==='favorites',favorites:state.favorites});
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)); state.page=Math.min(state.page,pages);
  const start=(state.page-1)*PAGE_SIZE;
  $('#pokemon-grid').innerHTML=filtered.slice(start,start+PAGE_SIZE).map((p,i)=>card(p,'catalog',i)).join('');
  $('#pokemon-grid').setAttribute('aria-busy','false');
  $('#results-count').textContent = filtered.length ? `${number(filtered.length)} resultados · ${start+1}–${Math.min(start+PAGE_SIZE,filtered.length)}` : '0 resultados';
  $('#empty-state').hidden=filtered.length>0;
  $('#empty-state h2').textContent=state.view==='favorites' && !state.favorites.length?'Tus favoritos aparecerán aquí':'Sin coincidencias';
  $('#empty-state p').textContent=state.view==='favorites' && !state.favorites.length?'Marca la estrella de un Pokémon para guardarlo.':'Prueba otro nombre o restablece los filtros.';
  $('#pagination').hidden=filtered.length<=PAGE_SIZE;
  $('#page-label').textContent=`${state.page} / ${pages}`;
  $('#prev-page').disabled=state.page<=1; $('#next-page').disabled=state.page>=pages;
  imageFallbacks($('#pokemon-grid'));
}
function renderTeam() {
  const members=state.team.map(id=>state.byId.get(id));
  $('#nav-team').textContent=`${members.length}/6`; $('#team-counter').textContent=`${members.length}/6`;
  $('#team-mini').innerHTML=Array.from({length:6},(_,i)=>{
    const p=members[i]; return `<div class="mini-slot"><span>${String(i+1).padStart(2,'0')}</span>${p?`${art(p)}<strong>${h(p.name)}</strong><button class="icon-button" data-action="team" data-id="${p.id}" aria-label="Quitar ${h(p.name)} del equipo">×</button>`:'<span class="empty-slot-label">Sin elegir</span>'}</div>`;
  }).join('');
  $('#team-grid').innerHTML=Array.from({length:6},(_,i)=>members[i]?card(members[i],'team'):`<button class="team-slot-empty" data-view="catalog"><span>${String(i+1).padStart(2,'0')}</span>Elegir compañero +</button>`).join('');
  $('#save-team').disabled=!members.length; $('#share-team').disabled=!members.length;
  if(!members.length) $('#team-analysis').innerHTML='<p class="analysis-summary">Elige tu primer compañero para empezar el análisis.</p>';
  else {
    const rows=analyzeTeam(members).sort((a,b)=>b.weak-a.weak || TYPES.indexOf(a.type)-TYPES.indexOf(b.type));
    const threats=rows.filter(row=>row.weak>=2);
    $('#team-analysis').innerHTML=`<p class="analysis-summary">${threats.length?`Debilidad compartida frente a ${threats.map(row=>`${TYPE_LABELS[row.type]} (${row.weak}/${members.length})`).join(', ')}.`:'No hay dos integrantes con debilidad al mismo tipo.'}</p><div class="table-scroll" tabindex="0" role="region" aria-label="Análisis defensivo por tipo"><table class="analysis-table"><caption class="sr-only">Número de integrantes afectados por cada tipo de ataque</caption><thead><tr><th scope="col">Ataque de tipo</th><th scope="col">Débiles</th><th scope="col">Resistentes</th><th scope="col">Inmunes</th><th scope="col">Neutrales</th></tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${TYPE_LABELS[row.type]}</th><td class="${row.weak?'weak-cell':'muted-cell'}">${row.weak}</td><td>${row.resistant}</td><td>${row.immune}</td><td class="muted-cell">${row.neutral}</td></tr>`).join('')}</tbody></table></div>`;
  }
  $('#saved-teams').innerHTML=state.saved.length?state.saved.map((team,i)=>`<article class="saved-team"><h3>${h(team.name)}</h3><p>${team.ids.map(id=>h(state.byId.get(id).name)).join(' · ')}</p><div class="saved-actions"><button data-action="load-saved" data-index="${i}">Cargar</button><button data-action="delete-saved" data-index="${i}" aria-label="Eliminar equipo ${h(team.name)}">Eliminar</button></div></article>`).join(''):'<p class="small-note">Los equipos que guardes aparecerán aquí.</p>';
  imageFallbacks($('#team-mini')); imageFallbacks($('#team-grid'));
}
function renderCompare() {
  $('#nav-compare').textContent=`${state.compare.length}/2`;
  const pokemon=state.compare.map(id=>state.byId.get(id));
  const lineup=Array.from({length:2},(_,i)=>pokemon[i]?card(pokemon[i],'compare'):`<div class="compare-empty"><span>0${i+1}</span><p>Elige ${i?'el segundo':'el primer'} Pokémon</p><button class="outline-button" data-view="catalog">Buscar en la Pokédex</button></div>`).join('');
  let table='';
  if(pokemon.length===2) {
    const [a,b]=pokemon;
    const row=(label,av,bv,max=255)=>`<tr><th scope="row">${label}</th><td class="${av>bv?'stat-winner':''}">${av}<div class="stat-bar" aria-hidden="true"><span style="--value:${Math.min(100,av/max*100)}%"></span></div></td><td class="${bv>av?'stat-winner':''}">${bv}<div class="stat-bar" aria-hidden="true"><span style="--value:${Math.min(100,bv/max*100)}%"></span></div></td></tr>`;
    table=`<div class="compare-table table-scroll" tabindex="0" role="region" aria-label="Comparación de estadísticas"><table><caption class="sr-only">Estadísticas base de ${h(a.name)} y ${h(b.name)}</caption><thead><tr><th scope="col">Estadística</th><th scope="col">${h(a.name)}</th><th scope="col">${h(b.name)}</th></tr></thead><tbody>${Object.entries(STAT_LABELS).map(([key,label])=>row(label,a.stats[key],b.stats[key])).join('')}${row('Total',totalStats(a),totalStats(b),1530)}</tbody></table></div>`;
  }
  $('#comparison').innerHTML=`<div class="compare-lineup">${lineup}</div>${table}`; imageFallbacks($('#comparison'));
}
function renderAll() { renderCatalog();renderTeam();renderCompare();$('#nav-favorites').textContent=state.favorites.length;syncDetailActions(); }
function setView(view,focus=true) {
  if(!['catalog','team','compare','favorites'].includes(view)) return;
  state.view=view;state.page=1;
  $('#catalog-view').hidden=!['catalog','favorites'].includes(view);$('#team-view').hidden=view!=='team';$('#compare-view').hidden=view!=='compare';
  document.querySelectorAll('.main-nav [data-view]').forEach(button=>{ const active=button.dataset.view===view;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current'); });
  $('#catalog-title').textContent=view==='favorites'?'Mis favoritos.':'Índice nacional.';
  $('#catalog-kicker').textContent=view==='favorites'?'CUADERNO / FAVORITOS':'ARCHIVO / POKÉDEX NACIONAL';
  if(view==='favorites'){state.filters.forms=true;$('#forms-filter').checked=true;}
  renderAll();
  if(focus){$('#main').focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
}
function detailActions(p) {
  return `<button class="primary-button" data-action="team" data-id="${p.id}" aria-pressed="${state.team.includes(p.id)}">${state.team.includes(p.id)?'Quitar del equipo':'+ Equipo'}</button><button class="outline-button" data-action="compare" data-id="${p.id}" aria-pressed="${state.compare.includes(p.id)}">${state.compare.includes(p.id)?'Quitar de comparación':'Comparar'}</button><button class="outline-button" data-action="favorite" data-id="${p.id}" aria-pressed="${state.favorites.includes(p.id)}">${state.favorites.includes(p.id)?'★ Favorito':'☆ Favorito'}</button>`;
}
function syncDetailActions(){const p=state.byId.get(state.detailId);if(p&&$('#detail-actions'))$('#detail-actions').innerHTML=detailActions(p);}
async function openDetail(id) {
  const p=state.byId.get(id);if(!p)return;
  state.detailId=id; const request=++detailRequest;
  if (!$('#detail-dialog').open) {
    const element = document.activeElement;
    returnFocus = {element, action:element?.dataset?.action, id:element?.dataset?.id};
  }
  $('#detail-content').innerHTML=`<div class="detail-top">${art(p)}<div><p class="overline">${dex(p)} / GENERACIÓN ${p.generation}</p><h2 id="detail-title">${h(p.name)}</h2><div class="type-row">${types(p)}</div><div class="detail-measures"><div><span>ALTURA</span><strong>${p.height>0?`${number(p.height)} m`:'No disponible'}</strong></div><div><span>PESO</span><strong>${p.weight>0?`${number(p.weight)} kg`:'No disponible'}</strong></div></div></div></div><div class="detail-actions" id="detail-actions">${detailActions(p)}</div><h3>Estadísticas base <span class="dex-number">Total ${totalStats(p)}</span></h3><div class="detail-stats">${Object.entries(STAT_LABELS).map(([key,label])=>`<div class="detail-stat"><p><span>${label}</span><strong>${p.stats[key]}</strong></p><div class="stat-bar" aria-hidden="true"><span style="--value:${p.stats[key]/255*100}%"></span></div></div>`).join('')}</div><div class="detail-extra" id="detail-extra" role="status">Consultando descripción y habilidades…</div>`;
  imageFallbacks($('#detail-content'));
  $('#detail-actions').insertAdjacentHTML('afterend','<p id="detail-notice" class="small-note" role="status" aria-live="polite"></p>');
  if(!$('#detail-dialog').open)$('#detail-dialog').showModal();
  try {
    const detail=await loadDetails(p);if(request!==detailRequest)return;
    $('#detail-extra').innerHTML=`<p>${h(detail.description)}${detail.language==='en'?' <small>(Texto disponible en inglés.)</small>':''}</p><h3>Habilidades</h3><p>${detail.abilities.length?detail.abilities.map(h).join(' · '):'No se pudieron consultar las habilidades.'}</p><p class="small-note">Los nombres de las habilidades se conservan como los ofrece la API.</p>${detail.partial?'<button class="outline-button" data-action="retry-detail" data-id="'+id+'">Reintentar información adicional</button>':''}`;
  } catch(error) {if(request===detailRequest)$('#detail-extra').innerHTML=`<p>${h(error.message)}</p><button class="outline-button" data-action="retry-detail" data-id="${id}">Reintentar</button>`;}
}
function restoreActionFocus(button) {
  const selector=button.dataset.id?`[data-action="${button.dataset.action}"][data-id="${Number(button.dataset.id)}"]`:null;
  const scope=$('#detail-dialog').open?$('#detail-dialog'):$('#'+(['catalog','favorites'].includes(state.view)?'catalog':state.view)+'-view');
  const replacement=selector?scope.querySelector(selector):null;
  (replacement||$('#main')).focus({preventScroll:true});
}
async function action(button) {
  const action=button.dataset.action,id=Number(button.dataset.id),p=state.byId.get(id);
  if(action==='detail'||action==='retry-detail'){await openDetail(id);return;}
  if(action==='load-saved') {
    const saved=state.saved[Number(button.dataset.index)];if(!saved)return;
    state.team=[...saved.ids];state.name=saved.name;$('#team-name').value=state.name;persist();renderAll();announce(`Equipo ${state.name} cargado.`);$('#team-name').focus();return;
  }
  if(action==='delete-saved') {
    state.saved.splice(Number(button.dataset.index),1);persist();renderTeam();announce('Equipo retirado de la lista de guardados.');$('#team-name').focus();return;
  }
  if(!p)return;
  if(action==='team') {
    if(state.team.includes(id)){state.team=removeFromTeam(state.team,id);announce(`${p.name} salió del equipo.`);}
    else {const next=addToTeam(state.team,id);if(next.error){announce('Tu equipo ya tiene seis Pokémon. Quita uno para agregar otro.',true);return;}state.team=next.team;announce(`${p.name} se unió al equipo.`);}
  } else if(action==='favorite') {
    state.favorites=state.favorites.includes(id)?state.favorites.filter(value=>value!==id):[...state.favorites,id];
    announce(state.favorites.includes(id)?`${p.name} guardado en favoritos.`:`${p.name} retirado de favoritos.`);
  } else if(action==='compare') {
    if(state.compare.includes(id)){state.compare=state.compare.filter(value=>value!==id);announce(`${p.name} salió de la comparación.`);}
    else {if(state.compare.length===2){announce('Ya hay dos Pokémon para comparar. Quita uno en Comparar.',true);return;}state.compare.push(id);announce(state.compare.length===2?'La comparación está lista. Abre Comparar para verla.':`${p.name} seleccionado. Elige otro para comparar.`);}
  } else return;
  persist();renderAll();restoreActionFocus(button);
}
function resetFilters(){state.filters={search:'',type:'all',generation:'all',sort:'number',forms:state.view==='favorites'};$('#search').value='';$('#type-filter').value='all';$('#generation-filter').value='all';$('#sort-filter').value='number';$('#forms-filter').checked=state.filters.forms;state.page=1;renderCatalog();}
async function shareTeam(){
  if(!state.team.length)return;
  const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('team',encodeTeam(state.team));url.searchParams.set('name',state.name);
  const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  $('#share-help').textContent=local?'Selecciona y copia el enlace. Esta dirección local solo funciona en tu equipo.':'Selecciona y copia el enlace para compartir este equipo.';
  try{await navigator.clipboard.writeText(url.href);announce(local?'Enlace copiado. Esta dirección local solo funciona en tu equipo.':'Enlace copiado. Ya puedes compartir tu equipo.');}
  catch{$('#share-url').value=url.href;$('#share-dialog').showModal();$('#share-url').select();}
}
function bindEvents(){
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.dataset.view){setView(button.dataset.view);return;}
    if(button.classList.contains('dialog-close')){button.closest('dialog').close();return;}
    if(button.dataset.action)void action(button);
  });
  for(const [id,key] of [['search','search'],['type-filter','type'],['generation-filter','generation'],['sort-filter','sort'],['forms-filter','forms']]){
    $('#'+id).addEventListener(id==='search'?'input':'change',event=>{state.filters[key]=key==='forms'?event.target.checked:event.target.value;state.page=1;renderCatalog();});
  }
  $('#reset-filters').addEventListener('click',resetFilters);
  for(const [id,offset] of [['prev-page',-1],['next-page',1]])$('#'+id).addEventListener('click',()=>{state.page+=offset;renderCatalog();$('#results-count').scrollIntoView({block:'start'});$('#pokemon-grid').querySelector('button')?.focus({preventScroll:true});});
  $('#theme-toggle').addEventListener('click',()=>{const theme=document.body.dataset.theme==='dark'?'light':'dark';applyTheme(theme);writeStorage('pokelab-theme',theme);});
  $('#team-name').addEventListener('input',event=>{state.name=event.target.value.trim().slice(0,50)||'Mi equipo';persist();});
  $('#save-team').addEventListener('click',()=>{
    if(!state.team.length)return;
    const index=state.saved.findIndex(team=>team.name.toLowerCase()===state.name.toLowerCase());
    if(index<0&&state.saved.length>=12){announce('Tienes 12 equipos guardados. Elimina uno para guardar otro.',true);return;}
    const team={name:state.name,ids:[...state.team]};if(index>=0)state.saved[index]=team;else state.saved.push(team);
    const ok=persist();renderTeam();if(ok)announce(`Equipo ${state.name} guardado${index>=0?' y actualizado':''}.`);
  });
  $('#share-team').addEventListener('click',shareTeam);$('#retry-load').addEventListener('click',initCatalog);
  $('#detail-dialog').addEventListener('close',()=>{
    detailRequest++;state.detailId=null;
    const scope=$('#'+(['catalog','favorites'].includes(state.view)?'catalog':state.view)+'-view');
    const replacement=returnFocus?.action && returnFocus?.id ? scope.querySelector(`[data-action="${returnFocus.action}"][data-id="${Number(returnFocus.id)}"]`) : null;
    (returnFocus?.element?.isConnected ? returnFocus.element : replacement || $('#main')).focus({preventScroll:true});
  });
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
}
async function initCatalog(){
  state.loaded=false;$('#team-name').disabled=true;$('#save-team').disabled=true;$('#share-team').disabled=true;
  $('#load-error').hidden=true;$('#empty-state').hidden=true;$('#pokemon-grid').setAttribute('aria-busy','true');
  $('#pokemon-grid').innerHTML=Array.from({length:6},()=>'<div class="skeleton" aria-hidden="true"></div>').join('');
  try {
    const data=await loadCatalog();state.pokemon=data.pokemon;state.byId=new Map(data.pokemon.map(p=>[p.id,p]));
    Object.assign(state,cleanNotebook(readStorage(STORAGE_KEY),state.byId));state.loaded=true;$('#team-name').disabled=false;$('#team-name').value=state.name;
    $('#catalog-count').textContent=number(data.count);
    const species=data.pokemon.filter(p=>p.isDefault).length;
    $('#data-note').textContent=`PokéAPI · ${number(species)} especies + ${number(data.count-species)} variantes`;
    let shared=false;
    const params=new URLSearchParams(location.search);
    if(params.has('team')){
      try{const ids=decodeTeam(params.get('team'));if(!ids.length||ids.some(id=>!state.byId.has(id)))throw new Error();state.team=ids;state.name=(params.get('name')||'Equipo compartido').trim().slice(0,50)||'Equipo compartido';$('#team-name').value=state.name;shared=true;announce('Equipo del enlace cargado. Pulsa Guardar equipo para conservarlo.');}
      catch{announce('El enlace de equipo no es válido. Se conservó tu equipo anterior.',true);}
      if (shared) persist();
      const cleanUrl=new URL(location.href);cleanUrl.searchParams.delete('team');cleanUrl.searchParams.delete('name');
      history.replaceState(null,'',cleanUrl.href);
    }
    setView(shared?'team':state.view,false);
  } catch(error){state.loaded=false;$('#pokemon-grid').innerHTML='';$('#pokemon-grid').setAttribute('aria-busy','false');$('#load-error').hidden=false;$('#load-error-copy').textContent=error.message;$('#results-count').textContent='Archivo no disponible';}
}
$('#type-filter').insertAdjacentHTML('beforeend',TYPES.map(type=>`<option value="${type}">${TYPE_LABELS[type]}</option>`).join(''));
$('#generation-filter').insertAdjacentHTML('beforeend',Object.entries(GENERATIONS).map(([id,label])=>`<option value="${id}">${label}</option>`).join(''));
applyTheme(readStorage('pokelab-theme','light'));bindEvents();void initCatalog();
