import { expect, test } from 'claude-code/testing'

import type { AgentCard, BoardRow, GateResult, ReviewResult, Run } from '../types'
import { deriveView, phaseOfAgent, phaseOfState } from './flow'

const card = (type: string, over: Partial<AgentCard> = {}): AgentCard => ({
  id: `${type}-1`, type, description: 'UserRepo', startedAt: 1000, status: 'running', activity: '', ...over,
})
const builderRunning = card('builder', { id: 'b1', description: 'AuthService' })
const coderRunning = card('coder', { id: 'c1', description: 'UserRepo' })
const approverDone = card('approver', { status: 'done', endedAt: 5000 })
const secChangesR1: ReviewResult = { reviewer: 'security', round: 1, verdict: 'CHANGES', reason: 'SQL injection in UserRepo' }
const codePassR1: ReviewResult = { reviewer: 'code', round: 1, verdict: 'PASS' }

type Sc = {
  state?: string; round?: number; active?: boolean; waiting?: boolean; gateRunning?: boolean
  agents?: AgentCard[]; reviews?: ReviewResult[]; gates?: GateResult[]
  phaseStarted?: Run['phaseStarted']; phaseEnded?: Run['phaseEnded']; now?: number; startedAt?: number
}
const scenario = (o: Sc = {}) => {
  const row: BoardRow = { id: '003-x', feature: 'Password reset', state: o.state ?? 'build', round: o.round ?? 1, branch: 'feature/003-x', pr: '' }
  const run: Run = {
    featureId: row.id, active: o.active ?? true, startedAt: o.startedAt ?? 1000, waiting: o.waiting ?? false,
    gateRunning: o.gateRunning ?? false, phaseStarted: o.phaseStarted ?? {}, phaseEnded: o.phaseEnded ?? {}, questions: 0,
  }
  return { run, row, agents: o.agents ?? [], reviews: o.reviews ?? [], gates: o.gates ?? [], maxRounds: 3, now: o.now ?? 61000 }
}
const st = (o: Sc) => deriveView(scenario(o)).phases.map(p => p.status)

test('build round 2 con rientro da security', () => {
  const v = deriveView(scenario({ state: 'build', round: 2, agents: [builderRunning, coderRunning], reviews: [secChangesR1, codePassR1] }))
  expect(v.phases.map(p => p.status)).toEqual(['done', 'done', 'active', 'todo', 'todo', 'todo', 'todo', 'todo'])
  expect(v.phases[2]?.agents).toHaveLength(2)
  expect(v.reentry).toEqual({ from: 'review', to: 'build', reason: 'security: SQL injection in UserRepo' })
})
test('run non attiva: niente animato', () => {
  const v = deriveView(scenario({ state: 'build', active: false, agents: [builderRunning] }))
  expect(v.phases.some(p => p.status === 'active' || p.status === 'waiting')).toBe(false)
})
test('rule proposals: tocca a te solo con domanda aperta', () => {
  expect(deriveView(scenario({ state: 'approve', agents: [approverDone], waiting: true })).phases[7]?.status).toBe('waiting')
  expect(deriveView(scenario({ state: 'approve', agents: [approverDone], waiting: false })).phases[6]?.status).toBe('done')
})
test('agente fallito non resta nella fase', () => {
  const v = deriveView(scenario({ state: 'build', agents: [{ ...coderRunning, status: 'failed' }] }))
  expect(v.phases[2]?.agents).toHaveLength(0)
})
test('gate in corso senza agenti', () => {
  expect(deriveView(scenario({ state: 'build', gateRunning: true })).phases[3]?.status).toBe('active')
})

