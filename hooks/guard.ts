// Guard sui vincoli degli agenti devflow: decide se una scrittura o un comando di shell è vietato.
// Modulo puro: restituisce il motivo del rifiuto (testo di `t.guard`) oppure `undefined` se la chiamata passa.
// Copre gli errori comuni, non è un parser completo della shell (vedi spec 016, Out of scope).
import type { Strings } from './i18n'

const PROJECT_FILES = ['factory/board.md', 'factory/archive.md', 'factory/playbook.md']

// cartella delle regole per feature: la scrive solo l'orchestratore (cartella e qualunque path sotto)
const RULES_DIR = 'factory/rules'
const RULES_MSG = `${RULES_DIR}/`

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
  const rs = Array.isArray(roots) ? roots : []
  const rel = underFactory(p, rs)
  const project = PROJECT_FILES.find(f => f === rel)
  if (project) return t.guard.orchestrator(project)
  // `underFactory` vuole un path sotto `factory/`: la cartella stessa si prova con un figlio fittizio
  if (underFactory(`${p}/x`, rs)?.startsWith(RULES_MSG)) return t.guard.orchestrator(RULES_MSG)
  const out = allowedOutput(ty)
  if (out) return out.re.test(p) ? undefined : t.guard.only(ty, out.files)
  if (ty === 'implementer' && rel !== undefined) return t.guard.factory(ty)
  return undefined
}

// ---- Shell ----

/** Testo con, per ogni carattere, la sua posizione nel comando originale */
type Src = { s: string; map: number[] }

type Token = { text: string; pos: number; src: Src }

type Hit = { pos: number; what: string; target?: string }

/** `tooComplex`: un limite dello scanner superato (profondità o annidamento), quindi una parte non è stata analizzata */
type Scan = { segs: Token[][]; redirs: Hit[]; tooComplex: boolean }

const slice = (src: Src, from: number, to: number): Src => ({ s: src.s.slice(from, to), map: src.map.slice(from, to) })

/** Toglie il `\` di `\"`, `\\`, `` \` ``, `\$` (contenuto preso da virgolette doppie) */
function unescape(src: Src): Src {
  let s = ''
  const map: number[] = []
  for (let i = 0; i < src.s.length; i++) {
    if (src.s.charAt(i) === '\\' && i + 1 < src.s.length && '"\\`$'.includes(src.s.charAt(i + 1))) i++
    s += src.s.charAt(i)
    map.push(src.map[i] ?? 0)
  }
  return { s, map }
}

// Le funzioni di `closers(s)` restituiscono l'indice del delimitatore di chiusura, o -1 se manca: un
// delimitatore senza chiusura vale come carattere normale, così non ingloba il resto del comando (es. il
// backtick di PowerShell in `Write-Host "done`n"; git push`).
// Ogni risultato è in cache per (tipo, indice) sulla stessa stringa: senza cache un input come
// `$("$("…` senza chiusure richiede tempo esponenziale e blocca l'hook, che è sincrono.

type Closers = {
  /** `'` di chiusura */
  single: (i: number) => number
  /** `"` di chiusura: salta `\x`, `$(…)` e `` `…` `` chiusi (che possono contenere altre virgolette) */
  double: (i: number) => number
  /** `)` che chiude la `(` in `open`: conta le parentesi annidate e salta le virgolette chiuse */
  paren: (open: number) => number
  /** `` ` `` di chiusura */
  backtick: (i: number) => number
}

// annidamento massimo fra virgolette e `$(…)` dentro una scansione: oltre, il delimitatore vale come
// carattere normale e lo stack resta limitato; il superamento si segnala con `onOver` (fail-closed)
const MAX_NEST = 64

