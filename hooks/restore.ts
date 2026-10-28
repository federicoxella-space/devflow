import type { AgentCard, BoardRow, Run, SessionRecord } from '../types'
import { ACTIVE_STATES } from './board'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const optStr = (v: unknown) => v === undefined || typeof v === 'string'

/** Record di sessione da `$.store`: valori malformati → `undefined`, mai eccezioni */
export const parseSession = (v: unknown): SessionRecord | undefined => {
  if (!isObj(v)) return undefined
  const { featureId, startedAt, asks, questions, lastAsk } = v
  if (typeof featureId !== 'string' || !featureId) return undefined
  if (!isNum(startedAt) || !isNum(asks) || !isNum(questions) || !optStr(lastAsk)) return undefined
  return { featureId, startedAt, asks, questions, ...(typeof lastAsk === 'string' ? { lastAsk } : {}) }
}

/** Card persistite: scarta quelle malformate, valore non valido → `{}` */
export const parseCards = (v: unknown): Record<string, AgentCard> => {
  const out: Record<string, AgentCard> = {}
  if (!isObj(v)) return out
  for (const [key, c] of Object.entries(v)) {
    if (!isObj(c)) continue
    if (typeof c.id !== 'string' || typeof c.type !== 'string' || typeof c.description !== 'string') continue
    if (!isNum(c.startedAt) || typeof c.activity !== 'string') continue
    if (c.status !== 'running' && c.status !== 'done' && c.status !== 'failed') continue
    if (c.endedAt !== undefined && !isNum(c.endedAt)) continue
    if (!optStr(c.model) || !optStr(c.effort) || !optStr(c.escalatedFrom) || !optStr(c.task)) continue
    out[key] = c as unknown as AgentCard
  }
  return out
}

/** Riconcilia le card `running` con gli agenti realmente vivi (`$.agent.list()`) */
export const reconcile = (
  cards: Record<string, AgentCard>,
  list: { id: string; status: string }[],
  now: number,
): Record<string, AgentCard> => {
  const byId = new Map(list.map(a => [a.id, a.status]))
  const out: Record<string, AgentCard> = {}
  for (const [key, c] of Object.entries(cards)) {
    if (c.status !== 'running') { out[key] = c; continue }
    const s = byId.get(c.id)
    if (s === 'running' || s === 'pending' || s === 'waiting') out[key] = c
    else out[key] = { ...c, status: s === 'completed' ? 'done' : 'failed', endedAt: now }
  }
  return out
}

/** Il pane disegna il flusso se la riga legata esiste ed è in lavorazione o la run è attiva */
export const showsFlow = (run: Pick<Run, 'active' | 'featureId'>, row: BoardRow | undefined): boolean =>
  !!row && (run.active || ACTIVE_STATES.has(row.state))
