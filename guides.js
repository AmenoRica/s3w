/* Public Google Sheet. Edit guide titles and links in its three tabs. */
window.WEAPON_GUIDES = (() => {
  'use strict';
  const sheetId = '13fsuFudKMveXRW7Yvfpro8rGrVCTe24Nf4t9A4fg5h4';
  const tabs = {main:'메인', sub:'서브', special:'스페셜'};
  const cache = new Map();
  let requestId = 0;

  function parse(text) {
    // gviz wraps JSON in a callback. Parse the data without executing the response.
    const match = text.match(/^[\s\S]*?google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
    if (!match) throw new Error('Invalid sheet response');
    return parseResult(JSON.parse(match[1]));
  }

  function parseResult(result) {
    if (result.status === 'error' || !Array.isArray(result.table?.rows)) throw new Error('Sheet unavailable');
    if (result.table.cols?.length !== 3) throw new Error('Unexpected sheet columns');
    const rows = [];
    let title = '', link = '';
    for (const row of result.table.rows) {
      const [weapon, nextTitle, nextLink] = [0,1,2].map(i => String(row.c?.[i]?.v ?? '').trim());
      if (nextTitle) title = nextTitle;
      if (nextLink) link = nextLink;
      if (!weapon || !title || !link) continue;
      try {
        const url = new URL(link);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) continue;
        rows.push({weapon, title, url:url.href});
      } catch { /* Incomplete/invalid links are not published. */ }
    }
    return rows;
  }

  function readLocalFile(query) {
    // Google does not allow fetch from file:// (Origin: null).
    // Its documented JSONP response works without a local server.
    return new Promise((resolve, reject) => {
      const callback = `__weaponGuidesResponse${++requestId}`;
      const script = document.createElement('script');
      const finish = (error, rows) => {
        clearTimeout(timeout);
        script.remove();
        delete window[callback];
        if (error) reject(error); else resolve(rows);
      };
      const timeout = setTimeout(() => finish(new Error('Sheet timeout')), 12000);
      window[callback] = result => {
        try { finish(null, parseResult(result)); } catch (error) { finish(error); }
      };
      query.set('tqx', `out:json;responseHandler:${callback}`);
      script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${query}`;
      script.referrerPolicy = 'no-referrer';
      script.onerror = () => finish(new Error('Sheet unavailable'));
      document.head.append(script);
    });
  }

  async function fetchList(kind) {
    const query = new URLSearchParams({sheet:tabs[kind], headers:'1', tq:'select A,B,C', tqx:'out:json'});
    if (location.protocol === 'file:' || location.origin === 'null') return readLocalFile(query);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${query}`, {
        signal:controller.signal, credentials:'omit', cache:'no-store'
      });
      if (!response.ok) throw new Error(`Sheet HTTP ${response.status}`);
      return parse(await response.text());
    } finally { clearTimeout(timeout); }
  }

  function load(kind, retry = false) {
    if (!Object.hasOwn(tabs, kind)) return Promise.reject(new Error('Unknown guide category'));
    if (retry || !cache.has(kind)) cache.set(kind, fetchList(kind));
    return cache.get(kind);
  }
  return {load, parse};
})();
