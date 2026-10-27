// Fallback del pannello per il terminale: stessi dati dell'SVG (FlowView / BoardSummary) come Box e Text nativi.
// Stati con le chiavi del tema (inactive, claude, warning, success, error); modelli con l'esadecimale scuro della famiglia.
import type { EngineInterface } from 'claude-code'

import type { AgentCard, BoardRow, BoardSummary, FlowView, PhaseStatus } from '../types'
import type { Strings } from './i18n'
import { DARK, family, modelVar, shortModel } from './palette'

type Els = Pick<ReturnType<EngineInterface['ui']['resolve']>, 'Box' | 'Text'>

const clock = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

const GLYPH: Record<PhaseStatus, string> = { done: '⬢', active: '⬢', waiting: '◇', todo: '⬡' }
const TONE: Record<PhaseStatus, string> = { done: 'inactive', active: 'claude', waiting: 'warning', todo: 'inactive' }

export const flowTerminal = ({ Box, Text }: Els, view: FlowView, t: Strings, now: number) => {
  const hasPills = view.reviews.length > 0
  return (
    <Box flexDirection="column">
      <Text bold>{`${view.featureId} · ${view.title} · ${view.branch} · R${view.round}/${view.maxRounds} · ⏱ ${clock(view.elapsedMs)}`}</Text>
      {view.phases.map(p => {
        const base = t.phases[p.id]
        const title = p.id === 'build' && view.round > 1 ? t.roundTitle(base, view.round)
          : p.id === 'review' && hasPills ? t.reviewResult(base, view.reviews[0]?.round ?? view.round) : base
        const reentryHere = view.reentry?.to === p.id ? view.reentry : undefined
        return (
          <Box key={p.id} flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text color={TONE[p.status]}>{GLYPH[p.status]}</Text>
              <Text bold={p.status === 'active' || p.status === 'waiting'} dimColor={p.status === 'todo'}>{title}</Text>
              {p.durationMs !== undefined ? <Text dimColor>{clock(p.durationMs)}</Text> : null}
              {p.status === 'waiting' ? <Text color="warning">{t.yourTurn}</Text> : null}
            </Box>
            {reentryHere ? <Text color="error">{`  ↩ ${reentryHere.reason}`}</Text> : null}
            {p.id === 'review' && hasPills ? (
              <Box flexDirection="row" gap={1} paddingLeft={2}>
                {view.reviews.map(r => (
                  <Text key={r.reviewer} color={r.verdict === 'PASS' ? 'success' : 'error'}>{`${r.verdict === 'PASS' ? '✓' : '✕'} ${r.reviewer}`}</Text>
                ))}
              </Box>
            ) : null}
            {p.id === 'gate' && view.gate ? (
              <Text color={view.gate.pass ? 'success' : 'error'}>{`  ${view.gate.pass ? t.gatePass(view.gate.round) : t.gateFail(view.gate.round, view.gate.reason ?? '')}`}</Text>
            ) : null}
            {p.agents.map(a => agentLine({ Text }, a, t, now))}
          </Box>
        )
      })}
    </Box>
  )
}

const agentLine = ({ Text }: Pick<Els, 'Text'>, a: AgentCard, t: Strings, now: number) => {
  const label = a.escalatedFrom ? `${a.type} ← ${a.escalatedFrom}` : a.type
  const activity = a.activity === '@thinking' || a.activity === '@starting' ? t.thinking : a.activity
  return (
    <Text key={a.id} color={DARK[modelVar(family(a.model))]}>
      {`  ${a.description} · ${label} · ${shortModel(a.model)} · ⏱ ${clock((a.endedAt ?? now) - a.startedAt)} · ${activity}`}
    </Text>
  )
}

export const boardTerminal = ({ Box, Text }: Els, summary: BoardSummary, t: Strings) => {
  const B = t.board
  const name = (r: BoardRow) => `${r.id} ${r.feature}`.trim()
  const section = (label: string, rows: { text: string; color?: string }[]) => (
    <Box key={label} flexDirection="column">
      <Text bold>{`${label.toUpperCase()} · ${rows.length}`}</Text>
      {rows.length
        ? rows.map((r, i) => <Text key={String(i)} color={r.color}>{`  ⬡ ${r.text}`}</Text>)
        : <Text dimColor>{`  ${B.none}`}</Text>}
    </Box>
  )
  return (
    <Box flexDirection="column">
      {section(B.queued, summary.queued.map(r => ({ text: name(r) })))}
      {section(B.open, summary.open.map(r => ({ text: [name(r), r.pr, r.state || '(?)'].filter(Boolean).join(' · ') })))}
      {section(B.stuck, summary.stuck.map(s => ({ text: [name(s.row), t.stuckIn(s.row.state), s.reason].filter(Boolean).join(' · '), color: 'error' })))}
      {section(B.merged, summary.merged.map(m => ({ text: [name(m.row), m.row.pr, m.at].filter(Boolean).join(' · ') })))}
    </Box>
  )
}
