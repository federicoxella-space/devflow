import { expect, test } from 'claude-code/testing'

import type { AgentCard, BoardRow } from '../types'
import { parseCards, parseSession, reconcile, showsFlow } from './restore'

const card = (id: string, status: AgentCard['status']): AgentCard => ({
  id, type: 'devflow:implementer', description: 'd', startedAt: 1, status, activity: '',
})
const row = (state: string): BoardRow => ({ id: 'f', feature: 'F', state, round: 0, branch: '', pr: '' })

test('reconcile: running resta running se l\'agente è vivo', () => {
  for (const status of ['running', 'pending', 'waiting']) {
    expect(reconcile({ a: card('a', 'running') }, [{ id: 'a', status }], 9).a).toEqual(card('a', 'running'))
  }
})

test('reconcile: completed → done, altri stati o assente → failed con endedAt', () => {
  expect(reconcile({ a: card('a', 'running') }, [{ id: 'a', status: 'completed' }], 9).a).toEqual({ ...card('a', 'done'), endedAt: 9 })
  for (const status of ['idle', 'failed', 'killed']) {
    expect(reconcile({ a: card('a', 'running') }, [{ id: 'a', status }], 9).a).toEqual({ ...card('a', 'failed'), endedAt: 9 })
  }
  expect(reconcile({ a: card('a', 'running') }, [], 9).a).toEqual({ ...card('a', 'failed'), endedAt: 9 })
})

test('reconcile: card non running invariate', () => {
  const cards = { a: card('a', 'done'), b: card('b', 'failed') }
  expect(reconcile(cards, [], 9)).toEqual(cards)
})

test('parseSession: valido e malformato', () => {
  const ok = { featureId: 'f', startedAt: 1, asks: 2, questions: 3, lastAsk: 'x' }
  expect(parseSession(ok)).toEqual(ok)
  expect(parseSession({ featureId: 'f', startedAt: 1, asks: 2, questions: 3 })).toEqual({ featureId: 'f', startedAt: 1, asks: 2, questions: 3 })
  for (const bad of [undefined, null, 'x', 4, [], {}, { ...ok, startedAt: '1' }, { ...ok, featureId: '' }, { ...ok, lastAsk: 5 }]) {
    expect(parseSession(bad)).toBeUndefined()
  }
})

test('parseCards: scarta le card malformate, mai eccezioni', () => {
  const good = card('a', 'running')
  expect(parseCards({ a: good, b: { id: 1 }, c: null, d: { ...good, status: 'boh' } })).toEqual({ a: good })
  for (const bad of [undefined, null, 'x', 4, []]) expect(parseCards(bad)).toEqual({})
})

test('showsFlow: riga assente → riepilogo; attiva o run attiva → flusso', () => {
  expect(showsFlow({ active: true, featureId: 'f' }, undefined)).toBe(false)
  expect(showsFlow({ active: false, featureId: 'f' }, row('spec'))).toBe(true)
  expect(showsFlow({ active: false, featureId: 'f' }, row('needs-human'))).toBe(false)
  expect(showsFlow({ active: true, featureId: 'f' }, row('pr-open'))).toBe(true)
})
