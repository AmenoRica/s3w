import {Resvg, initWasm} from '@resvg/resvg-wasm';
import {Buffer} from 'node:buffer';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import catalogue from './generated/catalogue.json';
import data from '../gear/data.json';
import {selectionTotals} from '../gear/export-image.js';
import {readSelection, selectionSearch} from '../gear/share.js';

const ready = initWasm(wasm);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function asset(env, path) {
  const response = await env.ASSETS.fetch(new Request('https://assets.local/s3w/' + path));
  if (!response.ok) throw new Error(`Missing image asset: ${path}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function renderImage(state, env) {
  await ready;
  const weaponPath = `assets/Path_Wst_${state.weapon}.png`;
  const paths = new Set([weaponPath]);
  const circles = state.slots.map((row, r) => row.map((key, c) => {
    const x = [645, 800, 925, 1050][c], y = 164 + r * 151, radius = c === 0 ? 62 : 46;
    let icon = `<path d="M${x-12} ${y}h24M${x} ${y-12}v24" stroke="#96948e" stroke-width="4" stroke-linecap="round"/>`;
    if (key !== 'None') {
      const path = `gear/icons/${key}.png`;
      paths.add(path);
      icon = `<image xlink:href="${path}" x="${x-radius+10}" y="${y-radius+10}" width="${radius*2-20}" height="${radius*2-20}"/>`;
    }
    return `<circle cx="${x}" cy="${y}" r="${radius}" fill="#292a2c"/>${icon}`;
  }).join('')).join('');
  const totals = selectionTotals(state.slots, data.gear);
  const cellWidth = Math.min(112, 1120 / Math.max(1, totals.length));
  const left = (1200 - cellWidth * totals.length) / 2;
  const summary = totals.map(([key, points], index) => {
    const exclusive = data.gear[key].slot !== 'None';
    const x = left + index * cellWidth + (cellWidth - 84) / 2;
    const center = exclusive ? left + (index + 0.5) * cellWidth : x + 22;
    const size = exclusive ? 50 : 40, radius = exclusive ? 31 : 25;
    return `<circle cx="${center}" cy="572" r="${radius}" fill="#292a2c"/>
      <image xlink:href="gear/icons/${key}.png" x="${center-size/2}" y="${572-size/2}" width="${size}" height="${size}"/>
      ${exclusive ? '' : `<text x="${x+52}" y="581" font-family="Bricolage Grotesque" font-size="26" fill="#292a2c">${(points/10).toFixed(1)}</text>`}`;
  }).join('');
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630">
    <rect width="1200" height="630" rx="32" fill="#f5f3ed"/>
    <g transform="translate(108 0) scale(0.82)"><rect x="40" y="40" width="450" height="550" rx="28" fill="#e4e0d6"/>
    <image xlink:href="${weaponPath}" x="65" y="115" width="400" height="400"/>
    <path d="M540 80V550" stroke="#d6d2c8" stroke-width="2"/>
    ${circles}</g>
    <path d="M40 520H1160" stroke="#d6d2c8" stroke-width="2"/>
    ${summary}
  </svg>`;
  for (const [path, bytes] of await Promise.all([...paths].map(async path => [path, await asset(env, path)]))) {
    svg = svg.replaceAll(`xlink:href="${path}"`, `xlink:href="data:image/png;base64,${Buffer.from(bytes).toString('base64')}"`);
  }
  const renderer = new Resvg(svg, {font:{loadSystemFonts:false, fontBuffers:[await asset(env, 'assets/display.ttf')], defaultFontFamily:'Bricolage Grotesque'}});
  try {
    const rendered = renderer.render();
    try { return rendered.asPng(); }
    finally { rendered.free(); }
  } finally { renderer.free(); }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/s3w' && !url.pathname.startsWith('/s3w/')) return new Response('Not found', {status:404});
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405, headers:{Allow:'GET, HEAD'}});
    if (url.pathname === '/s3w/gear-demo' || url.pathname.startsWith('/s3w/gear-demo/')) {
      url.pathname = url.pathname.replace('/s3w/gear-demo', '/s3w/gear');
      return Response.redirect(url.href, 308);
    }
    if (url.pathname === '/s3w/og.png') {
      const state = readSelection(url.search, data, catalogue);
      const key = new URL('/s3w/og.png' + selectionSearch(state), url.origin);
      key.searchParams.set('v', catalogue.revision);
      const cacheRequest = new Request(key);
      const cached = await caches.default.match(cacheRequest);
      if (cached) return request.method === 'HEAD' ? new Response(null, cached) : cached;
      const headers = {'Content-Type':'image/png', 'Cache-Control':'public, max-age=86400', 'X-Content-Type-Options':'nosniff'};
      if (request.method === 'HEAD') return new Response(null, {headers});
      try {
        const response = new Response(await renderImage(state, env), {headers});
        ctx.waitUntil(caches.default.put(cacheRequest, response.clone()));
        return response;
      } catch (error) {
        console.error('OG image rendering failed', error);
        return new Response('Image temporarily unavailable', {status:503, headers:{'Cache-Control':'no-store'}});
      }
    }
    const response = await env.ASSETS.fetch(request);
    if (!response.ok || !['/s3w/gear/', '/s3w/gear/index.html'].includes(url.pathname)) return response;
    const state = readSelection(url.search, data, catalogue);
    const lang = Object.hasOwn(catalogue.languages, url.searchParams.get('lang')) ? url.searchParams.get('lang') : 'KRko';
    const title = `${catalogue.languages[lang].names[state.weapon]} · Splatoon 3`;
    const image = new URL('/s3w/og.png' + selectionSearch(state), url.origin);
    image.searchParams.set('v', catalogue.revision);
    const canonical = new URL('/s3w/gear/' + selectionSearch(state), url.origin);
    canonical.searchParams.set('lang', lang);
    const tags = {'og:type':'website','og:title':title,'og:description':'Splatoon 3 · Weapon & Gear Powers','og:url':canonical.href,'og:image':image.href,'og:image:type':'image/png','og:image:width':'1200','og:image:height':'630','og:image:alt':title + ' — weapon, 12 gear power slots and gear power totals'};
    const meta = Object.entries(tags).map(([property, content]) => `<meta property="${property}" content="${escape(content)}">`).join('') +
      `<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:image" content="${escape(image.href)}"><link rel="canonical" href="${escape(canonical.href)}">`;
    const result = new HTMLRewriter().on('head', {element(element) {element.append(meta, {html:true});}}).transform(response);
    result.headers.set('Cache-Control', 'no-cache');
    result.headers.delete('ETag');
    return result;
  }
};
