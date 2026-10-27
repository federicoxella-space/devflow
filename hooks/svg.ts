// Disegni SVG del pannello: stesso layout, classi e animazioni SMIL del mockup, a larghezza variabile.
// Niente sfondo: Claude Code dipinge il suo. Colori solo come variabili CSS di `styleBlock`.
import type { AgentCard, BoardRow, BoardSummary, FlowView, PhaseId } from '../types'
import { PHASES } from './flow'
import type { Strings } from './i18n'
import { type PaletteMode, family, modelVar, shortModel, styleBlock } from './palette'

const MIN_W = 360
const CHAR = 7.2 // px per carattere a 12px
const SMALL = 6.6 // px per carattere a 11px
const CARD_H = 46
const CARD_STEP = 54
const X0 = 64

export const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const cut = (text: string, chars: number): string =>
  chars <= 1 ? '' : text.length <= chars ? text : `${text.slice(0, Math.max(0, chars - 1))}…`

const n = (value: number): string => String(Math.round(value * 100) / 100)
const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const hexPoints = (r: number): string => {
  const a = n(r * 0.866), h = n(r / 2)
  return `0,-${n(r)} ${a},-${h} ${a},${h} 0,${n(r)} -${a},${h} -${a},-${h}`
}

const open = (W: number, H: number, title: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" class="df" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">` +
  `<title>${esc(title)}</title>`

const MARKER =
  '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
  '<path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>'

const txt = (cls: string, x: number, y: number, body: string, extra = '') =>
  `<text class="${cls}" x="${n(x)}" y="${n(y)}"${extra}>${body}</text>`

const header = (t: Strings, W: number, title: string, sub: string, badge?: string): string => {
  const room = Math.floor((W - 40 - (badge ? 130 : 0)) / 7.8)
  return (
    txt('l', 20, 28, esc(t.paneTitle.toUpperCase())) +
    txt('b', 20, 48, esc(cut(title, room))) +
    txt('d', 20, 64, esc(cut(sub, Math.floor((W - 40 - (badge ? 130 : 0)) / SMALL))), '') +
    (badge
      ? `<rect x="${W - 140}" y="30" width="120" height="24" rx="4" fill="none" style="stroke:var(--br)"/>` +
        txt('m', W - 80, 46, esc(cut(badge, 15)), ' text-anchor="middle"')
      : '')
  )
}

// ───────────── Flow ─────────────

type Sub = { text: string; color?: string }[]
const subSvg = (parts: Sub, maxChars: number): string => {
  let left = maxChars
  let out = ''
  for (const p of parts) {
    if (left <= 1) break
    const text = cut(p.text, left)
    left -= text.length
    out += p.color ? `<tspan style="fill:var(${p.color})">${esc(text)}</tspan>` : esc(text)
  }
  return out
}

const agentSub = (agents: AgentCard[]): Sub => {
  const roles = [...new Set(agents.map(a => a.type))].join(', ')
  const models = [...new Set(agents.map(a => shortModel(a.model)))]
  const first = agents[0]
  return models.length === 1 && first?.model
    ? [{ text: `${roles} · ` }, { text: models[0] ?? '', color: `--${modelVar(family(first.model))}` }]
    : [{ text: roles }]
}

const dot = (cx: number, cy: number, r: number, fill: string, style: string) =>
  `<polygon transform="translate(${n(cx)} ${n(cy)})" points="${hexPoints(r)}" ${fill} style="${style}"/>`

const card = (a: AgentCard, y: number, i: number, W: number, t: Strings, now: number): string => {
  const x = X0, w = W - 40 - X0
  const v = `--${modelVar(family(a.model))}`
  const right = `${shortModel(a.model)}${a.effort ? ` · ${a.effort}` : ''}`
  const label = a.escalatedFrom ? `${a.type} ← ${a.escalatedFrom}` : a.type
  const rightW = right.length * SMALL
  const room = (w - 28 - rightW - 12 - 92 + x) / CHAR // spazio per descrizione + etichetta
  const descMax = Math.max(8, Math.floor(room - label.length * (SMALL / CHAR) - 2))
  const desc = cut(a.description, descMax)
  const descW = desc.length * CHAR
  const labelX = X0 + 28 + descW + 12
  const activity = a.activity === '@thinking' || a.activity === '@starting' ? `○ ${t.thinking}` : `↳ ${a.activity}`
  const timeText = `⏱ ${clock((a.endedAt ?? now) - a.startedAt)}`
  const begin = i ? ` begin="${n((i * 0.4) % 1.2)}s"` : ''
  const line2Max = Math.floor((w - 28 - timeText.length * SMALL - 12) / SMALL)
  const showLabel = labelX + label.length * SMALL < x + w - 14 - rightW - 6
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${CARD_H}" rx="6" fill="none" stroke-width="4" opacity="0.15" style="stroke:var(${v})"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${CARD_H}" rx="6" stroke-width="1" style="fill:var(--cd);stroke:var(${v})"/>` +
    `<circle cx="${x + 16}" cy="${y + 15}" r="3.5" style="fill:var(${v})"><animate attributeName="opacity" values="1;0.2;1" dur="1.2s"${begin} repeatCount="indefinite"/></circle>` +
    txt('m', x + 28, y + 19, esc(desc), ' style="font-weight:500"') +
    (showLabel ? txt('d', labelX, y + 19, esc(label)) : '') +
    txt('m', x + w - 14, y + 19, esc(right), ` text-anchor="end" style="fill:var(${v})"`) +
    txt('d', x + 28, y + 37, esc(cut(activity, line2Max))) +
    txt('d', x + w - 14, y + 37, esc(timeText), ' text-anchor="end"')
  )
}

