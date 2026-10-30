import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readableText} from '../scripts/search-files.mjs';
import {validateSitemap, runIndexNow} from '../scripts/indexnow.mjs';

const read = name => fs.readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8');
const origin = 'https://www.dxbflights.info';
const urls = validateSitemap(read('sitemap.xml'), origin);
const config = JSON.parse(fs.readFileSync(new URL('../content/indexnow.json', import.meta.url), 'utf8'));
const canonical = html => /<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1];

test('sitemap pages exist with matching canonical URLs and unique metadata', () => {
  const titles = new Set();
  for (const url of urls) {
    const html = read(new URL(url).pathname.slice(1) || 'index.html');
    assert.equal(canonical(html), url);
    assert.doesNotMatch(html, /<meta[^>]+content=["'][^"']*noindex/i, `Noindex page in sitemap: ${url}`);
    const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
    assert.ok(title, url);
    assert.ok(!titles.has(title), `Duplicate title: ${title}`);
    titles.add(title);
    assert.match(html, /name="description"\s+content="[^"]+"/);
    for (const json of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => JSON.parse(json[1]));
  }
});

test('internal guide links and anchors resolve', () => {
  for (const url of urls) {
    const source = read(new URL(url).pathname.slice(1) || 'index.html');
    for (const [, href] of source.matchAll(/href="([^"?]+)"/g)) {
      if (!href.startsWith('/') && !href.startsWith('#')) continue;
      const target = new URL(href, url);
      if (target.pathname !== '/' && !target.pathname.endsWith('.html')) continue;
      const html = read(target.pathname.slice(1) || 'index.html');
      if (target.hash) assert.ok(html.includes(`id="${target.hash.slice(1)}"`), `Missing anchor ${href} from ${url}`);
    }
  }
});

test('extended text retains practical answers, sources and table content', () => {
  assert.equal(read('llms-full.txt'), read('llms-advanced.txt'));
  const extended = read('llms-advanced.txt');
  assert.match(extended, /Dubai eSIM and tourist SIM guide/);
  assert.match(extended, /How much data do you need/);
  assert.ok(extended.includes("https://www.dxbflights.info/dubai-sim-esim.html#plans"));
  assert.match(extended, /https:\/\/support.apple.com\/en-us\/118227/);
  assert.doesNotMatch(extended, /<script|<table|<details/);
  assert.equal(readableText('<p>See <a href="/dubai-sim-esim.html">the guide</a>.</p>'), 'See [the guide](https://www.dxbflights.info/dubai-sim-esim.html).');
  assert.match(read('robots.txt'), /Sitemap: https:\/\/www.dxbflights.info\/sitemap.xml/);
  assert.equal(read(`${config.key}.txt`).trim(), config.key);
});

test('IndexNow rejects external, duplicate, private and parameterized URLs', () => {
  for (const path of ['https://example.com/', `${origin}/api/orders`, `${origin}/?email=test`, `${origin}/#fragment`, `https://user@www.dxbflights.info/`]) {
    assert.throws(() => validateSitemap(`<urlset><loc>${path}</loc></urlset>`, origin));
  }
  assert.throws(() => validateSitemap(`<loc>${origin}/</loc><loc>${origin}/</loc>`, origin));
});

function mockRequest({key = config.key, missingCanonical = false, status = 200} = {}) {
  const posts = [];
  const request = async (url, options = {}) => {
    if (options.method === 'POST') { posts.push(JSON.parse(options.body)); return new Response('', {status}); }
    if (url.endsWith('/sitemap.xml')) return new Response(read('sitemap.xml'));
    if (url.endsWith(`/${config.key}.txt`)) return new Response(key);
    return new Response(missingCanonical ? '<html></html>' : `<link rel="canonical" href="${url}">`);
  };
  return {request, posts};
}

test('IndexNow dry run verifies the deployed pages without submitting', async () => {
  const {request, posts} = mockRequest();
  const result = await runIndexNow(['--dry-run'], request);
  assert.equal(result.urls, urls.length);
  assert.equal(posts.length, 0);
});

test('IndexNow never submits with a wrong key or missing canonical', async () => {
  for (const settings of [{key: 'wrong'}, {missingCanonical: true}]) {
    const {request, posts} = mockRequest(settings);
    await assert.rejects(runIndexNow(['--submit'], request));
    assert.equal(posts.length, 0);
  }
});

test('IndexNow submits the verified release and distinguishes pending verification', async () => {
  const {request, posts} = mockRequest({status: 202});
  const result = await runIndexNow(['--submit'], request);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].urlList, urls);
  assert.equal(posts[0].host, config.host);
  assert.match(result.message, /verification pending/);
  await assert.rejects(runIndexNow([], request));
  await assert.rejects(runIndexNow(['--dry-run', '--submit'], request));
});
