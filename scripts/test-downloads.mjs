import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RELEASE_REPO, releaseManifest, resolvePackage} from '../limitrss/src/downloads.mjs';
import {loadManifest, downloadResponse} from '../functions/_lib/downloads.js';
const release = (version, suffixes) => ({tag_name: `v${version}`, assets: suffixes.map(suffix => ({name: `LimitRSS-${version}-${suffix}`, state: 'uploaded', size: 100}))});
const six = ['Android.apk','iOS.ipa','macOS-arm64.dmg','macOS-x86_64.dmg','Windows-x64.exe','Windows-arm64.exe'];
test('public downloads distinguish architecture and exclude incomplete or prerelease assets', () => {
  const releases = [release('0.4.0',six), release('0.5.0',six), {...release('0.6.0',six), prerelease:true}, {...release('0.7.0',six), draft:true}];
  releases[1].assets.push({name:'LimitRSS-0.5.0-Harmony.hap',state:'uploaded',size:0});
  const manifest=releaseManifest(releases);
  assert.deepEqual(Object.keys(manifest.versions),['0.5.0','0.4.0']);
  assert.equal(manifest.repo,RELEASE_REPO);
  assert.match(resolvePackage(manifest,'mac','x86_64').url,/Releases\/releases\/download\/v0.5.0\/LimitRSS-0.5.0-macOS-x86_64.dmg$/);
  assert.match(resolvePackage(manifest,'windows','arm64').fileName,/Windows-arm64.exe$/);
  assert.match(resolvePackage(manifest,'windows').fileName,/Windows-x64.exe$/);
  assert.equal(resolvePackage(manifest,'harmony'),null);
  assert.equal(resolvePackage(manifest,'mac','bad'),null);
});
test('cache avoids GitHub requests; upstream failure falls back only to public snapshots', async () => {
  const manifest=releaseManifest([release('0.5.0',six)]);
  const request=new Request('https://example.test/limitrss/api/download/mac.json?arch=x86_64');
  const context={request,env:{RL:{get: async key => key.endsWith(':retry') ? null : manifest}}};
  const original=globalThis.fetch;
  let requests=0;
  globalThis.fetch=async()=>{requests++;throw new Error('Network unavailable');};
  try {
    const response=await downloadResponse(context,'mac');
    assert.equal(response.status,200);
    assert.match((await response.json()).url,/macOS-x86_64.dmg$/);
    assert.equal(requests,0);
    const stale={...manifest,generatedAt:'2026-01-01T00:00:00Z'};
    context.env.RL.get=async key=>key.endsWith(':retry') ? null : stale;
    context.env.RL.put=async()=>{};
    assert.equal((await loadManifest(context)).stale,true);
    assert.equal(requests,1);
    context.env.RL=undefined;
    context.env.ASSETS={fetch:async()=>new Response(JSON.stringify(manifest))};
    assert.equal((await loadManifest(context)).repo,RELEASE_REPO);
    context.env.ASSETS={fetch:async()=>new Response(JSON.stringify({...manifest,repo:'Demisse233/LimitRSS_Client'}))};
    await assert.rejects(()=>loadManifest(context),/Public download snapshot unavailable/);
  } finally {globalThis.fetch=original;}
});
test('invalid architecture is rejected and HEAD does not return a body', async()=>{
  const manifest=releaseManifest([release('0.5.0',six)]);
  const context={request:new Request('https://example.test/mac.json?arch=x64'),env:{RL:{get:async()=>manifest}}};
  assert.equal((await downloadResponse(context,'mac')).status,400);
  context.request=new Request('https://example.test/windows.json',{method:'HEAD'});
  const response=await downloadResponse(context,'windows');
  assert.equal(response.status,200);assert.equal(await response.text(),'');
});