const legend = (t: Strings, W: number, top: number): { svg: string; rows: number } => {
  const L = t.legend
  type Item = { w: number; draw: (x: number, y: number) => string }
  const lab = (s: string) => s.length * SMALL + 22
  const items: Item[] = [
    { w: lab(L.done), draw: (x, y) => dot(x + 6, y, 5, '', 'fill:var(--sd)') + txt('d', x + 16, y + 4, esc(L.done)) },
    { w: lab(L.active), draw: (x, y) => dot(x + 6, y, 5, '', 'fill:var(--br)') + txt('d', x + 16, y + 4, esc(L.active)) },
    {
      w: lab(L.waiting),
      draw: (x, y) =>
        `<polygon transform="translate(${x + 6} ${y})" points="${hexPoints(5)}" fill="none" stroke-width="1.2" style="stroke:var(--br)">` +
        '<animateTransform attributeName="transform" type="scale" additive="sum" values="1;1.3;1" dur="0.9s" repeatCount="indefinite"/></polygon>' +
        txt('d', x + 16, y + 4, esc(L.waiting)),
    },
    { w: lab(L.todo), draw: (x, y) => dot(x + 6, y, 5, 'fill="none"', 'stroke:var(--mu)') + txt('d', x + 16, y + 4, esc(L.todo)) },
    { w: lab(L.pass), draw: (x, y) => `<rect x="${x}" y="${y - 5}" width="10" height="10" rx="2" style="fill:var(--ok)"/>` + txt('d', x + 16, y + 4, esc(L.pass)) },
    {
      w: lab(L.reentry) + 12,
      draw: (x, y) =>
        `<line x1="${x}" y1="${y}" x2="${x + 18}" y2="${y}" stroke-width="1.2" stroke-dasharray="4 3" style="stroke:var(--rd)"/>` + txt('d', x + 24, y + 4, esc(L.reentry)),
    },
    {
      w: 60 + L.models.length * SMALL,
      draw: (x, y) =>
        ['fa', 'my', 'op', 'so', 'ha'].map((c, i) => `<circle cx="${x + 4 + i * 12}" cy="${y}" r="4" style="fill:var(--${c})"/>`).join('') +
        txt('d', x + 66, y + 4, esc(L.models)),
    },
  ]
  let x = 20, row = 0, svg = ''
  for (const it of items) {
    if (x > 20 && x + it.w > W - 20) { x = 20; row++ }
    svg += it.draw(x, top + row * 18)
    x += it.w + 8
  }
  return { svg, rows: row + 1 }
}