test('phaseOfAgent e phaseOfState', () => {
  expect(phaseOfAgent('spec-writer')).toBe('spec')
  expect(phaseOfAgent('coder')).toBe('build')
  expect(phaseOfAgent('builder')).toBe('build')
  expect(phaseOfAgent('committer')).toBe('commit')
  expect(phaseOfAgent('review-security')).toBe('review')
  expect(phaseOfAgent('approver')).toBe('approver')
  expect(phaseOfAgent('Explore')).toBeUndefined()
  expect(phaseOfState('spec-review')).toBe('spec')
  expect(phaseOfState('approve')).toBe('approver')
  expect(phaseOfState('pr-open')).toBe('finish')
  expect(phaseOfState('needs-human')).toBeUndefined()
})
test('run non attiva: fasi prima dello stato done, dallo stato in poi todo', () => {
  expect(st({ state: 'review', active: false })).toEqual(['done', 'done', 'done', 'done', 'done', 'todo', 'todo', 'todo'])
})
test('run non attiva: pr-open e merged tutto done', () => {
  expect(st({ state: 'pr-open', active: false }).every(s => s === 'done')).toBe(true)
  expect(st({ state: 'merged', active: false }).every(s => s === 'done')).toBe(true)
})
test('run non attiva, stato senza fase: todo salvo phaseEnded', () => {
  expect(st({ state: 'needs-human', active: false, phaseEnded: { interview: 5, spec: 6 } }))
    .toEqual(['done', 'done', 'todo', 'todo', 'todo', 'todo', 'todo', 'todo'])
  expect(st({ state: 'queued', active: false })).toEqual(Array(8).fill('todo'))
})
test('approve: approver active mentre il suo agente gira', () => {
  expect(st({ state: 'approve', agents: [card('approver')] })).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'active', 'todo'])
})
test('approve: senza card approver e senza phaseEnded e active', () => {
  expect(st({ state: 'approve' })[6]).toBe('active')
})
test('approve: senza card ma phaseEnded.approver, finish active', () => {
  expect(st({ state: 'approve', phaseEnded: { approver: 9 } })).toEqual(['done', 'done', 'done', 'done', 'done', 'done', 'done', 'active'])
})
test('approve fatto, nessuna domanda: finish active', () => {
  expect(st({ state: 'approve', agents: [approverDone], waiting: false })[7]).toBe('active')
})
test('pr-open attivo: tutto done', () => {
  expect(st({ state: 'pr-open', waiting: true }).every(s => s === 'done')).toBe(true)
})
test('interview e spec-review con waiting: waiting', () => {
  expect(st({ state: 'interview', waiting: true })[0]).toBe('waiting')
  expect(st({ state: 'interview' })[0]).toBe('active')
  expect(st({ state: 'spec-review', waiting: true })[1]).toBe('waiting')
})
test('gate non attivo se gira un agente di fase successiva', () => {
  const s = st({ state: 'review', gateRunning: true, agents: [card('review-code')] })
  expect(s[3]).toBe('done')
  expect(s[5]).toBe('active')
})
test('commit attivo con committer', () => {
  expect(st({ state: 'build', agents: [card('committer')] })[4]).toBe('active')
})
test('fase attiva = agente running piu avanzato', () => {
  expect(st({ state: 'build', agents: [coderRunning, card('review-code')] })[5]).toBe('active')
})
test('reviews e gate: ultimo round <= row.round con dati', () => {
  const r2: ReviewResult = { reviewer: 'code', round: 2, verdict: 'PASS' }
  const v = deriveView(scenario({
    state: 'build', round: 3, reviews: [secChangesR1, codePassR1, r2],
    gates: [{ round: 1, pass: true }, { round: 2, pass: false, reason: 'lint' }, { round: 4, pass: true }],
  }))
  expect(v.reviews).toEqual([r2])
  expect(v.gate).toEqual({ round: 2, pass: false, reason: 'lint' })
  const w = deriveView(scenario({ state: 'build', round: 2, reviews: [secChangesR1, codePassR1] }))
  expect(w.reviews).toEqual([secChangesR1, codePassR1])
  expect(w.gate).toBeUndefined()
})
test('rientro dal gate se nessun CHANGES nel round precedente', () => {
  const v = deriveView(scenario({
    state: 'build', round: 2, agents: [coderRunning], reviews: [codePassR1],
    gates: [{ round: 2, pass: false, reason: 'tests rossi' }],
  }))
  expect(v.reentry).toEqual({ from: 'gate', to: 'build', reason: 'tests rossi' })
  const w = deriveView(scenario({ state: 'build', round: 2, agents: [coderRunning], gates: [{ round: 2, pass: false }] }))
  expect(w.reentry?.reason).toBe('gate')
})
test('niente rientro al round 1, fuori da build o senza esiti negativi', () => {
  expect(deriveView(scenario({ state: 'build', round: 1, reviews: [secChangesR1] })).reentry).toBeUndefined()
  expect(deriveView(scenario({ state: 'review', round: 2, reviews: [secChangesR1], agents: [card('review-code')] })).reentry).toBeUndefined()
  expect(deriveView(scenario({ state: 'build', round: 2, reviews: [codePassR1], gates: [{ round: 2, pass: true }] })).reentry).toBeUndefined()
})
test('elapsedMs dal primo phaseStarted, altrimenti startedAt', () => {
  expect(deriveView(scenario({ now: 61000, startedAt: 1000 })).elapsedMs).toBe(60000)
  expect(deriveView(scenario({ now: 61000, startedAt: 1000, phaseStarted: { build: 31000, interview: 11000 } })).elapsedMs).toBe(50000)
})
test('durationMs solo con inizio e fine', () => {
  const v = deriveView(scenario({ state: 'build', phaseStarted: { interview: 1000, spec: 3000 }, phaseEnded: { interview: 3000 } }))
  expect(v.phases[0]?.durationMs).toBe(2000)
  expect(v.phases[1]?.durationMs).toBeUndefined()
  expect(v.phases[2]?.durationMs).toBeUndefined()
})
test('agenti solo nella fase attiva, solo running', () => {
  const v = deriveView(scenario({ state: 'build', agents: [coderRunning, builderRunning, { ...card('review-code'), status: 'done' }] }))
  expect(v.phases.map(p => p.agents.length)).toEqual([0, 0, 2, 0, 0, 0, 0, 0])
  const inactive = deriveView(scenario({ state: 'build', active: false, agents: [coderRunning] }))
  expect(inactive.phases.every(p => p.agents.length === 0)).toBe(true)
})
test('campi di testata dal board', () => {
  const v = deriveView(scenario({ state: 'build', round: 2 }))
  expect(v).toMatchObject({ featureId: '003-x', title: 'Password reset', branch: 'feature/003-x', round: 2, maxRounds: 3 })
})
test('robusto: stato ignoto, nessun agente, round 0', () => {
  const v = deriveView(scenario({ state: 'boh', round: 0 }))
  expect(v.phases).toHaveLength(8)
  expect(v.phases.every(p => p.status === 'todo')).toBe(true)
  expect(v.reviews).toEqual([])
  expect(v.gate).toBeUndefined()
  expect(v.reentry).toBeUndefined()
})
