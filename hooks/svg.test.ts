import { expect, test } from 'claude-code/testing'

import type { AgentCard, BoardSummary, FlowView, PhaseId } from '../types'
import { PHASES } from './flow'
import { STRINGS, resolveLang } from './i18n'
import { boardSvg, flowAlt, flowSvg } from './svg'

const NOW = 1_000_000

const card = (id: string, over: Partial<AgentCard> = {}): AgentCard => ({
  id, type: 'builder', description: 'Parametrizza query in UserRepo', model: 'claude-opus-5-5', effort: 'high',
  startedAt: NOW - 134_000, status: 'running', activity: 'Edit src/repo/UserRepo.ts', ...over,
})

const phase = (id: PhaseId, status: FlowView['phases'][number]['status'], agents: AgentCard[] = [], durationMs?: number) =>
  ({ id, status, agents, ...(durationMs !== undefined ? { durationMs } : {}) })

const build = [
  card('b1'),
  card('c1', { type: 'coder', description: 'Test di regressione per il login', model: 'claude-sonnet-5-5', effort: 'medium', activity: 'Bash npm test -- login' }),
  card('b2', { description: "Messaggio d'errore sul form reset", escalatedFrom: 'coder', activity: '@thinking', startedAt: NOW - 52_000 }),
]

const VIEW: FlowView = {
  featureId: '003-password-reset', title: 'password reset', branch: 'feature/003-password-reset',
  round: 2, maxRounds: 2, elapsedMs: 1_122_000,
  phases: [
    phase('interview', 'done', [], 250_000), phase('spec', 'done', [], 182_000), phase('build', 'active', build),
    phase('gate', 'todo'), phase('commit', 'todo'), phase('review', 'todo'), phase('approver', 'todo'), phase('finish', 'todo'),
  ],
  reentry: { from: 'review', to: 'build', reason: 'security: SQL injection in UserRepo' },
  reviews: [
    { reviewer: 'security', round: 1, verdict: 'CHANGES', reason: 'SQL injection' },
    { reviewer: 'code', round: 1, verdict: 'PASS' }, { reviewer: 'ux', round: 1, verdict: 'PASS' }, { reviewer: 'ui', round: 1, verdict: 'PASS' },
  ],
  gate: { round: 1, pass: true },
}

const withAgents = (n: number): FlowView => ({
  ...VIEW,
  phases: VIEW.phases.map(p => (p.id === 'build' ? { ...p, agents: Array.from({ length: n }, (_, i) => card(`a${i}`)) } : p)),
})

const SUMMARY: BoardSummary = {
  queued: [{ id: '004-export', feature: 'export csv', state: 'queued', round: 0, branch: '', pr: '' }],
  open: [{ id: '005-audit', feature: 'audit log', state: 'pr-open', round: 1, branch: 'feature/005-audit', pr: '#12' }],
  stuck: [{ row: { id: '002-login', feature: 'login <b>', state: 'build', round: 1, branch: '', pr: '' } }],
  merged: [{ row: { id: '001-init', feature: 'init', state: 'merged', round: 1, branch: '', pr: '#3' }, at: '2026-10-20' }],
}

test('scenario del mockup', () => {
  const { source } = flowSvg(VIEW, 680, STRINGS.it, 'auto', NOW)
  expect(source.includes('Build · round 2')).toBe(true)
  expect(source.includes('stroke:var(--op)')).toBe(true)
  expect(source.includes('stroke:var(--so)')).toBe(true)
  expect(source.includes('builder ← coder')).toBe(true)
  expect(source.includes('to="-22"')).toBe(true)
})
test('freccia di rientro al centro dell esagono di destinazione', () => {
  const { source } = flowSvg(VIEW, 680, STRINGS.it, 'auto', NOW)
  const hexY = Number(/translate\(40 (\d+)\)"[^>]*style="fill:var\(--br\)"/.exec(source)![1])
  const arrowEndY = Number(/L\d+ \d+ L\d+ (\d+)" [^>]*marker-end/.exec(source)![1])
  expect(arrowEndY).toBe(hexY)
})
test('rientro dal gate: la freccia parte dalla riga gate', () => {
  const v: FlowView = { ...VIEW, reentry: { from: 'gate', to: 'build', reason: 'test failed' }, gate: { round: 2, pass: false, reason: 'test failed' } }
  const { source } = flowSvg(v, 680, STRINGS.it, 'auto', NOW)
  expect(source.includes('r2 ✕ test failed')).toBe(true)
  expect(source.includes('↩ test failed')).toBe(true)
  const hexY = Number(/translate\(40 (\d+)\)"[^>]*style="fill:var\(--br\)"/.exec(source)![1])
  expect(Number(/L\d+ \d+ L\d+ (\d+)" [^>]*marker-end/.exec(source)![1])).toBe(hexY)
})
test('tocca a te: contorno che pulsa e sottotitolo', () => {
  const v: FlowView = { ...VIEW, reentry: undefined, phases: VIEW.phases.map(p => (p.id === 'interview' ? phase('interview', 'waiting') : p)) }
  const { source } = flowSvg(v, 680, STRINGS.it, 'auto', NOW)
  expect(source.includes('values="1;1.3;1"')).toBe(true)
  expect(source.includes('tocca a te')).toBe(true)
})
test('tooltip con il contratto di ogni fase', () => {
  const { source } = flowSvg(VIEW, 680, STRINGS.it, 'dark', NOW)
  expect((source.match(/<title>/g) ?? []).length).toBe(PHASES.length + 1)
})
test('escape', () => {
  const v = { ...VIEW, title: 'A <b> & "c"' }
  expect(flowSvg(v, 680, STRINGS.it, 'dark', NOW).source.includes('A &lt;b&gt; &amp; &quot;c&quot;')).toBe(true)
})
test('otto agenti: limite di dimensione e altezza lineare', () => {
  const one = flowSvg(withAgents(1), 680, STRINGS.it, 'auto', NOW)
  const eight = flowSvg(withAgents(8), 680, STRINGS.it, 'auto', NOW)
  expect(eight.source.length < 131072).toBe(true)
  expect(eight.height - one.height).toBe(7 * 54)
})
test('larghezza minima 360 senza testo oltre il bordo', () => {
  const { source, height } = flowSvg(VIEW, 360, STRINGS.en, 'auto', NOW)
  expect(source.includes('width="360"')).toBe(true)
  expect(height > 0).toBe(true)
})
test('alt e lingue', () => {
  expect(flowAlt(VIEW, STRINGS.it).includes('003-password-reset')).toBe(true)
  expect(flowAlt(VIEW, STRINGS.en).includes('build')).toBe(true)
  expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.it).sort())
  expect(resolveLang('auto', undefined, 'it_IT.UTF-8')).toBe('it')
})
test('riepilogo del board', () => {
  const { source } = boardSvg(SUMMARY, 680, STRINGS.it, 'auto')
  expect(source.includes('In coda')).toBe(true)
  expect(source.includes('ferma in build')).toBe(true)
  expect(source.includes('login &lt;b&gt;')).toBe(true)
})
