// Collega i moduli puri del pannello agli eventi della sessione e disegna il pane `devflow-flow`.
// Attivo solo con `factory/config.md` nella root; altrove ogni hook passa soltanto a `next`.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentCard, BoardRow, Forge, GateResult, LogLine, PhaseId, ReviewResult, Run, SessionRecord } from '../types'
import { type Attention, Notified, onBoardChange, onQuestion } from './attention'
import { bindFeature, featureOfArg, mainCheckoutOf, parseBoard, soleActive, summarize } from './board'
import { parseGate, parseReview } from './feature'
import { deriveView, escalatedFrom, phaseOfAgent, phaseOfState } from './flow'
import { parseForge, resolveLang, STRINGS } from './i18n'
import type { PaletteMode } from './palette'
import { parseCards, parseSession, reconcile, showsFlow } from './restore'
import { boardAlt, boardSvg, flowAlt, flowSvg } from './svg'
import { boardTerminal, flowTerminal } from './terminal'

type $ = EngineInterface

const PANE = 'devflow-flow'
const COMMAND = 'devflow-panel'
const FACTORY = 'devflow:factory'
const CONFIG = 'factory/config.md'
const BOARD = 'factory/board.md'
const CELL_W = 7.8 // px per cella, come agent-monitor
const MIN_W = 360

const emptyRun = (): Run => ({
  active: false, startedAt: 0, waiting: false, gateRunning: false, phaseStarted: {}, phaseEnded: {}, questions: 0,
})
const runAtom = atom({ plugin: 'devflow', key: 'run' } as const, emptyRun())
const agentsAtom = atom({ plugin: 'devflow', key: 'agents' } as const, {})

// Stato del modulo: rifatto a ogni session.start (che rigira anche a ogni reload)
let enabled = false
let t = STRINGS.en
let maxRounds = 2
let gateCommands: string[] = []
let openedOnce = false
let mode: PaletteMode = 'auto'
let notified = new Notified()
let lastRows = new Map<string, BoardRow>()
let ticker: { cancel: () => void } | undefined
let forge: Forge = 'github'
let lastAsk: string | undefined
// radice del checkout principale (da git); senza, i percorsi restano relativi alla cartella della sessione
let root: string | undefined

// ───────────── helper senza eccezioni ─────────────

const quiet = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn() } catch { return fallback }
}

const readText = ($: $, path: string) =>
  quiet(async () => { const v = await $.fs.read(path); return typeof v === 'string' ? v : undefined }, undefined as string | undefined)

/** Percorso sotto `factory/` (o altro relativo alla radice): assoluto sul checkout principale se noto */
const fromRoot = (rel: string) => (root ? `${root}/${rel}` : rel)

const loadBoard = async ($: $) => parseBoard((await readText($, fromRoot(BOARD))) ?? '')

/** Radice del checkout principale da `git rev-parse --git-common-dir`; `undefined` se git manca o fallisce */
const resolveRoot = ($: $) =>
  quiet(async () => {
    const r = await $.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { timeoutMs: 5000 })
    return mainCheckoutOf(r.exitCode, r.stdout)
  }, undefined as string | undefined)

/** Chiavi `chiave: valore` del frontmatter di config.md, commenti `#` e virgolette tolti */
export const frontmatter = (text: string): Record<string, string> => {
  const out: Record<string, string> = {}
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text.replace(/^﻿/, ''))
  for (const line of (m?.[1] ?? '').split(/\r?\n/)) {
    const kv = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (!kv?.[1]) continue
    let v = (kv[2] ?? '').replace(/\s+#.*$/, '').trim()
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1)
    out[kv[1]] = v
  }
  return out
}

const clip = (s: string, n = 48) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).slice(-2).join('/')

/** Riassunto di una chiamata tool, come agent-monitor: `Edit src/parser.ts`, `Bash npm test` */
export const describeTool = (name: string, input: unknown) => {
  const i = (input ?? {}) as Record<string, unknown>
  const s = (k: string) => (typeof i[k] === 'string' && i[k] !== '' ? (i[k] as string) : undefined)
  const path = s('file_path') ?? s('path')
  const arg =
    (path && baseName(path)) ??
    (s('pattern') && `"${s('pattern')}"`) ??
    s('command') ?? s('description') ?? s('url') ?? s('query') ?? s('prompt')
  return clip(arg ? `${name} ${arg.replace(/\s+/g, ' ')}` : name)
}