export function flowSvg(
  view: FlowView, width: number, t: Strings, mode: PaletteMode, now: number,
): { source: string; height: number } {
  const W = Math.max(MIN_W, Math.floor(width))
  const active = view.phases.find(p => p.status === 'active' || p.status === 'waiting')
  const allDone = view.phases.every(p => p.status === 'done')
  const agentCount = view.phases.reduce((s, p) => s + p.agents.length, 0)
  const badge = active
    ? `${t.short[active.id].toUpperCase()} · R${view.round}/${view.maxRounds}`
    : `${allDone ? t.allDone : '—'} · R${view.round}/${view.maxRounds}`

  // metriche
  const bw = Math.floor((W - 70) / 4)
  const metrics = [
    [t.metricPhase, active ? t.short[active.id] : allDone ? t.allDone.toLowerCase() : '—'],
    [t.metricAgents, t.agentsActive(agentCount)],
    [t.metricRound, `${view.round} / ${view.maxRounds}`],
    [t.metricTime, clock(view.elapsedMs)],
  ] as const
  let body = header(t, W, view.featureId, `${view.title} · ${view.branch}`, badge)
  metrics.forEach(([label, value], i) => {
    const x = 20 + i * (bw + 10), w = i === 3 ? W - 20 - x : bw
    body +=
      `<rect x="${x}" y="80" width="${w}" height="${CARD_H}" rx="6" fill="none" style="stroke:var(--ln)"/>` +
      txt('l', x + 12, 98, esc(label)) + txt('b', x + 12, 116, esc(cut(value, Math.floor((w - 20) / 7.8))))
  })

  // posizioni: cy = centro dell'esagono; advance = distanza dalla fase successiva
  const hasPills = view.reviews.length > 0
  const layout = view.phases.map(p => {
    const pills = p.id === 'review' && hasPills
    const k = p.agents.length
    return { p, pills, cardsTop: pills ? 38 : 30, advance: k ? (pills ? 38 : 30) + k * CARD_STEP - 8 + 34 : pills ? 60 : 46 }
  })
  const cys: number[] = []
  let cy = 160
  for (const l of layout) { cys.push(cy); cy += l.advance }
  const lastCy = cys[cys.length - 1] ?? 160
  const cyOf = (id: PhaseId) => cys[PHASES.indexOf(id)] ?? 160

  // binario
  for (let i = 0; i < layout.length - 1; i++) {
    const cur = layout[i]!.p, next = layout[i + 1]!.p
    const y1 = (cys[i] ?? 0) + 8, y2 = (cys[i + 1] ?? 0) - 8
    if (next.status === 'active' || next.status === 'waiting')
      body += `<line x1="40" y1="${y1}" x2="40" y2="${y2}" stroke-width="1.5" stroke-dasharray="3 3" style="stroke:var(--br)"><animate attributeName="stroke-dashoffset" from="0" to="-12" dur="0.8s" repeatCount="indefinite"/></line>`
    else if (cur.status === 'done' && next.status === 'done')
      body += `<line x1="40" y1="${y1}" x2="40" y2="${y2}" stroke-width="1.5" style="stroke:var(--sd)"/>`
    else body += `<line x1="40" y1="${y1}" x2="40" y2="${y2}" stroke-width="1" stroke-dasharray="2 4" style="stroke:var(--ln)"/>`
  }

  // fasi
  const timeX = W - 56
  const textRoom = Math.floor((timeX - X0 - 50) / SMALL)
  const arrows: { fromX: number; fromY: number }[] = []
  let arrow = ''
  layout.forEach(({ p, pills, cardsTop }, i) => {
    const y = cys[i] ?? 160
    const on = p.status === 'active', wait = p.status === 'waiting', done = p.status === 'done'
    const reentryHere = view.reentry?.to === p.id ? view.reentry : undefined
    const base = t.phases[p.id]
    const title = p.id === 'build' && view.round > 1 ? t.roundTitle(base, view.round)
      : p.id === 'review' && hasPills ? t.reviewResult(base, view.reviews[0]?.round ?? view.round) : base
    let g = `<g><title>${esc(t.contracts[p.id])}</title>`
    if (on)
      g += `<polygon transform="translate(40 ${y})" points="${hexPoints(9)}" fill="none" stroke-width="1" style="stroke:var(--br)"><animateTransform attributeName="transform" type="scale" additive="sum" values="1;2.1" dur="2.4s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.8;0" dur="2.4s" repeatCount="indefinite"/></polygon>`
    if (on || done) g += dot(40, y, 8, '', `fill:var(${on ? '--br' : '--sd'})`)
    else if (wait)
      g += `<polygon transform="translate(40 ${y})" points="${hexPoints(8)}" fill="none" stroke-width="1.2" style="stroke:var(--br)"><animateTransform attributeName="transform" type="scale" additive="sum" values="1;1.3;1" dur="0.9s" repeatCount="indefinite"/></polygon>`
    else g += dot(40, y, 7, 'fill="none" stroke-width="1"', 'stroke:var(--mu)')
    g += txt(on || wait ? 'b' : 'm', X0, y - 3, esc(cut(title, Math.floor((timeX - X0 - 60) / 7.8))))
    if (p.durationMs !== undefined) g += txt('d', timeX, y - 3, clock(p.durationMs), ' text-anchor="end"')

    const subY = y + (on ? 14 : 12)
    if (pills) {
      let x = X0
      for (const r of view.reviews) {
        const ok = r.verdict === 'PASS'
        const label = `${ok ? '✓' : '✕'} ${r.reviewer}`
        const w = Math.ceil(label.length * SMALL + 20)
        if (x + w > W - 40) break
        const c = ok ? '--ok' : '--rd'
        g += `<rect x="${x}" y="${y + 8}" width="${w}" height="20" rx="4" fill="none" style="stroke:var(${c})"/>` +
          txt('d', x + w / 2, y + 22, esc(label), ` text-anchor="middle" style="fill:var(${c})"`)
        x += w + 8
      }
      if (view.reentry?.from === 'review') arrows.push({ fromX: x, fromY: y + 18 })
    } else if (reentryHere) {
      g += txt('d', X0, subY, esc(cut(`↩ ${reentryHere.reason}`, textRoom)), ' style="fill:var(--rd)"')
    } else if (p.id === 'gate') {
      const parts: Sub = [{ text: t.gateCommands }]
      if (view.gate) parts.push({ text: ' · ' }, view.gate.pass
        ? { text: t.gatePass(view.gate.round), color: '--ok' }
        : { text: t.gateFail(view.gate.round, view.gate.reason ?? ''), color: '--rd' })
      const plain = parts.map(x => x.text).join('')
      g += txt('d', X0, subY, subSvg(parts, textRoom))
      if (view.reentry?.from === 'gate') arrows.push({ fromX: X0 + Math.min(plain.length, textRoom) * SMALL + 10, fromY: subY - 4 })
    } else if (wait) {
      g += txt('d', X0, subY, esc(t.yourTurn), ' style="fill:var(--br)"')
    } else {
      g += txt('d', X0, subY, subSvg(p.agents.length ? agentSub(p.agents) : [{ text: t.desc[p.id] }], textRoom))
    }
    p.agents.forEach((a, k) => { g += card(a, y + cardsTop + k * CARD_STEP, k, W, t, now) })
    body += `${g}</g>`
  })

  if (view.reentry && arrows[0]) {
    const a = arrows[0]
    const lane = W - 24
    const fromX = Math.min(a.fromX, lane - 24)
    const destY = cyOf(view.reentry.to)
    arrow =
      `<path d="M${Math.round(fromX)} ${a.fromY} L${lane} ${a.fromY} L${lane} ${destY} L${W - 42} ${destY}" fill="none" stroke-width="1.2" stroke-dasharray="6 5" marker-end="url(#arrow)" style="stroke:var(--rd)">` +
      '<animate attributeName="stroke-dashoffset" from="0" to="-22" dur="1s" repeatCount="indefinite"/></path>'
  }
  body += arrow

  const footTop = lastCy + 32
  body += `<line x1="20" y1="${footTop}" x2="${W - 20}" y2="${footTop}" stroke-dasharray="2 4" style="stroke:var(--ln)"/>`
  const lg = legend(t, W, footTop + 18)
  body += lg.svg
  const height = footTop + 18 + (lg.rows - 1) * 18 + 28

  return { source: `${open(W, height, flowAlt(view, t))}${styleBlock(mode)}${MARKER}${body}</svg>`, height }
}