function closers(s: string, onOver: () => void): Closers {
  const memo = new Map<number, number>()
  let nest = 0
  const cached = (kind: number, i: number, scan: () => number): number => {
    const key = i * 4 + kind
    const hit = memo.get(key)
    if (hit !== undefined) return hit
    if (nest >= MAX_NEST) { onOver(); return -1 }
    nest++
    let r: number
    try { r = scan() } finally { nest-- }
    memo.set(key, r)
    return r
  }
  const single = (i: number) => cached(0, i, () => s.indexOf("'", i + 1))
  const backtick = (i: number) => cached(1, i, () => {
    let j = i + 1
    while (j < s.length) {
      const c = s.charAt(j)
      if (c === '\\') j += 2
      else if (c === '`') return j
      else j++
    }
    return -1
  })
  const double = (i: number): number => cached(2, i, () => {
    let j = i + 1
    while (j < s.length) {
      const c = s.charAt(j)
      if (c === '\\') { j += 2; continue }
      if (c === '"') return j
      const e = c === '$' && s.charAt(j + 1) === '(' ? paren(j + 1) : c === '`' ? backtick(j) : -1
      j = e < 0 ? j + 1 : e + 1
    }
    return -1
  })
  // la scansione da `open` passa per le stesse posizioni di quella da ogni `(` interna: una pila risolve
  // in un solo passaggio anche le `(` interne (chiuse o senza chiusura), così ogni posizione si scandisce una volta
  const paren = (open: number): number => cached(3, open, () => {
    const stack: number[] = []
    for (let j = open; j < s.length; j++) {
      const c = s.charAt(j)
      if (c === '\\') j++
      else if (c === "'" || c === '"') { const e = c === "'" ? single(j) : double(j); if (e >= 0) j = e }
      else if (c === '(') stack.push(j)
      else if (c === ')') {
        const p = stack.pop()
        if (p === undefined || p === open) return j
        memo.set(p * 4 + 3, j)
      }
    }
    for (const p of stack) if (p !== open) memo.set(p * 4 + 3, -1)
    return -1
  })
  return { single, double, paren, backtick }
}

/** Sostituzioni `$(…)` e `` `…` `` chiuse nel contenuto grezzo di virgolette doppie, restituite senza escape */
function substitutions(inner: Src, onOver: () => void): Src[] {
  const out: Src[] = []
  const s = inner.s
  const close = closers(s, onOver)
  for (let j = 0; j < s.length; j++) {
    const c = s.charAt(j)
    if (c === '\\') { j++; continue }
    if (c === '$' && s.charAt(j + 1) === '(') {
      const e = close.paren(j + 1)
      if (e < 0) continue
      out.push(unescape(slice(inner, j + 2, e)))
      j = e
    } else if (c === '`') {
      const e = close.backtick(j)
      if (e < 0) continue
      out.push(unescape(slice(inner, j + 1, e)))
      j = e
    }
  }
  return out
}

