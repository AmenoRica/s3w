import assert from 'node:assert/strict';
const base = process.argv[2] || 'http://localhost:8787';
const get = path => fetch(new URL(path, base));
const selection = '?weapon=Shooter_Short_00&head=LDE,ISM,-,IRU&clothes=ADB,RSU,SSU,ISS&shoes=STJ,QRS,SCU,IAU';
const page = await get('/s3w/gear/' + selection + '&lang=USen&extra=%22%3E%3Cscript%3E');
assert.equal(page.status, 200);
const html = await page.text();
assert.equal((html.match(/property="og:image"/g) || []).length, 1);
assert.match(html, /property="og:title" content="Sploosh-o-matic · Splatoon 3"/);
assert.match(html, /name="twitter:card" content="summary_large_image"/);
const imageURL = new URL(html.match(/property="og:image" content="([^"]+)"/)[1].replaceAll('&amp;', '&'));
assert.equal(imageURL.pathname, '/s3w/og.png');
assert.equal(imageURL.searchParams.get('head'), 'LDE,ISM,-,IRU');
assert.equal(imageURL.searchParams.has('extra'), false);
const canonical = new URL(html.match(/rel="canonical" href="([^"]+)"/)[1].replaceAll('&amp;', '&'));
assert.equal(canonical.pathname, '/s3w/gear/');
for (const part of ['head','clothes','shoes']) {
  assert.equal(canonical.searchParams.get(part), imageURL.searchParams.get(part));
  assert.ok(imageURL.searchParams.get(part).split(',').every(code => code === '-' || /^[A-Z]{3}$/.test(code)));
}

assert.equal((await get('/s3w/gear/?lang=__proto__')).status, 200);
async function png(path) {
  const response = await get(path);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 1200);
  assert.equal(bytes.readUInt32BE(20), 630);
  return bytes;
}
const selected = await png(imageURL.pathname + imageURL.search);
const otherWeapon = await png('/s3w/og.png' + selection.replace('Shooter_Short_00', 'Shooter_Normal_00'));
const otherGear = await png('/s3w/og.png' + selection.replace('IRU', 'IAU'));
assert.notDeepEqual(selected, otherWeapon, 'weapon must actually appear in the PNG');
assert.notDeepEqual(selected, otherGear, 'gear icons must actually appear in the PNG');
assert.deepEqual(await png('/s3w/og.png?weapon=invalid&head=../../etc/passwd'), await png('/s3w/og.png'), 'invalid input uses the same validated fallback as the UI');
assert.deepEqual(await png('/s3w/og.png?head=EndAllUp,MainInk_Save,-,InkRecovery_Up'), await png('/s3w/og.png'), 'full names are no longer accepted');
const head = await fetch(new URL(imageURL.pathname + imageURL.search, base), {method:'HEAD'});
assert.equal(head.status, 200);assert.equal((await head.arrayBuffer()).byteLength, 0);
for (const path of ['/s3w/', '/s3w/stages/', '/s3w/gear/', '/s3w/assets/Path_Wst_Shooter_Short_00.png', '/s3w/gear/icons/Action_Up.png']) assert.equal((await get(path)).status, 200, path);
assert.equal((await get('/s3w/missing.js')).status, 404);
const redirect = await fetch(new URL('/s3w?keep=yes',base), {redirect:'manual'});
assert.ok([301,307,308].includes(redirect.status));
assert.ok(redirect.headers.get('location').endsWith('/s3w/?keep=yes'));
console.log('PASS: Worker HTML metadata, selected weapon/gear PNG pixels, invalid inputs, HEAD, subpath assets and redirects.');

for (const oldPath of ['/s3w/gear-demo', '/s3w/gear-demo/', '/s3w/gear-demo/index.html']) {
  const response = await fetch(new URL(oldPath + selection, base), {redirect:'manual'});
  assert.equal(response.status, 308);
  const location = new URL(response.headers.get('location'), base);
  assert.equal(location.pathname, oldPath.replace('gear-demo', 'gear'));
  assert.equal(location.search, selection);
}
assert.equal((await get('/s3w/gear' + selection)).status, 200);
console.log('PASS: new gear URL and old shared-link redirects.');
