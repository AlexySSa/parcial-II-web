import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createServer}=require('../server.js');
// Invoke the HTTP handler directly: no listener, browser or network is started.
async function request(url,method='GET'){
  const server=createServer();
  const handler=server.listeners('request')[0];
  let status,headers,body;
  await handler({url,method},{writeHead(s,h){status=s;headers=h;},end(value){body=value;}});
  return {status,headers,body};
}
test('static entry, data and ES modules are served with correct types',async()=>{
  const index=await request('/');
  assert.equal(index.status,200);assert.match(String(index.body),/PokéLab/);assert.match(index.headers['Content-Type'],/text\/html/);
  assert.equal((await request('/team.mjs')).headers['Content-Type'],'application/javascript; charset=utf-8');
  const data=await request('/data/catalog.json');assert.equal(data.status,200);assert.ok(JSON.parse(data.body).count>=1351);
  const head=await request('/','HEAD');assert.equal(head.status,200);assert.equal(head.body,undefined);
});
test('payment routes, dot files, traversal and malformed URLs are unavailable',async()=>{
  assert.equal((await request('/api/orders','POST')).status,405);
  assert.equal((await request('/cart.html')).status,404);
  assert.equal((await request('/api/config')).status,404);
  assert.equal((await request('/.env')).status,403);
  assert.equal((await request('/..%5c.env')).status,403);
  assert.equal((await request('/%00')).status,400);
  assert.equal((await request('/%ZZ')).status,400);
  assert.equal((await request('/missing.js')).status,404);
});
test('page assets and local module references resolve for a subdirectory deployment',async()=>{
  const root=new URL('../public/',import.meta.url);
  const html=await readFile(new URL('index.html',root),'utf8');
  for(const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g))await access(new URL(match[1],root));
  assert.doesNotMatch(html,/(?:src|href)="\/(?!\/)/);
  for(const name of ['app.js','shared.mjs','team.mjs']){
    const code=await readFile(new URL(name,root),'utf8');
    for(const match of code.matchAll(/from ['"](\.\/[^'"]+)['"]/g))await access(new URL(match[1],root));
  }
});
