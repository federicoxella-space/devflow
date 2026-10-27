export type Family = 'fable' | 'mythos' | 'opus' | 'sonnet' | 'haiku' | 'other'
export type PaletteMode = 'auto' | 'dark' | 'light'
export type Tokens = {
  tx: string; mu: string; br: string; ln: string; cd: string; sd: string; ok: string; rd: string
  fa: string; my: string; op: string; so: string; ha: string; ot: string
}

const ALIASES: Record<string, string> = {
  opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5',
  fable: 'claude-fable-5-1', mythos: 'claude-mythos-5-1',
}

/** Toglie suffissi `[1m]` e prefissi Bedrock (`anthropic.`, `us.`/`global.`/`apac.`… `anthropic.`), risolve gli alias */
const normalizeModel = (model: string) => {
  const m = model.toLowerCase().replace(/\[.*\]$/, '').replace(/^([a-z-]+\.)?anthropic\./, '')
  return ALIASES[m] ?? m
}

export const family = (model: string | undefined): Family => {
  const m = model ? normalizeModel(model) : ''
  return (['fable', 'mythos', 'opus', 'sonnet', 'haiku'] as const).find(f => m.includes(f)) ?? 'other'
}

/** "claude-opus-5-5" → "opus 5.5" */
export const shortModel = (model: string | undefined) => {
  if (!model) return '—'
  const m = normalizeModel(model).replace(/^claude-/, '')
  const [name, ...ver] = m.split('-')
  const nums = ver.filter(v => /^\d{1,2}$/.test(v))
  return nums.length ? `${name} ${nums.join('.')}` : name
}

export const DARK: Tokens = {
  tx: '#E5DED6', mu: '#9A8F85', br: '#EDE6DE', ln: '#3A3532', cd: '#262322', sd: '#C9B79C',
  ok: '#A3E635', rd: '#EF4444',
  fa: '#F59E0B', my: '#22D3EE', op: '#A78BFA', so: '#34D399', ha: '#60A5FA', ot: '#9A8F85',
}

export const LIGHT: Tokens = {
  tx: '#3D3833', mu: '#7A7068', br: '#211E1B', ln: '#D6CEC6', cd: '#FBF9F6', sd: '#8A7458',
  ok: '#4D7C0F', rd: '#DC2626',
  fa: '#B45309', my: '#0891B2', op: '#7C3AED', so: '#059669', ha: '#2563EB', ot: '#7A7068',
}

export const modelVar = (f: Family): 'fa' | 'my' | 'op' | 'so' | 'ha' | 'ot' =>
  ({ fable: 'fa', mythos: 'my', opus: 'op', sonnet: 'so', haiku: 'ha', other: 'ot' } as const)[f]

const vars = (t: Tokens) =>
  (Object.keys(t) as (keyof Tokens)[]).map(k => `--${k}:${t[k]}`).join(';')

const TEXT_CSS =
  ".df text{font-family:ui-monospace,'Cascadia Code',Consolas,monospace}" +
  '.m{font-size:12px;fill:var(--tx)}.d{font-size:11px;fill:var(--mu)}' +
  '.b{font-size:13px;fill:var(--br);font-weight:500}.l{font-size:11px;fill:var(--mu);letter-spacing:.5px}'

/** Variabili CSS su `svg.df` + classi testo del mockup; `auto` segue prefers-color-scheme */
export const styleBlock = (mode: PaletteMode) => {
  const base = mode === 'light' ? LIGHT : DARK
  const media = mode === 'auto' ? `@media (prefers-color-scheme:light){svg.df{${vars(LIGHT)}}}` : ''
  return `<style>svg.df{${vars(base)}}${media}${TEXT_CSS}</style>`
}
