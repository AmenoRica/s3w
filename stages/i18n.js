// Keep geometry and interaction helpers importable by the Node verification tools.
export const t=(key,values)=>globalThis.window?.SITE_I18N?.t(key,values)??key;
export const localizedText=(node,key)=>{node.dataset.l10n=key;node.textContent=t(key)};
