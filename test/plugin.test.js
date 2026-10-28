import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareVersions, compareCachedVersions } from '../version.js';

const project = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(project, '.test-output'); fs.mkdirSync(output, { recursive: true });
const fixtures = fs.mkdtempSync(path.join(output, 'run-'));
process.env.CODEX_HOME = path.join(fixtures, 'codex');
process.env.APPDATA = path.join(fixtures, 'appdata');
process.env.DSH_GITHUB_GIT_ROOTS = fixtures;
process.env.DSH_GITHUB_DOWNLOAD_ROOTS = fixtures;
const { apply, runCommand, withLock } = await import('../index.js');
const cleanups = [], routes = new Map();
apply({ effect(fn) { const dispose = fn(); if (dispose) cleanups.push(dispose); }, connection: {
  rpc: { intercept() { throw new Error('The /api interceptor belongs exclusively to DSH'); } },
  fetch: { register(route) { assert.ok(!routes.has(route.path)); routes.set(route.path,route); } },
} });
async function call(method, payload = {}, principal = { kind: 'owner' }) {
  // Same admission boundary as HostConnectionService.createSharedFetchHandler.
  if (principal?.kind !== 'owner') return { ok: false };
  const endpoint = 'githubManager/' + method;
  const response = await routes.get('/api/' + endpoint).fetch(new Request('http://localhost/api/' + endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type:'client-request', rpcId:'test', method:endpoint, payload }),
  }));
  return (await response.json()).result;
}
test.after(() => { for (const dispose of cleanups.reverse()) dispose(); });

test('SemVer release, prerelease, build metadata, numeric identifiers and large versions', () => {
  const chain = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '2.0.0', '10.0.0'];
  for(let i=1;i<chain.length;i++) assert.equal(compareVersions(chain[i],chain[i-1]),1);
  assert.equal(compareVersions('1.0.0+foo','1.0.0+bar'),0);
  assert.equal(compareVersions('9007199254740993.0.0','9007199254740992.0.0'),1);
  assert.throws(() => compareVersions('1.0.0-01','1.0.0'));
  assert.throws(() => compareVersions('latest','1.0.0'));
  assert.deepEqual(['9.0.0','10.0.0'].sort(compareCachedVersions),['9.0.0','10.0.0']);
});
test('RPC denies missing and non-owner identities and invalid payloads', async () => {
  assert.equal(routes.size,4); assert.equal(routes.has('/api/settings/describe'),false);
  assert.equal((await call('state',{}, {kind:'guest'})).ok,false);
  assert.equal((await call('state',{},{})).ok,false);
  assert.equal((await call('check',{type:'unknown',id:'x'})).ok,false);
  assert.equal((await call('check',{type:'tool',id:[]})).ok,false);
});
test('commands preserve metacharacters as literal arguments without a shell', async () => {
  const tricky = 'a & echo BAD | x %PATH% $(hello) `whoami` "quote" 中文';
  const actual = await runCommand(process.execPath,['-e','process.stdout.write(process.argv[1])',tricky]);
  assert.equal(actual,tricky);
  await assert.rejects(runCommand(process.execPath,['bad\0arg']),/参数无效/);
});
test('same-target operations are locked and release their lock after failure', async () => {
  let release; const pending=withLock('target',()=>new Promise(resolve=>{release=resolve;}));
  await assert.rejects(withLock('target',()=>1),/正在处理/); release(); await pending;
  await assert.rejects(withLock('target',()=>{throw Error('failure');}),/failure/);
  assert.equal(await withLock('target',()=>2),2);
});
test('frontend uses host RPC, preserves pinned source and disabled state, never removes before update', async () => {
  let plugin, api, installed, removed=0;
  const box={ window:{__ModuleLoader__:{load(module){plugin=module.factory(()=>({}));}}}, AbortController, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(path.join(project,'client.js'),'utf8'),box);
  plugin.apply({ slots:{inject(name,fn){fn();},register(options){api=options.inject().api;}},
    connection:{rpc:{async call(channel,endpoint){assert.equal(channel,'/api');assert.equal(endpoint,'githubManager/git-install');return {ok:true,value:{status:'idle'}};}}},
    remote:{pluginManager:{async installBundle(spec, options){installed={spec,options};return {ok:true,value:{application:'applied'}};},async removeBundle(){removed++;}},pluginInventory:{}},
  });
  await api.update('demo','github:owner/repo#release',false);
  assert.equal(removed,0); assert.equal(installed.spec,'github:owner/repo#release');assert.equal(installed.options.enabled,false);
  assert.equal((await api.gitInstallStatus()).status,'idle');
});