/** Motivo per la notifica needs-human dall'ultima riga di log della feature; una sola transizione non è un motivo */
export const needsHumanReason = (text: string | undefined): string | undefined => {
  if (!text) return undefined
  const s = text.trim()
  if (/(→|->)\s*needs-human\s*$/i.test(s)) return undefined
  const stripped = s.replace(/^needs-human\s*(:|->|→)\s*/i, '').trim()
  return stripped || undefined
}

const lastLogOf = (log: LogLine[], id: string) => [...log].reverse().find(l => l.id === id)?.text

/** Stati in cui la fine del turno principale è una domanda all'utente in testo semplice */
const WAIT_STATES = new Set(['interview', 'spec', 'spec-review', 'approve'])

/** Task id dal prompt di spawn dell'orchestratore (`task id: T2`, `Task: T2`, oppure un `T2` isolato) */
export const taskIdOf = (prompt: unknown): string | undefined => {
  if (typeof prompt !== 'string') return undefined
  const named = /\btask(?:[ _-]?id)?\s*[:=#]\s*[`"']?([A-Za-z]*\d+[\w.-]*)/i.exec(prompt)
  return (named?.[1] ?? /\b(T\d+)\b/.exec(prompt)?.[1])?.toUpperCase()
}

/** Argomento di `/devflow:factory` dal testo del prompt (o dagli args del comando); vuoto se assente */
export const argOfPrompt = (text: unknown, command?: unknown): string => {
  const m = typeof text === 'string' ? /^\/devflow:factory(?:\s+([\s\S]*))?$/.exec(text.trim()) : null
  if (m) return (m[1] ?? '').trim()
  const args = (command as { args?: unknown } | undefined)?.args
  return typeof args === 'string' ? args.trim() : ''
}

const paletteMode = async ($: $): Promise<PaletteMode> =>
  quiet(async () => {
    const theme = (await $.config.list()).find(r => r.key === 'theme')?.value
    const v = typeof theme === 'string' ? theme.toLowerCase() : ''
    return v.includes('dark') ? 'dark' : v.includes('light') ? 'light' : 'auto'
  }, 'auto' as PaletteMode)

const notify = async ($: $, a: Attention | undefined, id: string) => {
  if (!a || notified.has(a.key)) return
  notified.add(a.key)
  try { $.ui.toast(a.text) } catch { /* nessun toast: resta la notifica */ }
  // la notifica di sistema esiste solo dal terminale; sull'app desktop bastano i suoi banner. Se la superficie non si legge, si prova comunque
  const onTerminal = await quiet(async () => (await $.session.surfaces()).includes('terminal'), true)
  if (onTerminal) await quiet(() => $.ui.notify(a.text, { title: `devflow · ${id}` }), undefined)
}

const logError = ($: $, err: unknown) => {
  try { void Promise.resolve($.ui.log(`devflow: ${String(err)}`, { to: 'debug' })).catch(() => undefined) } catch { /* niente log */ }
}

const redraw = ($: $) => {
  try { $.ui.invalidate('ui.render') } catch { /* il prossimo evento ridisegna */ }
}

const saveTimes = ($: $, run: Run) =>
  run.featureId
    ? quiet(() => $.store.set(`times:${run.featureId}`, { phaseStarted: run.phaseStarted, phaseEnded: run.phaseEnded }), undefined)
    : Promise.resolve()

const loadTimes = async ($: $, id: string | undefined): Promise<Pick<Run, 'phaseStarted' | 'phaseEnded'>> => {
  const v = id ? ((await quiet(() => $.store.get(`times:${id}`), undefined)) as Partial<Run> | undefined) : undefined
  return {
    phaseStarted: v && typeof v.phaseStarted === 'object' && v.phaseStarted ? v.phaseStarted : {},
    phaseEnded: v && typeof v.phaseEnded === 'object' && v.phaseEnded ? v.phaseEnded : {},
  }
}

/** Id della sessione (nome del transcript, lo stesso del resume); `undefined` se non si legge */
const sessionId = ($: $) =>
  quiet(async () => { const id = await $.session.id(); return typeof id === 'string' && id ? id : undefined }, undefined as string | undefined)

/** Legame sessione-feature in `$.store`, per il resume; senza feature o senza session id non scrive */
const persistSession = async ($: $, run: Run) => {
  if (!run.featureId) return
  const sid = await sessionId($)
  if (!sid) return
  const record: SessionRecord = {
    featureId: run.featureId, startedAt: run.startedAt, asks: run.asks ?? 0, questions: run.questions,
    ...(lastAsk !== undefined ? { lastAsk } : {}),
  }
  await quiet(() => $.store.set(`session:${sid}`, record), undefined)
}

/** Card della run in corso in `$.store` (non a ogni turn.step) */
const persistAgents = async ($: $, run: Run) => {
  if (!run.featureId) return
  const sid = await sessionId($)
  if (!sid) return
  const cards = Object.fromEntries(Object.entries(await quiet(() => read($, agentsAtom), {} as Record<string, AgentCard>))
    .filter(([, c]) => c.startedAt >= run.startedAt))
  await quiet(() => $.store.set(`agents:${sid}`, cards), undefined)
}

/** Gate e review della feature, riletti a ogni render (file piccoli, nessuna cache) */
const loadFeature = async ($: $, id: string): Promise<{ gates: GateResult[]; reviews: ReviewResult[] }> => {
  const dir = fromRoot(`factory/features/${id}`)
  const files = async (path: string) => quiet(async () => (await $.fs.list(path)).filter(f => f.kind === 'file').map(f => f.name), [] as string[])
  const gates: GateResult[] = []
  for (const name of (await files(dir)).filter(n => /^gate-r\d+\.md$/i.test(n))) {
    const g = parseGate(name, (await readText($, `${dir}/${name}`)) ?? '')
    if (g) gates.push(g)
  }
  const reviews: ReviewResult[] = []
  for (const name of (await files(`${dir}/reviews`)).filter(n => /^r\d+-.+\.md$/i.test(n))) {
    const r = parseReview(name, (await readText($, `${dir}/reviews/${name}`)) ?? '')
    if (r) reviews.push(r)
  }
  return { gates, reviews }
}

// ───────────── transizioni ─────────────

/** Avvia la run e lega la sessione alla sua feature: da `arg` (id o NNN), altrimenti dalla sola riga attiva.
 *  `keep`: riavvio senza nuovo `/devflow:factory`, resta il legame attuale */
const startRun = async ($: $, arg?: string, keep = false) => {
  mode = await paletteMode($)
  const now = await $.clock.now()
  const board = await loadBoard($)
  const before = await quiet(() => read($, runAtom), emptyRun())
  const named = featureOfArg(arg, board.rows)
  const featureId = named ?? (keep ? before.featureId : (arg ?? '').trim() ? undefined : soleActive(board.rows))
  const times = await loadTimes($, featureId)
  const phase = phaseOfState(board.rows.find(r => r.id === featureId)?.state ?? '')
  if (phase && times.phaseStarted[phase] === undefined) times.phaseStarted[phase] = now
  // il contatore delle domande prosegue fra una run e l'altra: una domanda nuova non riusa la chiave di una già notificata
  const run = await update($, runAtom, cur => ({
    ...emptyRun(), featureId, active: true, startedAt: now, ...times, asks: cur.asks ?? 0, activitySinceAnswer: true,
  }))
  await saveTimes($, run)
  await persistSession($, run)
  lastRows = new Map(board.rows.map(r => [r.id, r]))
  if (!openedOnce) {
    openedOnce = true
    const isOpen = (await quiet(() => $.ui.panes(), [])).some(p => p.id === PANE)
    if (!isOpen) void quiet(() => $.ui.open({ id: PANE, title: t.paneTitle }), undefined)
  }
  redraw($)
}

/** Il turno ha lavorato per la factory: la sua fine normale può essere una domanda alla persona */
const markActivity = ($: $) => update($, runAtom, r => (r.active && !r.activitySinceAnswer ? { ...r, activitySinceAnswer: true } : r))

/** Il prompt viene dalla persona (Enter al terminale o Remote Control); senza origine si presume la persona */
const fromPerson = (origin: { kind: string } | undefined) => !origin || origin.kind === 'composer' || origin.kind === 'bridge'

const shift = (run: Run, from: string | undefined, to: string, now: number): Run => {
  const a = phaseOfState(from ?? ''), b = phaseOfState(to)
  const phaseStarted = { ...run.phaseStarted }, phaseEnded = { ...run.phaseEnded }
  if (a && a !== b) phaseEnded[a] = now
  if (b && b !== a) phaseStarted[b] = now
  return { ...run, phaseStarted, phaseEnded }
}

const boardChanged = async ($: $, input?: string) => {
  const board = await loadBoard($)
  // righe cambiate rispetto all'ultima lettura; lastRows si aggiorna subito, così due Edit concorrenti non le contano due volte
  const changes = board.rows
    .map(row => ({ row, prev: lastRows.get(row.id) }))
    .filter(c => c.prev?.state !== c.row.state)
  lastRows = new Map(board.rows.map(r => [r.id, r]))
  if (!changes.length) return redraw($)
  const now = await $.clock.now()
  // la sessione senza legame si lega alla riga che cambia; con un legame la feature non cambia più
  const now0 = await quiet(() => read($, runAtom), emptyRun())
  const bindId = now0.active && !now0.featureId ? bindFeature(changes.map(c => c.row), input) : undefined
  const bound = bindId ? await loadTimes($, bindId) : undefined

  // calcolato sul valore corrente: tocca solo featureId e tempi, mai waiting/gateRunning
  const run = await update($, runAtom, cur => {
    let featureId = cur.featureId
    let phaseStarted = cur.phaseStarted, phaseEnded = cur.phaseEnded
    if (cur.active && !featureId && bindId && bound) {
      featureId = bindId
      phaseStarted = bound.phaseStarted
      phaseEnded = bound.phaseEnded
    }
    for (const { row, prev } of changes) {
      if (row.id === featureId) ({ phaseStarted, phaseEnded } = shift({ ...cur, phaseStarted, phaseEnded }, prev?.state, row.state, now))
    }
    return { ...cur, featureId, phaseStarted, phaseEnded }
  })
  if (changes.some(c => c.row.id === run.featureId)) await saveTimes($, run)
  if (bindId && run.featureId === bindId) await persistSession($, run)

  // notifiche solo mentre la factory gira; un nuovo stato riapre le notifiche della riga
  for (const { row, prev } of changes) {
    notified.forget(`${row.id}:`)
    if (!run.active || row.id !== run.featureId) continue
    const why = row.state === 'needs-human' ? needsHumanReason(lastLogOf(board.log, row.id)) : undefined
    await notify($, onBoardChange(prev, row, why, t), row.id)
  }
  redraw($)
}

/** Tempi di una fase senza stato proprio sul board (commit), raffinati dagli agenti che la svolgono */
const agentPhase = async ($: $, type: string, edge: 'start' | 'end', now: number) => {
  const p: PhaseId | undefined = phaseOfAgent(type)
  if (!p) return
  const agents = Object.values(await read($, agentsAtom))
  let changed = false
  const run = await update($, runAtom, cur => {
    changed = false
    if (!cur.active) return cur
    if (edge === 'start') {
      const s = cur.phaseStarted[p], e = cur.phaseEnded[p]
      if (s !== undefined && (e === undefined || e < s)) return cur
      changed = true
      return { ...cur, phaseStarted: { ...cur.phaseStarted, [p]: now } }
    }
    const othersRunning = agents.some(a => a.status === 'running' && a.startedAt >= cur.startedAt && phaseOfAgent(a.type) === p)
    if (othersRunning) return cur
    changed = true
    return { ...cur, phaseEnded: { ...cur.phaseEnded, [p]: now } }
  })
  if (changed) await saveTimes($, run)
}

/** Un comando di shell è del gate se contiene (ovunque, anche tra virgolette o in un ciclo) build/lint/test di config.md, a meno di spazi e su confini di parola */
export const isGateCommand = (command: string, gates: readonly string[]) => {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  const cmd = norm(command)
  const word = /\w/
  return gates.map(norm).filter(g => g !== '').some(g => {
    for (let i = cmd.indexOf(g); i !== -1; i = cmd.indexOf(g, i + 1)) {
      const before = cmd[i - 1], after = cmd[i + g.length]
      if ((before === undefined || !word.test(before)) && (after === undefined || !word.test(after))) return true
    }
    return false
  })
}

/** Il board lo aggiorna anche l'orchestratore da shell (Get-Content/Set-Content, sed): dopo ogni comando lo si rilegge */
const shellCall = async <E extends { agentId?: string; command: string }, R>($: $, e: E, next: (e: E) => Promise<R>): Promise<R> => {
  if (!enabled || e.agentId !== undefined) return next(e)
  const run = await quiet(() => read($, runAtom), emptyRun())
  if (!run.active) return next(e)
  const gate = isGateCommand(e.command, gateCommands)
  if (/factory[\/]/i.test(e.command)) await quiet(() => markActivity($), undefined)
  if (gate) await quiet(async () => { await update($, runAtom, r => ({ ...r, gateRunning: true, activitySinceAnswer: true })); redraw($) }, undefined)
  try {
    const r = await next(e)
    await quiet(() => boardChanged($, e.command), undefined)
    return r
  } finally {
    if (gate) await quiet(async () => { await update($, runAtom, r => ({ ...r, gateRunning: false })); redraw($) }, undefined)
  }
}

const isBoard = (path: unknown) => typeof path === 'string' && /(^|[\\/])factory[\\/]board\.md$/i.test(path)

/** Un file sotto `factory/` (board, playbook della feature, spec, review…): scriverlo è lavoro della factory */
const inFactory = (path: unknown) => typeof path === 'string' && /(^|[\\/])factory[\\/]/i.test(path)

const isFactory = (name: unknown) => typeof name === 'string' && name.replace(/^\//, '').trim() === FACTORY

// ───────────── hook ─────────────

const isConfig = (path: unknown) => typeof path === 'string' && /(^|[\\/])factory[\\/]config\.md$/i.test(path)

/** Rilegge max_rounds, forge e comandi del gate da config.md */
const loadConfig = async ($: $) => {
  const cfg = frontmatter((await readText($, fromRoot(CONFIG))) ?? '')
  const rounds = Number(cfg.max_rounds)
  maxRounds = Number.isFinite(rounds) && rounds > 0 ? rounds : 2
  forge = parseForge(cfg.forge)
  gateCommands = [cfg.build, cfg.lint, cfg.test].filter((c): c is string => !!c && c.trim() !== '').map(c => c.trim())
}

let commandRegistered = false

/** Ricostruisce run e card dopo reload (atom intatto) o resume (atom vuoto, record in `$.store`) */
const restore = async ($: $) => {
  const sid = await sessionId($)
  const record = sid ? parseSession(await quiet(() => $.store.get(`session:${sid}`), undefined)) : undefined
  const cur = await quiet(() => read($, runAtom), emptyRun())
  let run: Run
  let cards: Record<string, AgentCard>
  if (cur.startedAt > 0) {
    // hot reload: lo stato in memoria è quello giusto
    run = { ...cur, gateRunning: false }
    cards = await quiet(() => read($, agentsAtom), {} as Record<string, AgentCard>)
    lastAsk = record?.featureId === cur.featureId ? record?.lastAsk : undefined
  } else if (record) {
    run = {
      ...emptyRun(), featureId: record.featureId, startedAt: record.startedAt, asks: record.asks, questions: record.questions,
      ...(await loadTimes($, record.featureId)), active: false,
    }
    lastAsk = record.lastAsk
    cards = parseCards(await quiet(() => $.store.get(`agents:${sid}`), undefined))
  } else {
    run = emptyRun()
    cards = {}
  }
  const list = await quiet(async () => (await $.agent.list()).map(a => ({ id: a.id, status: String(a.status) })), [] as { id: string; status: string }[])
  cards = reconcile(cards, list, await $.clock.now())
  run.active = Object.values(cards).some(c => c.status === 'running' && c.startedAt >= run.startedAt)
  await update($, agentsAtom, () => cards)
  await update($, runAtom, () => run)
}

/** Attiva la mod (idempotente): config.md esiste ma la sessione era partita senza, o rilettura dopo una sua modifica */
const activate = async ($: $, options: { language?: unknown }, fresh = false) => {
  await loadConfig($)
  if (enabled && !fresh) return
  enabled = true
  const settings = await quiet(() => $.settings.read(), {} as Awaited<ReturnType<$['settings']['read']>>)
  const lang = resolveLang(options.language as never, settings.language,
    await quiet(() => $.env.get('LC_ALL'), undefined), await quiet(() => $.env.get('LANG'), undefined))
  t = STRINGS[lang]
  mode = await paletteMode($)
  openedOnce = false
  notified = new Notified()
  lastAsk = undefined
  lastRows = new Map((await loadBoard($)).rows.map(r => [r.id, r]))
  await restore($)
  if (!commandRegistered) {
    commandRegistered = true
    await quiet(() => $.command.register({ name: COMMAND, description: t.commandDescription }), undefined)
  }
  try { ticker?.cancel() } catch { /* timer già fermo */ }
  ticker = $.clock.every(1000, () => {
    void quiet(async () => {
      const run = await read($, runAtom)
      if (!run.active) return
      const live = run.gateRunning || run.waiting ||
        Object.values(await read($, agentsAtom)).some(a => a.status === 'running' && a.startedAt >= run.startedAt)
      if (live) redraw($)
    }, undefined)
  })
}

/** Mod inattiva: se nel frattempo config.md è comparso (init a metà sessione) la attiva */
const ensureActive = async ($: $, options: { language?: unknown }) => {
  if (enabled) return
  await quiet(async () => { if (await $.fs.exists(fromRoot(CONFIG))) await activate($, options) }, undefined)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    try {
      // il timer di una sessione precedente si ferma anche se qui devflow non c'è
      try { ticker?.cancel() } catch { /* timer già fermo */ }
      ticker = undefined
      commandRegistered = false
      enabled = false
      root = await resolveRoot($)
      if (await quiet(() => $.fs.exists(fromRoot(CONFIG)), false)) await activate($, options, true)
    } catch {
      // un errore qui non deve fermare l'avvio della sessione
    }
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e, next) => {
    if (!enabled) return next(e)
    const isOpen = (await quiet(() => $.ui.panes(), [])).some(p => p.id === PANE)
    if (isOpen) {
      await quiet(() => $.ui.close({ id: PANE }), undefined)
      return { text: t.commandClosed }
    }
    await quiet(() => $.ui.open({ id: PANE, title: t.paneTitle }), undefined)
    return { text: t.commandOpened }
  })

  on('prompt.submit', async ($, e, next) => {
    if (!enabled && (isFactory(e.command?.name) || /^\/devflow:factory(\s|$)/.test(e.text.trim()))) await ensureActive($, options)
    if (enabled && (isFactory(e.command?.name) || /^\/devflow:factory(\s|$)/.test(e.text.trim()))) {
      await quiet(() => startRun($, argOfPrompt(e.text, e.command)), undefined)
    } else if (enabled && fromPerson(e.origin) && e.command?.name !== COMMAND && !/^\/devflow-panel(\s|$)/.test(e.text.trim())) {
      // la risposta della persona a una domanda in testo semplice: tocca di nuovo alla factory.
      // Notifiche, peer, trigger e il comando del pane non sono una risposta.
      await quiet(async () => {
        if (!(await read($, runAtom)).waiting) return
        await update($, runAtom, r => (r.active ? { ...r, waiting: false, activitySinceAnswer: false } : r))
        redraw($)
      }, undefined)
    }
    return next(e)
  })

  // Un hook per strumento, mai sul tool `Agent`: un agente salta gli hook in cui è annidata la sua spawn
  // (claude-code.d.ts, turn.start e turn.step), quindi nessun hook di questa mod deve avvolgerla.
  // Modello, effort e attività degli agenti arrivano da turn.step, come in agent-monitor.
  on('tool.call', { tool: ['Write', 'Edit'] }, async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    if (isConfig(input.file_path)) {
      // init scrive config.md: a file scritto si attiva la mod, o si rileggono i valori
      const r = await next(e)
      await quiet(async () => {
        if (enabled) await activate($, options)
        else await ensureActive($, options)
        if (enabled) await markActivity($)
      }, undefined)
      return r
    }
    if (!enabled || !inFactory(input.file_path)) return next(e)
    await quiet(() => markActivity($), undefined)
    if (!isBoard(input.file_path)) return next(e)
    const r = await next(e)
    const written = typeof input.new_string === 'string' ? input.new_string : typeof input.content === 'string' ? input.content : undefined
    await quiet(() => boardChanged($, written), undefined)
    return r
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    if (!enabled && e.agentId === undefined && (isFactory(input.skill) || isFactory(input.command))) await ensureActive($, options)
    if (enabled && e.agentId === undefined && (isFactory(input.skill) || isFactory(input.command))) await quiet(async () => {
      const arg = typeof input.args === 'string' ? input.args.trim() : ''
      // la run già legata da `/devflow:factory <arg>` non si rilegge dalla Skill senza argomento
      const cur = await quiet(() => read($, runAtom), emptyRun())
      await startRun($, arg, !arg && cur.active)
    }, undefined)
    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (!enabled || e.agentId !== undefined) return next(e)
    const run = await quiet(() => read($, runAtom), emptyRun())
    if (!run.active) return next(e)
    await quiet(async () => {
      const board = await loadBoard($)
      // senza feature nota (factory appena partita su una riga in coda), quella su cui si lavora ora
      const featureId = run.featureId ?? soleActive(board.rows)
      const row = board.rows.find(r => r.id === featureId)
      // la stessa chiamata rielaborata non è una domanda nuova
      const isNew = e.tool_use_id === undefined || e.tool_use_id !== lastAsk
      lastAsk = e.tool_use_id
      const cur = await update($, runAtom, r => ({
        ...r, featureId: r.featureId ?? featureId, waiting: true, activitySinceAnswer: true,
        asks: (r.asks ?? 0) + (isNew ? 1 : 0),
        questions: r.questions + (isNew && row?.state === 'interview' ? 1 : 0),
      }))
      await persistSession($, cur)
      redraw($)
      if (row) void notify($, onQuestion(row, t, cur.asks ?? 0), row.id)
    }, undefined)
    try {
      return await next(e)
    } finally {
      await quiet(async () => { await update($, runAtom, r => ({ ...r, waiting: false })); redraw($) }, undefined)
    }
  })

  on('tool.call', { tool: 'Bash' }, ($, e, next) => shellCall($, e, next))
  on('tool.call', { tool: 'PowerShell' }, ($, e, next) => shellCall($, e, next))

  on('agent.spawn', async ($, e, next) => {
    if (!enabled || !e.subagentType.startsWith('devflow:')) return next(e)
    await quiet(() => markActivity($), undefined)
    const r = await next(e)
    if (r.deny === undefined && r.agentId) {
      const id = r.agentId
      // run già partita e poi finita, ma la factory lancia ancora agenti: la run riparte (tempi di fase ripristinati da startRun)
      await quiet(async () => { const cur = await read($, runAtom); if (!cur.active && cur.startedAt > 0) await startRun($, undefined, true) }, undefined)
      await quiet(async () => {
        const now = await $.clock.now()
        const type = e.subagentType.replace(/^devflow:/, '')
        const task = taskIdOf(e.prompt)
        const run = await read($, runAtom)
        const all = await read($, agentsAtom)
        // escalation in base al modello dello spawn, non al tipo di agent
        const escalated = escalatedFrom(Object.values(all), {
          type, description: e.description, task, model: r.model ?? e.model, runStartedAt: run.startedAt,
        })
        await update($, agentsAtom, cur => {
          const old = cur[id]
          const card: AgentCard = {
            id, type, description: e.description, model: r.model ?? old?.model, effort: old?.effort,
            startedAt: old?.startedAt ?? now, status: 'running', activity: '@starting',
            ...(task ?? old?.task ? { task: task ?? old?.task } : {}),
            ...(escalated ? { escalatedFrom: escalated } : old?.escalatedFrom ? { escalatedFrom: old.escalatedFrom } : {}),
          }
          return { ...cur, [id]: card }
        })
        await agentPhase($, type, 'start', now)
        await persistAgents($, await read($, runAtom))
        redraw($)
      }, undefined)
    }
    return r
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    if (!enabled || id === undefined) return yield* next(e)
    await quiet(async () => {
      if (!(await read($, agentsAtom))[id]) return
      await update($, agentsAtom, all => {
        const a = all[id]
        return a ? {
          ...all,
          [id]: { ...a, model: e.model, effort: e.effort === undefined ? a.effort : String(e.effort), activity: '@thinking' },
        } : all
      })
    }, undefined)
    const r = yield* next(e)
    // lo strumento chiesto dal modello è l'attività della card finché gira
    const tool = r.toolUses[0]
    if (tool) {
      await quiet(async () => {
        if (!(await read($, agentsAtom))[id]) return
        await update($, agentsAtom, all => {
          const a = all[id]
          return a ? { ...all, [id]: { ...a, activity: describeTool(tool.name, tool.input) } } : all
        })
      }, undefined)
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (!enabled) return r
    const id = e.agentId
    await quiet(async () => {
      if (id !== undefined) {
        const card = (await read($, agentsAtom))[id]
        if (!card) return
        const now = await $.clock.now()
        await update($, agentsAtom, all => {
          const a = all[id]
          const status: AgentCard['status'] = e.reason === 'answer' ? 'done' : 'failed'
          return a ? { ...all, [id]: { ...a, endedAt: now, status } } : all
        })
        await agentPhase($, card.type, 'end', now)
        await persistAgents($, await read($, runAtom))
        redraw($)
      } else {
        const run = await read($, runAtom)
        if (!run.active) return
        if (e.reason === 'answer') {
          // agenti in background ancora in corso: il turno principale è finito ma la factory lavora
          if (Object.values(await read($, agentsAtom)).some(a => a.status === 'running' && a.startedAt >= run.startedAt)) return
          // un turno non della persona (notifica, peer, trigger) finito durante l'attesa: si aspetta ancora lei
          if (run.waiting && !run.activitySinceAnswer) return
          // una domanda in testo semplice chiude il turno: la factory aspetta la risposta, non è finita.
          // Solo se il turno ha lavorato per la factory: un turno su altro vuol dire intervista abbandonata
          const board = await loadBoard($)
          const featureId = run.featureId ?? soleActive(board.rows)
          const row = board.rows.find(r => r.id === featureId)
          if (row && WAIT_STATES.has(row.state) && run.activitySinceAnswer) {
            const cur = await update($, runAtom, r => ({
              ...r, featureId: r.featureId ?? featureId, waiting: true, gateRunning: false, activitySinceAnswer: false,
              asks: (r.asks ?? 0) + 1, questions: r.questions + (row.state === 'interview' ? 1 : 0),
            }))
            await persistSession($, cur)
            redraw($)
            await notify($, onQuestion(row, t, cur.asks ?? 0), row.id)
            return
          }
        }
        // Esc, errore, rifiuto o fine del lavoro: la factory non gira più
        await update($, runAtom, r => ({ ...r, active: false, waiting: false, gateRunning: false }))
        redraw($)
      }
    }, undefined)
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    if (!enabled) return next(e)
    const els = $.ui.resolve(e)
    // il terminale ha un Svg che non disegna nulla: ci si affida alla superficie, non alla presenza del tag
    const Svg = e.surface !== 'terminal' && 'Svg' in els ? els.Svg : undefined
    if (!Svg && e.surface !== 'terminal') return next(e)
    const W = Math.max(MIN_W, Math.floor((e.props.bodyColumns ?? 60) * CELL_W))
    const board = await loadBoard($)
    const run = await quiet(() => read($, runAtom), emptyRun())
    const bound = run.featureId ? board.rows.find(r => r.id === run.featureId) : undefined
    const row = showsFlow(run, bound) ? bound : undefined

    if (row) {
      try {
        const now = await $.clock.now()
        const agents = Object.values(await quiet(() => read($, agentsAtom), {} as Record<string, AgentCard>))
        const { gates, reviews } = await loadFeature($, row.id)
        const view = deriveView({ run, row, agents, reviews, gates, maxRounds, now, forge })
        if (!Svg) return flowTerminal(els, view, t, now)
        const { source, height } = flowSvg(view, W, t, mode, now)
        const shown = view.phases.flatMap(p => p.agents).map(a => `${a.type} ${a.description}`)
        const alt = shown.length ? `${flowAlt(view, t)}: ${shown.join(', ')}` : flowAlt(view, t)
        return <Svg source={source} alt={alt} width={W} height={height} />
      } catch (err) {
        // un errore nel diagramma lascia il riepilogo del board
        logError($, err)
      }
    }

    try {
      const summary = summarize(board)
      if (!Svg) return boardTerminal(els, summary, t)
      const { source, height } = boardSvg(summary, W, t, mode)
      return <Svg source={source} alt={boardAlt(summary, t)} width={W} height={height} />
    } catch (err) {
      logError($, err)
      return next(e)
    }
  })
}
