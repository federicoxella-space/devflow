// Collega i moduli puri del pannello agli eventi della sessione e disegna il pane `devflow-flow`.
// Attivo solo con `factory/config.md` nella root; altrove ogni hook passa soltanto a `next`.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentCard, BoardRow, GateResult, LogLine, PhaseId, ReviewResult, Run } from '../types'
import { type Attention, Notified, onBoardChange, onQuestion } from './attention'
import { parseBoard, summarize } from './board'
import { parseGate, parseReview } from './feature'
import { deriveView, phaseOfAgent, phaseOfState } from './flow'
import { resolveLang, STRINGS } from './i18n'
import type { PaletteMode } from './palette'
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

// ───────────── helper senza eccezioni ─────────────

const quiet = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try { return await fn() } catch { return fallback }
}

const readText = ($: $, path: string) =>
  quiet(async () => { const v = await $.fs.read(path); return typeof v === 'string' ? v : undefined }, undefined as string | undefined)

const loadBoard = async ($: $) => parseBoard((await readText($, BOARD)) ?? '')

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

const ACTIVE_STATES = new Set(['interview', 'spec', 'spec-review', 'build', 'review', 'approve'])

/** La feature su cui lavora la factory: una riga in uno stato di lavoro, la più recente nel log */
const pickFeature = (rows: BoardRow[], log: LogLine[]): string | undefined => {
  const working = rows.filter(r => ACTIVE_STATES.has(r.state))
  if (!working.length) return undefined
  const lastIdx = (id: string) => log.map(l => l.id).lastIndexOf(id)
  return [...working].sort((a, b) => lastIdx(b.id) - lastIdx(a.id))[0]?.id
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
  await quiet(() => $.ui.notify(a.text, { title: `devflow · ${id}` }), undefined)
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

/** Gate e review della feature, riletti a ogni render (file piccoli, nessuna cache) */
const loadFeature = async ($: $, id: string): Promise<{ gates: GateResult[]; reviews: ReviewResult[] }> => {
  const dir = `factory/features/${id}`
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

const startRun = async ($: $) => {
  mode = await paletteMode($)
  const now = await $.clock.now()
  const board = await loadBoard($)
  const featureId = pickFeature(board.rows, board.log)
  const times = await loadTimes($, featureId)
  const phase = phaseOfState(board.rows.find(r => r.id === featureId)?.state ?? '')
  if (phase && times.phaseStarted[phase] === undefined) times.phaseStarted[phase] = now
  const run: Run = { ...emptyRun(), featureId, active: true, startedAt: now, ...times }
  await update($, runAtom, () => run)
  await saveTimes($, run)
  lastRows = new Map(board.rows.map(r => [r.id, r]))
  if (!openedOnce) {
    openedOnce = true
    const isOpen = (await quiet(() => $.ui.panes(), [])).some(p => p.id === PANE)
    if (!isOpen) void quiet(() => $.ui.open({ id: PANE, title: t.paneTitle }), undefined)
  }
  redraw($)
}

const shift = (run: Run, from: string | undefined, to: string, now: number): Run => {
  const a = phaseOfState(from ?? ''), b = phaseOfState(to)
  const phaseStarted = { ...run.phaseStarted }, phaseEnded = { ...run.phaseEnded }
  if (a && a !== b) phaseEnded[a] = now
  if (b && b !== a) phaseStarted[b] = now
  return { ...run, phaseStarted, phaseEnded }
}

const boardChanged = async ($: $) => {
  const board = await loadBoard($)
  // righe cambiate rispetto all'ultima lettura; lastRows si aggiorna subito, così due Edit concorrenti non le contano due volte
  const changes = board.rows
    .map(row => ({ row, prev: lastRows.get(row.id) }))
    .filter(c => c.prev?.state !== c.row.state)
  lastRows = new Map(board.rows.map(r => [r.id, r]))
  if (!changes.length) return redraw($)
  const now = await $.clock.now()
  // tempi delle feature in cui la factory potrebbe passare, letti prima: l'update deve essere sincrono e puro
  const times = new Map<string, Awaited<ReturnType<typeof loadTimes>>>()
  for (const c of changes) if (ACTIVE_STATES.has(c.row.state)) times.set(c.row.id, await loadTimes($, c.row.id))

  // calcolato sul valore corrente: tocca solo featureId e tempi, mai waiting/gateRunning
  const run = await update($, runAtom, cur => {
    let featureId = cur.featureId
    let phaseStarted = cur.phaseStarted, phaseEnded = cur.phaseEnded
    for (const { row, prev } of changes) {
      if (cur.active && row.id !== featureId && ACTIVE_STATES.has(row.state)) {
        const current = board.rows.find(r => r.id === featureId)
        const loaded = times.get(row.id)
        if ((!current || !ACTIVE_STATES.has(current.state)) && loaded) {
          featureId = row.id
          phaseStarted = loaded.phaseStarted
          phaseEnded = loaded.phaseEnded
        }
      }
      if (row.id === featureId) ({ phaseStarted, phaseEnded } = shift({ ...cur, phaseStarted, phaseEnded }, prev?.state, row.state, now))
    }
    return { ...cur, featureId, phaseStarted, phaseEnded }
  })
  if (changes.some(c => c.row.id === run.featureId)) await saveTimes($, run)

  // notifiche solo mentre la factory gira; un nuovo stato riapre le notifiche della riga
  for (const { row, prev } of changes) {
    notified.forget(`${row.id}:`)
    if (!run.active || !(prev || row.id === run.featureId)) continue
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

/** Un comando Bash è del gate se uno dei suoi pezzi (`&&`, `||`, `;`, `|`) inizia con build/lint/test di config.md */
export const isGateCommand = (command: string, gates: readonly string[]) =>
  gates.length > 0 && command.split(/&&|\|\||;|\|/).map(c => c.trim()).some(seg => gates.some(g => seg === g || seg.startsWith(`${g} `)))

const isBoard = (path: unknown) => typeof path === 'string' && /(^|[\\/])factory[\\/]board\.md$/i.test(path)

const isFactory = (name: unknown) => typeof name === 'string' && name.replace(/^\//, '').trim() === FACTORY

// ───────────── hook ─────────────

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    try {
      enabled = await quiet(() => $.fs.exists(CONFIG), false)
      if (enabled) {
        const cfg = frontmatter((await readText($, CONFIG)) ?? '')
        const rounds = Number(cfg.max_rounds)
        maxRounds = Number.isFinite(rounds) && rounds > 0 ? rounds : 2
        gateCommands = [cfg.build, cfg.lint, cfg.test].filter((c): c is string => !!c && c.trim() !== '').map(c => c.trim())
        const settings = await quiet(() => $.settings.read(), {} as Awaited<ReturnType<$['settings']['read']>>)
        const lang = resolveLang(options.language, settings.language,
          await quiet(() => $.env.get('LC_ALL'), undefined), await quiet(() => $.env.get('LANG'), undefined))
        t = STRINGS[lang]
        mode = await paletteMode($)
        openedOnce = false
        notified = new Notified()
        lastRows = new Map((await loadBoard($)).rows.map(r => [r.id, r]))
        await update($, runAtom, run => ({ ...run, active: false, waiting: false, gateRunning: false }))
        await quiet(() => $.command.register({ name: COMMAND, description: t.commandDescription }), undefined)
        // Ridisegno ogni secondo (timer di card e tempo totale) solo mentre la factory gira e qualcosa avanza
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
    if (enabled && (isFactory(e.command?.name) || /^\/devflow:factory(\s|$)/.test(e.text.trim()))) {
      await quiet(() => startRun($), undefined)
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (!enabled) return next(e)

    // Strumento in uso da un agente con una card
    if (e.agentId !== undefined) {
      const id = e.agentId
      await quiet(async () => {
        if (!(await read($, agentsAtom))[id]) return
        await update($, agentsAtom, all => {
          const a = all[id]
          return a ? { ...all, [id]: { ...a, activity: describeTool(e.tool, e) } } : all
        })
      }, undefined)
    }

    const input = e as unknown as Record<string, unknown>
    if ((e.tool === 'Write' || e.tool === 'Edit') && isBoard(input.file_path)) {
      const r = await next(e)
      await quiet(() => boardChanged($), undefined)
      return r
    }
    if (e.agentId !== undefined) return next(e)

    if (e.tool === 'Skill') {
      if (isFactory(input.skill) || isFactory(input.command)) await quiet(() => startRun($), undefined)
      return next(e)
    }

    if (e.tool === 'AskUserQuestion') {
      const run = await quiet(() => read($, runAtom), emptyRun())
      if (!run.active) return next(e)
      await quiet(async () => {
        const board = await loadBoard($)
        // senza feature nota (factory appena partita su una riga in coda), quella su cui si lavora ora
        const featureId = run.featureId ?? pickFeature(board.rows, board.log)
        const row = board.rows.find(r => r.id === featureId)
        await update($, runAtom, r => ({
          ...r, featureId: r.featureId ?? featureId, waiting: true, questions: r.questions + (row?.state === 'interview' ? 1 : 0),
        }))
        redraw($)
        if (row) void notify($, onQuestion(row, t), row.id)
      }, undefined)
      try {
        return await next(e)
      } finally {
        await quiet(async () => { await update($, runAtom, r => ({ ...r, waiting: false })); redraw($) }, undefined)
      }
    }

    if (e.tool === 'Bash') {
      const run = await quiet(() => read($, runAtom), emptyRun())
      if (!run.active || !isGateCommand(e.command, gateCommands)) return next(e)
      await quiet(async () => { await update($, runAtom, r => ({ ...r, gateRunning: true })); redraw($) }, undefined)
      try {
        return await next(e)
      } finally {
        await quiet(async () => { await update($, runAtom, r => ({ ...r, gateRunning: false })); redraw($) }, undefined)
      }
    }

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    if (!enabled || !e.subagentType.startsWith('devflow:')) return next(e)
    const r = await next(e)
    if (r.deny === undefined && r.agentId) {
      const id = r.agentId
      await quiet(async () => {
        const now = await $.clock.now()
        const type = e.subagentType.replace(/^devflow:/, '')
        const run = await read($, runAtom)
        const all = await read($, agentsAtom)
        const escalated = type === 'builder' && Object.values(all).some(c =>
          c.type === 'coder' && c.description === e.description && c.status !== 'running' && c.startedAt >= run.startedAt)
        await update($, agentsAtom, cur => {
          const old = cur[id]
          const card: AgentCard = {
            id, type, description: e.description, model: r.model ?? old?.model, effort: old?.effort,
            startedAt: old?.startedAt ?? now, status: 'running', activity: '@starting',
            ...(escalated ? { escalatedFrom: 'coder' } : old?.escalatedFrom ? { escalatedFrom: old.escalatedFrom } : {}),
          }
          return { ...cur, [id]: card }
        })
        await agentPhase($, type, 'start', now)
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
    return yield* next(e)
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
        redraw($)
      } else if ((await read($, runAtom)).active) {
        // fine del turno principale (risposta o Esc): la factory non gira più
        await update($, runAtom, run => ({ ...run, active: false, waiting: false, gateRunning: false }))
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
    const row = run.active && run.featureId ? board.rows.find(r => r.id === run.featureId) : undefined

    if (row) {
      try {
        const now = await $.clock.now()
        const agents = Object.values(await quiet(() => read($, agentsAtom), {} as Record<string, AgentCard>))
        const { gates, reviews } = await loadFeature($, row.id)
        const view = deriveView({ run, row, agents, reviews, gates, maxRounds, now })
        if (!Svg) return flowTerminal(els, view, t, now)
        const { source, height } = flowSvg(view, W, t, mode, now)
        const shown = view.phases.flatMap(p => p.agents).map(a => `${a.type} ${a.description}`)
        const alt = shown.length ? `${flowAlt(view, t)}: ${shown.join(', ')}` : flowAlt(view, t)
        return <Svg isInteractive source={source} alt={alt} width={W} height={height} />
      } catch {
        // un errore nel diagramma lascia il riepilogo del board
      }
    }

    try {
      const summary = summarize(board)
      if (!Svg) return boardTerminal(els, summary, t)
      const { source, height } = boardSvg(summary, W, t, mode)
      return <Svg isInteractive source={source} alt={boardAlt(summary, t)} width={W} height={height} />
    } catch {
      return next(e)
    }
  })
}
