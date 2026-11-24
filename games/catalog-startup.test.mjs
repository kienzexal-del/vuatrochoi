import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('catalog renders while stock service is still pending, then updates availability', async () => {
  const source = readFileSync(new URL('./catalog.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('try {\n  const stockRefresh = fetchStockStatus();');
  assert(start >= 0);
  const bootstrap = source.slice(start).replaceAll('import.meta.url', "'https://gamegiare.com/games/catalog.mjs'");
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const run = new AsyncFunction('fetchStockStatus','fetch','byId','document','window',
    'renderCatalog','setupFeatured','route','let games = [];\n' + bootstrap);
  let finishStock;
  const stock = new Promise(resolve => { finishStock = resolve; });
  let rendered = 0, featured = 0, routed = 0;
  const node = {addEventListener() {}};
  let timeout;
  try {
    await Promise.race([
      run(() => stock, async () => ({ok: true,json: async () => [{id: 1}]}), () => node,
        {querySelector: () => null}, {addEventListener() {}}, () => rendered++,
        () => featured++, () => routed++),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('UI blocked by stock request')), 250); })
    ]);
    assert.equal(rendered, 1);
    assert.equal(featured, 1);
    assert.equal(routed, 1);
    finishStock(true);
    await stock;
    await Promise.resolve();
    assert.equal(rendered, 2);
  } finally { clearTimeout(timeout); }
});
