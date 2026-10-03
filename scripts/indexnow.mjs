// Public discovery notification only. This never uploads a workspace or receipt.
const pageUrl = 'https://alidaram99.github.io/donelatch/';
const key = '97f9d2704a2f4b575c3bb73eac6d6a48';
const keyLocation = `${pageUrl}${key}.txt`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requirePublishedAssets() {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const [page, proof] = await Promise.all([
        fetch(pageUrl, { signal: AbortSignal.timeout(10000) }),
        fetch(keyLocation, { signal: AbortSignal.timeout(10000) })
      ]);
      const [html, publishedKey] = await Promise.all([page.text(), proof.text()]);
      if (page.status === 200 && html.includes('DoneLatch') &&
          proof.status === 200 && publishedKey.trim() === key) return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
    if (attempt < 3) await wait(5000);
  }
  throw new Error('DoneLatch page and scoped public key are not both live; no notification sent.');
}

await requirePublishedAssets();
const endpoint = new URL('https://api.indexnow.org/indexnow');
endpoint.searchParams.set('url', pageUrl);
endpoint.searchParams.set('key', key);
endpoint.searchParams.set('keyLocation', keyLocation);
const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow returned HTTP ${response.status}: ${await response.text()}`);
}
await response.body?.cancel();
console.log(`IndexNow HTTP ${response.status}: URL received${response.status === 202 ? '; key validation pending' : ''}. This is not proof of indexing or ranking.`);
