import {initialState, validateState} from './core.js?v=20260921-beacon-jump';
const PARTS = ['head', 'clothes', 'shoes'];
// URL-only codes; calculations and icon paths keep the original ability keys.
const CODES = new Map(Object.entries({
  None: '-',
  MainInk_Save: 'ISM', SubInk_Save: 'ISS', InkRecovery_Up: 'IRU',
  HumanMove_Up: 'RSU', SquidMove_Up: 'SSU',
  SpecialIncrease_Up: 'SCU', SpecialSpec_Up: 'SPU', RespawnSpecialGauge_Save: 'SSS',
  RespawnTime_Save: 'QRS', JumpTime_Save: 'QSJ', SubSpec_Up: 'BPU',
  OpInkEffect_Reduction: 'IRR', SubEffect_Reduction: 'BDU', Action_Up: 'IAU',
  StartAllUp: 'OGB', EndAllUp: 'LDE', MinorityUp: 'TEN', ComeBack: 'CBK',
  SquidMoveSpatter_Reduction: 'NIN', DeathMarking: 'HNT', ThermalInk: 'THI',
  Exorcist: 'RSP', ExSkillDouble: 'ADB', SuperJumpSign_Hide: 'STJ',
  ObjectEffect_Up: 'OSH', SomersaultLanding: 'DRL',
}));
const KEYS = new Map([...CODES].map(([key, code]) => [code, key]));

export function readSelection(search, data, catalogue) {
  const params = new URLSearchParams(search);
  const state = initialState();
  if (params.has('weapon')) state.weapon = params.get('weapon');
  if (PARTS.some(part => params.has(part))) {
    state.slots = PARTS.map(part => (params.get(part) ?? '-,-,-,-').split(',').map(code => KEYS.get(code)));
  }
  try { validateState(state, data, catalogue); return state; }
  catch { return initialState(); }
}

export function selectionSearch(state, search = '') {
  const params = new URLSearchParams(search);
  params.set('weapon', state.weapon);
  params.delete('gear');
  PARTS.forEach((part, row) => params.set(part, state.slots[row].map(key => {
    if (!CODES.has(key)) throw new Error(`Unknown gear ability: ${key}`);
    return CODES.get(key);
  }).join(',')));
  return '?' + params.toString().replaceAll('%2C', ',');
}
