const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const handler = require('../api/supabase-config.js');
const names = ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY'];
const jwt = role => 'header.' + Buffer.from(JSON.stringify({role})).toString('base64url') + '.signature';
function request(key, method = 'GET', extra = {}) {
  const saved = Object.fromEntries(names.map(n => [n, process.env[n]]));
  for (const n of names) delete process.env[n];
  Object.assign(process.env, {SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:key}, extra);
  let status = 200, body;
  const headers = {};
  const response = {setHeader(k,v){headers[k]=v;},status(n){status=n;return this;},json(b){body=b;return this;}};
  try { handler({method}, response); } finally {
    for (const n of names) if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n];
  }
  return {status,body,headers};
}
test('public configuration accepts publishable and legacy anon keys', () => {
  for (const key of ['sb_publishable_test', jwt('anon')]) {
    const r = request(key);
    assert.equal(r.status,200);
    assert.equal(r.body.key,key);
    assert.equal(r.headers['Cache-Control'],'no-store');
  }
});
test('secret, privileged, malformed and mislabelled keys never reach the browser', () => {
  for (const key of ['sb_secret_test',jwt('service_role'),jwt('authenticated'),'bad','','a.b.c']) {
    const r = request(key);
    assert.equal(r.status,503);
    assert.deepEqual(r.body,{configured:false});
  }
  assert.equal(request('sb_publishable_test','GET',{SUPABASE_SECRET_KEY:'sb_publishable_test'}).status,503);
});
test('configuration rejects insecure URLs and unsupported methods', () => {
  assert.equal(request('sb_publishable_test','GET',{SUPABASE_URL:'http://example.supabase.co'}).status,503);
  assert.equal(request('sb_publishable_test','GET',{SUPABASE_URL:'https://user:pass@example.com'}).status,503);
  assert.equal(request('sb_publishable_test','POST').status,405);
  assert.equal(request('sb_publishable_test','HEAD').status,200);
});
test('security headers keep the existing Google, video and radio allowances', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json','utf8'));
  const headers = Object.fromEntries(config.headers[0].headers.map(h=>[h.key,h.value]));
  assert.equal(headers['X-Frame-Options'],'DENY');
  assert.equal(headers['Cross-Origin-Opener-Policy'],'same-origin-allow-popups');
  for (const directive of ["object-src 'none'","frame-ancestors 'none'",'https://www.youtube-nocookie.com','https://ad1.xdevel.com','https://*.supabase.co']) assert.ok(headers['Content-Security-Policy'].includes(directive));
});
test('deployment excludes internal material but retains runtime dependencies', () => {
  const ignore = fs.readFileSync('.vercelignore','utf8').split('\n');
  for (const p of ['supabase/','docs/','tests/','.env*','*.map']) assert.ok(ignore.includes(p));
  for (const p of ['index.html','api/','data/','assets/']) assert.ok(!ignore.includes(p));
});
test('HTML remains intact with valid inline JavaScript and canonical sources', () => {
  const html = fs.readFileSync('index.html','utf8');
  assert.match(html,/^<!doctype html>/i);
  assert.match(html,/<title>TB • Trenino Bari<\/title>/);
  for (const [,attributes,code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (code.trim() && !attributes.includes('application/ld+json')) new vm.Script(code);
  }
  assert.ok(html.includes('id="bari-videos"'));
  assert.ok(html.includes('class="source-line"'));
  assert.ok(html.includes('id="penaltyCanvas"'));
  assert.ok(html.includes('href="/LICENSE.txt"'));
});