export function flowAlt(view: FlowView, t: Strings): string {
  const active = view.phases.find(p => p.status === 'active' || p.status === 'waiting')
  const agents = view.phases.reduce((s, p) => s + p.agents.length, 0)
  return t.alt(view.featureId, active ? t.short[active.id] : undefined, agents, view.reentry?.reason)
}

// ───────────── Board ─────────────

export function boardSvg(
  summary: BoardSummary, width: number, t: Strings, mode: PaletteMode,
): { source: string; height: number } {
  const W = Math.max(MIN_W, Math.floor(width))
  const B = t.board
  const total = summary.queued.length + summary.open.length + summary.stuck.length + summary.merged.length
  let body = header(t, W, t.paneTitle, `${total}`)
  let y = 96
  const room = Math.floor((W - 40 - 24) / SMALL)

  const section = (label: string, count: number, rows: { left: string; right: string; color?: string }[]) => {
    body += txt('l', 20, y, `${esc(label.toUpperCase())} · ${count}`)
    y += 8
    if (!rows.length) { y += 14; body += txt('d', 32, y, esc(B.none)); y += 14 }
    for (const r of rows) {
      y += 20
      const rightW = r.right.length * SMALL
      body += `<polygon transform="translate(26 ${y - 4})" points="${hexPoints(4)}" fill="none" style="stroke:var(${r.color ?? '--mu'})"/>` +
        txt('m', 38, y, esc(cut(r.left, Math.max(8, Math.floor((W - 20 - 38 - rightW - 12) / CHAR))))) +
        txt('d', W - 20, y, esc(cut(r.right, room)), ` text-anchor="end"${r.color ? ` style="fill:var(${r.color})"` : ''}`)
    }
    y += 22
  }
  const name = (r: BoardRow) => `${r.id} ${r.feature}`.trim()

  section(B.queued, summary.queued.length, summary.queued.map(r => ({ left: name(r), right: '' })))
  section(B.open, summary.open.length, summary.open.map(r => ({ left: name(r), right: [r.pr, r.state || '(?)'].filter(Boolean).join(' · ') })))
  section(B.stuck, summary.stuck.length, summary.stuck.map(s => ({
    left: name(s.row), right: [t.stuckIn(s.row.state), s.reason].filter(Boolean).join(' · '), color: '--rd',
  })))
  section(B.merged, summary.merged.length, summary.merged.map(m => ({ left: name(m.row), right: [m.row.pr, m.at].filter(Boolean).join(' · ') })))

  const height = y + 4
  const alt = `${t.paneTitle}: ${B.queued} ${summary.queued.length}, ${B.open} ${summary.open.length}, ${B.stuck} ${summary.stuck.length}, ${B.merged} ${summary.merged.length}`
  return { source: `${open(W, height, alt)}${styleBlock(mode)}${body}</svg>`, height }
}
