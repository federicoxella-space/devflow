// Guard sui vincoli degli agenti devflow: decide se una scrittura o un comando di shell è vietato.
// Modulo puro: restituisce il motivo del rifiuto (testo di `t.guard`) oppure `undefined` se la chiamata passa.
// Copre gli errori comuni, non è un parser completo della shell (vedi spec 016, Out of scope).
import type { Strings } from './i18n'

const PROJECT_FILES = ['factory/board.md', 'factory/playbook.md']

/** `\` → `/`, `/` doppi ridotti, `.` e `..` risolti, minuscolo (confronto case-insensitive) */
export function normPath(path: string): string {
  const p = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase()
  const m = /^([a-z]:\/?|\/)/.exec(p)
  const prefix = m?.[1] ?? ''
  const out: string[] = []
  for (const seg of p.slice(prefix.length).split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (!prefix) out.push('..') // relativo: un `..` iniziale resta
      continue
    }
    out.push(seg)
  }
  return prefix + out.join('/')
}

/** Path dei worktree dalle righe `worktree <path>` di `git worktree list --porcelain` */
export function worktreeRoots(porcelain: string): string[] {
  if (typeof porcelain !== 'string') return []
  return porcelain.split(/\r?\n/)
    .map(l => /^worktree (.+)$/.exec(l)?.[1]?.trim())
    .filter((p): p is string => !!p)
}

const isAbsolute = (p: string) => p.startsWith('/') || /^[a-z]:/.test(p)

