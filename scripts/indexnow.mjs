// The ownership key is public verification data, not an API credential.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const config = JSON.parse(readFileSync(new URL('../content/indexnow.json', import.meta.url), 'utf8'));

export function validateSitemap(xml, origin) {
  const entries = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  if (!entries.length || entries.length > 10000 || new Set(entries).size !== entries.length) throw Error('Invalid sitemap URL count or duplicate URL');
  for (const value of entries) {
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash || !/^\/(?:[a-z0-9-]+\.html)?$/.test(url.pathname)) throw Error(`Non-public or non-canonical URL: ${value}`);
  }
  return entries;
}

export async function runIndexNow(args, request = fetch) {
  if (args.length !== 1 || !['--dry-run', '--submit'].includes(args[0])) throw Error('Use --dry-run to verify or --submit to notify search engines');
  const {host, key} = config;
  const origin = `https://${host}`;
  const keyLocation = `${origin}/${key}.txt`;
  const get = async url => {
    const response = await request(url, {redirect: 'error', signal: AbortSignal.timeout(30000)});
    if (!response.ok) throw Error(`${url}: HTTP ${response.status}`);
    return response.text();
  };
  const expected = validateSitemap(readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8'), origin);
  const urlList = validateSitemap(await get(`${origin}/sitemap.xml`), origin);
  if (urlList.length !== expected.length || expected.some(url => !urlList.includes(url))) throw Error('Live sitemap differs from this release. Deploy before submitting.');
  if ((await get(keyLocation)).trim() !== key) throw Error('Ownership key mismatch');
  let cursor = 0;
  await Promise.all(Array.from({length: 4}, async () => {
    while (cursor < urlList.length) {
      const url = urlList[cursor++];
      const html = await get(url);
      const canonical = /<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i.exec(html)?.[1];
      if (canonical !== url || /<meta[^>]+content=["'][^"']*noindex/i.test(html)) throw Error(`Page not indexable at its canonical URL: ${url}`);
    }
  }));
  if (args[0] === '--dry-run') return {dryRun: true, host, urls: urlList.length, message: 'Ownership key and all canonical pages verified; nothing submitted'};
  const response = await request('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: {'Content-Type': 'application/json; charset=utf-8'},
    body: JSON.stringify({host, key, keyLocation, urlList}), signal: AbortSignal.timeout(30000),
  });
  if (![200, 202].includes(response.status)) throw Error(`IndexNow submission failed: HTTP ${response.status}`);
  return {status: response.status, urls: urlList.length, message: response.status === 200 ? 'Received; indexing is not guaranteed' : 'Received; ownership verification pending'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await runIndexNow(process.argv.slice(2)), null, 2));