test('real local Git: safe fast-forward, dirty tree, divergence, missing upstream and detached HEAD', async () => {
  const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  const bare=path.join(fixtures,'remote.git'), seed=path.join(fixtures,'seed'), repo=path.join(fixtures,'project');
  fs.mkdirSync(seed);git(fixtures,'init','--bare',bare);git(seed,'init','-b','main');
  git(seed,'config','user.name','Test');git(seed,'config','user.email','test@example.invalid');
  fs.writeFileSync(path.join(seed,'readme'),'initial');git(seed,'add','.');git(seed,'commit','-m','initial');
  git(seed,'remote','add','origin',bare);git(seed,'push','-u','origin','main');git(fixtures,'clone','--branch','main',bare,repo);
  const remote='https://github.com/test/local-only-test';
  git(repo,'remote','set-url','origin',remote);git(repo,'config',`url.${bare.replaceAll('\\','/')}.insteadOf`,remote);
  git(repo,'config','user.name','Test');git(repo,'config','user.email','test@example.invalid');
  const inventory=await call('state',{refresh:true});assert.equal(inventory.ok,true);assert.ok(inventory.value.git.some(item=>item.id===repo));
  fs.writeFileSync(path.join(seed,'readme'),'second');git(seed,'add','.');git(seed,'commit','-m','second');git(seed,'push');
  let checked=await call('check',{type:'git',id:repo});assert.equal(checked.ok,true,JSON.stringify(checked));assert.equal(checked.value.commits,1);
  assert.equal((await call('action',{type:'git',id:repo,action:'update'})).ok,false);
  const updated=await call('action',{type:'git',id:repo,action:'update',ticket:checked.value.ticket});assert.equal(updated.ok,true,JSON.stringify(updated));
  assert.equal(git(repo,'rev-parse','HEAD'),git(seed,'rev-parse','HEAD'));
  fs.writeFileSync(path.join(repo,'untracked'),'local');let result=await call('check',{type:'git',id:repo});assert.match(result.error.message,/未提交|未跟踪/);fs.unlinkSync(path.join(repo,'untracked'));
  git(repo,'branch','--unset-upstream');result=await call('check',{type:'git',id:repo});assert.match(result.error.message,/跟踪分支/);git(repo,'branch','--set-upstream-to','origin/main');
  git(repo,'checkout','--detach');result=await call('check',{type:'git',id:repo});assert.match(result.error.message,/游离/);git(repo,'checkout','main');
  fs.writeFileSync(path.join(repo,'local'),'local');git(repo,'add','.');git(repo,'commit','-m','local');
  result=await call('check',{type:'git',id:repo});assert.equal(result.value.ahead,1);assert.equal(result.value.hasUpdate,false);
  fs.writeFileSync(path.join(seed,'remote'),'remote');git(seed,'add','.');git(seed,'commit','-m','remote');git(seed,'push');
  result=await call('check',{type:'git',id:repo});assert.match(result.error.message,/分叉/);
  // Linked worktrees use a .git file, and must also appear in inventory.
  const linked=path.join(fixtures,'linked');git(repo,'worktree','add','-b','linked',linked);
  const next=await call('state',{refresh:true});assert.ok(next.value.git.some(item=>item.id===linked));
});