/** Parte del percorso da `factory/` in poi se è sotto factory (relativo o sotto una radice), altrimenti `undefined` */
function underFactory(p: string, roots: string[]): string | undefined {
  if (!isAbsolute(p)) return p.startsWith('factory/') ? p : undefined
  for (const r of roots) {
    if (typeof r !== 'string' || !r.trim()) continue
    const base = normPath(r.trim()).replace(/\/$/, '')
    if (p.startsWith(`${base}/factory/`)) return p.slice(base.length + 1)
  }
  return undefined
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const bareType = (type: string) => type.replace(/^devflow:/, '')

const isReadOnly = (type: string) => /^review-.+/.test(type) || type === 'approver' || type === 'spec-checker'

/** File ammessi per i tipi con un solo output: pattern sul percorso normalizzato e nomi per il messaggio */
function allowedOutput(type: string): { re: RegExp; files: string[] } | undefined {
  const review = /^review-(.+)$/.exec(type)
  if (review) {
    const x = review[1] ?? ''
    return { re: new RegExp(`(^|/)factory/features/[^/]+/reviews/r\\d+-${escapeRe(x.toLowerCase())}\\.md$`), files: [`reviews/r<N>-${x}.md`] }
  }
  if (type === 'approver') return { re: /(^|\/)factory\/features\/[^/]+\/decision\.md$/, files: ['decision.md'] }
  if (type === 'spec-checker') return { re: /(^|\/)factory\/features\/[^/]+\/spec-check\.md$/, files: ['spec-check.md'] }
  if (type === 'spec-writer') return { re: /(^|\/)factory\/features\/[^/]+\/(spec|playbook)\.md$/, files: ['spec.md', 'playbook.md'] }
  return undefined
}

/**
 * Scrittura `Write`/`Edit` di `path` da parte dell'agente `type` (senza `devflow:`).
 * `roots`: checkout principale e worktree. Motivo del rifiuto o `undefined`.
 */
export function checkWrite(type: string, path: string, roots: string[], t: Strings): string | undefined {
  if (typeof type !== 'string' || typeof path !== 'string' || !path.trim()) return undefined
  const ty = bareType(type)
  const p = normPath(path.trim())
  const rel = underFactory(p, Array.isArray(roots) ? roots : [])
  const project = PROJECT_FILES.find(f => f === rel)
  if (project) return t.guard.orchestrator(project)
  const out = allowedOutput(ty)
  if (out) return out.re.test(p) ? undefined : t.guard.only(ty, out.files)
  if (ty === 'implementer' && rel !== undefined) return t.guard.factory(ty)
  return undefined
}

// ---- Shell ----

type Token = { text: string; pos: number }

type Lexed = { segs: Token[][]; nested: Token[][] }

/**
 * Divide il comando in segmenti (`&&`, `||`, `;`, `|`, `&` isolato, a capo) di token puliti con la loro posizione.
 * Una parola quotata resta un solo token (gli spazi e i separatori fra virgolette non dividono); il contenuto
 * quotato si ri-segmenta in `nested`, così `bash -c "git push"` e `"$(git push)"` sono visti.
 */
function lex(command: string, base = 0): Lexed {
  const segs: Token[][] = []
  const nested: Token[][] = []
  let cur: Token[] = []
  let word = ''
  let start = 0
  const flushWord = () => {
    const text = word.replace(/\$\(/g, '').replace(/["'()`]/g, '')
    if (text) cur.push({ text, pos: base + start })
    word = ''
  }
  const flushSeg = () => { flushWord(); if (cur.length) segs.push(cur); cur = [] }
  for (let i = 0; i < command.length; i++) {
    const c = command.charAt(i)
    const prev = command.charAt(i - 1)
    const next = command.charAt(i + 1)
    if (c === '"' || c === "'") {
      let end = i + 1
      while (end < command.length && command.charAt(end) !== c) end += c === '"' && command.charAt(end) === '\\' ? 2 : 1
      const inner = command.slice(i + 1, Math.min(end, command.length))
      if (!word) start = i
      word += inner
      const sub = lex(inner, base + i + 1)
      nested.push(...sub.segs, ...sub.nested)
      i = end
      continue
    }
    if (c === '\n' || c === '\r' || c === ';') { flushSeg(); continue }
    if (c === '|') { flushSeg(); if (next === '|') i++; continue }
    if (c === '&') {
      if (next === '&') { flushSeg(); i++; continue }
      // `&` isolato: non parte di `2>&1`, `>&2`, `&>`
      if (prev !== '>' && prev !== '<' && next !== '>') { flushSeg(); continue }
    }
    if (/\s/.test(c)) { flushWord(); continue }
    if (!word) start = i
    word += c
  }
  flushSeg()
  return { segs, nested }
}

const isGit = (token: string) => /(^|\/)git(\.exe)?$/i.test(token.replace(/\\/g, '/'))

const SKIP_NEXT = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])

type Invocation = { pos: number; sub?: string; subPos: number; args: Token[] }

/** Invocazioni git: ogni token `git` ne apre una, fino alla fine del segmento */
function gitInvocations(segs: Token[][]): Invocation[] {
  const out: Invocation[] = []
  for (const seg of segs) {
    seg.forEach((tok, i) => {
      if (!isGit(tok.text)) return
      const args = seg.slice(i + 1)
      let sub: Token | undefined
      for (let j = 0; j < args.length; j++) {
        const a = args[j]?.text ?? ''
        if (SKIP_NEXT.has(a)) { j++; continue }
        if (a.startsWith('-')) continue
        sub = args[j]
        break
      }
      out.push({ pos: tok.pos, sub: sub?.text.toLowerCase(), subPos: sub?.pos ?? tok.pos, args })
    })
  }
  return out
}

/** Punto 1: push, force, no-verify, reset --hard (per tutti i subagent) */
function forbiddenGit(invs: Invocation[]): string | undefined {
  const hits: { pos: number; what: string }[] = []
  for (const inv of invs) {
    if (inv.sub === 'push') hits.push({ pos: inv.subPos, what: 'git push' })
    for (const a of inv.args) {
      const v = a.text.toLowerCase()
      if (/^--force(-with-lease(=.*)?|-if-includes)?$/.test(v)) hits.push({ pos: a.pos, what: '--force' })
      else if (v === '--no-verify') hits.push({ pos: a.pos, what: '--no-verify' })
      else if (inv.sub === 'reset' && v === '--hard') hits.push({ pos: a.pos, what: 'git reset --hard' })
    }
  }
  hits.sort((a, b) => a.pos - b.pos)
  return hits[0]?.what
}

const GIT_WRITES = new Set(['commit', 'add', 'checkout', 'switch', 'stash', 'restore', 'rebase', 'merge'])
const FILE_COMMANDS = new Set(['rm', 'mv', 'cp', 'tee', 'touch'])
const CMDLETS = ['Set-Content', 'Add-Content', 'Out-File', 'Remove-Item', 'Move-Item', 'Copy-Item', 'New-Item', 'Tee-Object']

/** Comando di scrittura all'inizio di un segmento (dopo le assegnazioni `VAR=x`) */
function leadingWrite(seg: Token[]): { pos: number; what: string } | undefined {
  const i = seg.findIndex(tok => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(tok.text))
  const head = seg[i]
  if (!head) return undefined
  const name = head.text.replace(/\\/g, '/').split('/').pop()?.toLowerCase().replace(/\.exe$/, '') ?? ''
  if (FILE_COMMANDS.has(name)) return { pos: head.pos, what: name }
  if (name === 'sed' && seg.slice(i + 1).some(tok => /^(-i|--in-place)/.test(tok.text))) return { pos: head.pos, what: 'sed -i' }
  const cmdlet = CMDLETS.find(c => c.toLowerCase() === name)
  if (cmdlet) return { pos: head.pos, what: cmdlet }
  return undefined
}

const SAFE_TARGET = /^(\/dev\/null|nul|\$null|&\d+)$/i

/** Redirect `>`/`>>` (con `1>`, `2>`, `&>`, `*>`) fuori dalle virgolette verso un file vero */
function redirects(command: string): { pos: number; what: string }[] {
  const out: { pos: number; what: string }[] = []
  let quote: '"' | "'" | undefined
  for (let i = 0; i < command.length; i++) {
    const c = command.charAt(i)
    if (quote) {
      if (c === '\\' && quote === '"') i++
      else if (c === quote) quote = undefined
      continue
    }
    if (c === '"' || c === "'") { quote = c; continue }
    if (c !== '>') continue
    // prefisso del descrittore (`2>`, `&>`, `*>`) solo a inizio parola
    let opStart = i
    const p = command.charAt(i - 1)
    if (/[0-9&*]/.test(p) && (i - 2 < 0 || /[\s;|&(]/.test(command.charAt(i - 2)))) opStart = i - 1
    const before = command.charAt(opStart - 1)
    let j = i + 1
    if (command.charAt(j) === '>') j++
    const op = command.slice(opStart, j)
    if (before === '-' || before === '=') { i = j - 1; continue }
    while (j < command.length && /[ \t]/.test(command.charAt(j))) j++
    let target = ''
    let k = j
    if (command.charAt(k) === '"' || command.charAt(k) === "'") {
      const q = command.charAt(k)
      const end = command.indexOf(q, k + 1)
      k = end < 0 ? command.length : end + 1
      target = command.slice(j, k)
    } else {
      while (k < command.length && !/[\s;|<>()]/.test(command.charAt(k)) && !(command.charAt(k) === '&' && k > j)) k++
      target = command.slice(j, k)
    }
    i = Math.max(j, k) - 1
    const bare = target.replace(/^["']|["']$/g, '')
    if (!bare || SAFE_TARGET.test(bare)) continue
    out.push({ pos: opStart, what: `${op} ${target}` })
  }
  return out
}

/** Prima operazione di scrittura del comando (punto 3), da sinistra a destra */
function writeOp(command: string, segs: Token[][], invs: Invocation[]): string | undefined {
  const hits: { pos: number; what: string }[] = []
  for (const inv of invs) if (inv.sub && GIT_WRITES.has(inv.sub)) hits.push({ pos: inv.pos, what: `git ${inv.sub}` })
  for (const seg of segs) { const w = leadingWrite(seg); if (w) hits.push(w) }
  hits.push(...redirects(command))
  hits.sort((a, b) => a.pos - b.pos)
  return hits[0]?.what
}

/**
 * Comando di shell (Bash o PowerShell) dell'agente `type` (senza `devflow:`).
 * Motivo del rifiuto o `undefined`; solo la prima violazione, nell'ordine delle regole.
 */
export function checkShell(type: string, command: string, t: Strings): string | undefined {
  if (typeof type !== 'string' || typeof command !== 'string') return undefined
  const ty = bareType(type)
  const { segs, nested } = lex(command)
  const invs = gitInvocations([...segs, ...nested])

  const forbidden = forbiddenGit(invs)
  if (forbidden) return t.guard.command(forbidden)

  const write = writeOp(command, segs, invs)
  if (write) {
    const lower = command.replace(/\\/g, '/').toLowerCase()
    const found = PROJECT_FILES.map(f => ({ f, at: lower.indexOf(f) })).filter(x => x.at >= 0).sort((a, b) => a.at - b.at)[0]
    if (found) return t.guard.orchestrator(found.f)
    if (isReadOnly(ty)) return t.guard.readOnly(ty, write)
  }
  return undefined
}