/** Testo del token: senza `$(`, virgolette, parentesi, backtick */
const clean = (value: string) => value.replace(/\$\(/g, '').replace(/["'()`]/g, '')

/**
 * Divide `src` in segmenti (`&&`, `||`, `;`, `|`, `&` isolato, a capo) di token, fuori dalle virgolette.
 * Una parola quotata, anche in parte, resta un solo token e il contenuto quotato non si ri-segmenta.
 * `subs`: le sostituzioni `$(…)` e `` `…` `` (fuori dalle virgolette o dentro le doppie), da analizzare come comandi.
 */
function lex(src: Src, onOver: () => void): { segs: Token[][]; subs: Src[] } {
  const s = src.s
  const close = closers(s, onOver)
  const segs: Token[][] = []
  const subs: Src[] = []
  let cur: Token[] = []
  let word: Src = { s: '', map: [] }
  let start = -1
  const add = (part: Src) => { word.s += part.s; word.map.push(...part.map) }
  const begin = (i: number) => { if (start < 0) start = i }
  const flushWord = () => {
    const text = clean(word.s)
    if (start >= 0 && text) cur.push({ text, pos: src.map[start] ?? 0, src: word })
    word = { s: '', map: [] }
    start = -1
  }
  const flushSeg = () => { flushWord(); if (cur.length) segs.push(cur); cur = [] }
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i)
    const prev = s.charAt(i - 1)
    const next = s.charAt(i + 1)
    if (c === "'") {
      const end = close.single(i)
      if (end >= 0) {
        begin(i)
        add(slice(src, i + 1, end))
        i = end
        continue
      }
    }
    if (c === '"') {
      const end = close.double(i)
      if (end >= 0) {
        const inner = slice(src, i + 1, end)
        begin(i)
        add(unescape(inner))
        subs.push(...substitutions(inner, onOver))
        i = end
        continue
      }
    }
    if (c === '$' && next === '(') {
      const end = close.paren(i + 1)
      if (end >= 0) {
        begin(i)
        add(slice(src, i, end + 1))
        subs.push(slice(src, i + 2, end))
        i = end
        continue
      }
    }
    if (c === '`') {
      const end = close.backtick(i)
      if (end >= 0) {
        begin(i)
        add(slice(src, i, end + 1))
        subs.push(slice(src, i + 1, end))
        i = end
        continue
      }
    }
    if (c === '\n' || c === '\r' || c === ';') { flushSeg(); continue }
    if (c === '|') { flushSeg(); if (next === '|') i++; continue }
    if (c === '&') {
      if (next === '&') { flushSeg(); i++; continue }
      // `&` isolato: non parte di `2>&1`, `>&2`, `&>`
      if (prev !== '>' && prev !== '<' && next !== '>') { flushSeg(); continue }
    }
    if (/\s/.test(c)) { flushWord(); continue }
    begin(i)
    add(slice(src, i, i + 1))
  }
  flushSeg()
  return { segs, subs }
}

/** Nome del comando: ultimo componente del path, minuscolo, senza `.exe` */
const commandName = (text: string) => text.replace(/\\/g, '/').split('/').pop()?.toLowerCase().replace(/\.exe$/, '') ?? ''

const SH = new Set(['bash', 'sh', 'zsh', 'dash'])

/** Riconosce il flag che introduce il comando annidato, se `name` è un interprete */
function interpreterFlag(name: string): ((flag: string) => boolean) | undefined {
  if (SH.has(name)) return f => /^-[A-Za-z]*c[A-Za-z]*$/.test(f)
  if (name === 'pwsh' || name === 'powershell') return f => /^-(command|c)$/i.test(f)
  if (name === 'cmd') return f => /^\/c$/i.test(f)
  return undefined
}

/** Argomenti degli interpreti nel segmento: il token subito dopo il primo `-c` / `-Command` / `/c` */
function interpreterArgs(seg: Token[]): Src[] {
  const out: Src[] = []
  seg.forEach((tok, i) => {
    const isFlag = interpreterFlag(commandName(tok.text))
    if (!isFlag) return
    const j = seg.findIndex((t, k) => k > i && isFlag(t.text))
    const arg = j >= 0 ? seg[j + 1] : undefined
    if (arg) out.push(arg.src)
  })
  return out
}

// limite di ricorsione sui comandi annidati: oltre, il comando si rifiuta (`Scan.tooComplex`)
const MAX_DEPTH = 16

/** Segmenti e redirect di `src` e, ricorsivamente, dei suoi comandi annidati (posizioni nel comando originale) */
function analyze(src: Src, out: Scan, depth = 0): Scan {
  const mark = () => { out.tooComplex = true }
  const { segs, subs } = lex(src, mark)
  out.segs.push(...segs)
  for (const r of redirects(src.s, mark)) out.redirs.push({ ...r, pos: src.map[r.pos] ?? 0 })
  const nested = [...subs, ...segs.flatMap(interpreterArgs)]
  if (depth >= MAX_DEPTH) {
    // comandi annidati oltre la profondità massima: non analizzati, quindi il comando non è controllabile
    if (nested.length) mark()
    return out
  }
  for (const sub of nested) analyze(sub, out, depth + 1)
  return out
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
  const hits: Hit[] = []
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
function leadingWrite(seg: Token[]): Hit | undefined {
  const i = seg.findIndex(tok => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(tok.text))
  const head = seg[i]
  if (!head) return undefined
  const name = commandName(head.text)
  if (FILE_COMMANDS.has(name)) return { pos: head.pos, what: name }
  if (name === 'sed' && seg.slice(i + 1).some(tok => /^(-i|--in-place)/.test(tok.text))) return { pos: head.pos, what: 'sed -i' }
  const cmdlet = CMDLETS.find(c => c.toLowerCase() === name)
  if (cmdlet) return { pos: head.pos, what: cmdlet }
  return undefined
}

const SAFE_TARGET = /^(\/dev\/null|nul|\$null|&\d+)$/i

/** Redirect `>`/`>>` (con `1>`, `2>`, `&>`, `*>`) fuori dalle virgolette verso un file vero; `pos` è l'indice in `command` */
function redirects(command: string, onOver: () => void): Hit[] {
  const out: Hit[] = []
  const close = closers(command, onOver)
  for (let i = 0; i < command.length; i++) {
    const c = command.charAt(i)
    // virgolette chiuse: si saltano; senza chiusura valgono come carattere normale
    if (c === '"' || c === "'") {
      const e = c === "'" ? close.single(i) : close.double(i)
      if (e >= 0) i = e
      continue
    }
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
      while (k < command.length && !/[\s;|<>()`]/.test(command.charAt(k)) && !(command.charAt(k) === '&' && k > j)) k++
      target = command.slice(j, k)
    }
    i = Math.max(j, k) - 1
    const bare = target.replace(/^["']|["']$/g, '')
    if (!bare || SAFE_TARGET.test(bare)) continue
    out.push({ pos: opStart, what: `${op} ${target}`, target: bare })
  }
  return out
}

/** Prima operazione di scrittura (punto 3), da sinistra a destra, nei segmenti e nei comandi annidati */
function writeOp(scan: Scan, invs: Invocation[]): string | undefined {
  const hits: Hit[] = []
  for (const inv of invs) if (inv.sub && GIT_WRITES.has(inv.sub)) hits.push({ pos: inv.pos, what: `git ${inv.sub}` })
  for (const seg of scan.segs) { const w = leadingWrite(seg); if (w) hits.push(w) }
  hits.push(...scan.redirs)
  hits.sort((a, b) => a.pos - b.pos)
  return hits[0]?.what
}

/**
 * File del progetto (board, archivio o playbook) se `path`, dopo `normPath`, è quel file o finisce con `/<file>`;
 * `factory/rules/` se è la cartella delle regole o un path sotto di essa (relativo o dopo un `/`)
 */
function projectFileOf(path: string): string | undefined {
  const p = normPath(path)
  const f = PROJECT_FILES.find(f => p === f || p.endsWith(`/${f}`))
  if (f) return f
  return /(^|\/)factory\/rules(\/|$)/.test(p) ? RULES_MSG : undefined
}

/**
 * Punto 2: primo file del progetto nominato come path (token, valore dopo il primo `=` di `-x=…`/`--x=…` o
 * dopo il primo `:` di un parametro PowerShell `-X:…`, destinazione di un redirect).
 * Una frase quotata che cita il file non è un path: il token intero non è il file.
 */
function namedProjectFile(scan: Scan): string | undefined {
  const hits: { pos: number; f: string }[] = []
  for (const seg of scan.segs) for (const tok of seg) {
    const values = [/^--?[^=]+=(.*)$/, /^--?[^:=]+:(.*)$/].map(re => re.exec(tok.text)?.[1])
    for (const cand of [tok.text, ...values.filter((v): v is string => v !== undefined)]) {
      const f = projectFileOf(cand)
      if (f) hits.push({ pos: tok.pos, f })
    }
  }
  for (const r of scan.redirs) {
    const f = r.target ? projectFileOf(r.target) : undefined
    if (f) hits.push({ pos: r.pos, f })
  }
  hits.sort((a, b) => a.pos - b.pos)
  return hits[0]?.f
}

// lunghezza massima del comando: oltre, si rifiuta senza scansione (il caso peggiore dello scanner è quadratico)
const MAX_LEN = 65536

/**
 * Comando di shell (Bash o PowerShell) dell'agente `type` (senza `devflow:`).
 * Il testo quotato non è un comando, salvo i comandi annidati (`bash -c`, `pwsh -Command`, `cmd /c`, `$(…)`, backtick).
 * Motivo del rifiuto o `undefined`; solo la prima violazione, nell'ordine delle regole. Oltre i limiti dello
 * scanner (lunghezza, profondità, annidamento) il comando si rifiuta con `guard.tooComplex` (fail-closed),
 * dopo le violazioni trovate nella parte analizzata.
 */
export function checkShell(type: string, command: string, t: Strings): string | undefined {
  if (typeof type !== 'string' || typeof command !== 'string') return undefined
  const ty = bareType(type)
  if (command.length > MAX_LEN) return t.guard.tooComplex(ty)
  const scan = analyze({ s: command, map: Array.from({ length: command.length }, (_, i) => i) }, { segs: [], redirs: [], tooComplex: false })
  const invs = gitInvocations(scan.segs)

  const forbidden = forbiddenGit(invs)
  if (forbidden) return t.guard.command(forbidden)

  const write = writeOp(scan, invs)
  if (write) {
    const file = namedProjectFile(scan)
    if (file) return t.guard.orchestrator(file)
    if (isReadOnly(ty)) return t.guard.readOnly(ty, write)
  }
  if (scan.tooComplex) return t.guard.tooComplex(ty)
  return undefined
}
