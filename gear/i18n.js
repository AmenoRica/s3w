// UI translations are kept separate from the immutable calculation snapshot.
let code = 'KRko', group = 'ko', messages = {}, names = {}, abilityKeys = {};
const groups = {KRko:'ko',JPja:'ja',USen:'en',EUen:'en',EUde:'de',EUes:'es',USes:'es',EUfr:'fr',USfr:'fr',EUit:'it',EUnl:'nl',EUru:'ru',CNzh:'zh-Hans',TWzh:'zh-Hant'};
export const languageCode = () => group;
export function t(key, values = {}) {
  const trimmed = key.trim();
  let value = group === 'ko' ? key : key.replace(trimmed, names[code]?.[abilityKeys[trimmed]] ?? messages[trimmed]?.[group] ?? window.SITE_I18N?.t(trimmed) ?? trimmed);
  for (const [name, replacement] of Object.entries(values)) value = value.replaceAll('{'+name+'}', String(replacement));
  return value;
}
export const gearName = key => names[code]?.[key] ?? names.KRko?.[key] ?? key;
export function applyStatic() {
  document.querySelectorAll('[data-l10n]').forEach(node => node.textContent = t(node.dataset.l10n));
  for (const attr of ['aria-label','placeholder','title']) document.querySelectorAll('[data-l10n-'+attr+']').forEach(node => node.setAttribute(attr, t(node.getAttribute('data-l10n-'+attr))));
}
export async function setupLanguage(catalogue, onChange) {
  const responses = await Promise.all([fetch('./messages.json?v=20260921-attack-counts'), fetch('./gear-names.json')]);
  if (responses.some(response => !response.ok)) throw new Error('Could not load translations. Please reload.');
  [messages, names] = await Promise.all(responses.map(response => response.json()));
  abilityKeys = Object.fromEntries(Object.entries(names.KRko).map(([key, name]) => [name, key]));
  const select = document.getElementById('language');
  select.replaceChildren(...Object.entries(catalogue.languages).map(([key, pack]) => new Option(pack.label,key)));
  const initial = () => {
    const explicit = new URLSearchParams(location.search).get('lang');
    if (catalogue.languages[explicit]) return explicit;
    try {const saved = localStorage.getItem('ink-armory-language'); if (catalogue.languages[saved]) return saved;} catch { /* Optional preference. */ }
    const browser = navigator.language.toLowerCase();
    if (browser.startsWith('zh')) return /tw|hk|hant/.test(browser) ? 'TWzh' : 'CNzh';
    return Object.keys(catalogue.languages).find(key => groups[key] === browser.split('-')[0]) || 'USen';
  };
  const set = next => {
    code = catalogue.languages[next] ? next : 'KRko'; group = groups[code]; select.value = code;
    window.SITE_I18N.setLanguage(code); applyStatic();
    try {localStorage.setItem('ink-armory-language',code);} catch { /* Optional preference. */ }
  };
  set(initial());
  select.addEventListener('change', () => {
    set(select.value);
    const url = new URL(location.href); url.searchParams.set('lang',code); history.replaceState(null,'',url);
    onChange();
  });
  select.disabled = false;
}
