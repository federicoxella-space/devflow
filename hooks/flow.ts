import type { AgentCard, BoardRow, FlowView, GateResult, PhaseId, PhaseStatus, ReviewResult, Run } from '../types'

export const PHASES = ['interview', 'spec', 'build', 'gate', 'commit', 'review', 'approver', 'finish'] as const satisfies readonly PhaseId[]

const idx = (id: PhaseId) => PHASES.indexOf(id)

export const phaseOfAgent = (type: string): PhaseId | undefined => {
  const t = type.replace(/^devflow:/, '')
  if (t === 'spec-writer') return 'spec'
  if (t === 'coder' || t === 'builder') return 'build'
  if (t === 'committer') return 'commit'
  if (t.startsWith('review-')) return 'review'
  if (t === 'approver') return 'approver'
  return undefined
}

export const phaseOfState = (state: string): PhaseId | undefined => {
  switch (state) {
    case 'interview': return 'interview'
    case 'spec': case 'spec-review': return 'spec'
    case 'build': return 'build'
    case 'review': return 'review'
    case 'approve': return 'approver'
    case 'pr-open': return 'finish'
    default: return undefined
  }
}

type Input = {
  run: Run; row: BoardRow; agents: AgentCard[]; reviews: ReviewResult[]; gates: GateResult[]; maxRounds: number; now: number
}

const latestReviews = (reviews: ReviewResult[], round: number) => {
  const rounds = reviews.map(r => r.round).filter(r => r <= round)
  if (!rounds.length) return []
  const best = Math.max(...rounds)
  return reviews.filter(r => r.round === best)
}

const latestGate = (gates: GateResult[], round: number) =>
  gates.filter(g => g.round <= round).sort((a, b) => b.round - a.round)[0]

export const deriveView = ({ run, row, agents: allAgents, reviews, gates, maxRounds, now }: Input): FlowView => {
  const agents = allAgents.filter(a => a.startedAt >= run.startedAt)
  const running = agents.filter(a => a.status === 'running')
  const runningIdx = running.map(a => phaseOfAgent(a.type)).filter((p): p is PhaseId => !!p).map(idx)
  const maxRunning = runningIdx.length ? Math.max(...runningIdx) : -1
  const statePhase = phaseOfState(row.state)
  const finished = row.state === 'pr-open' || row.state === 'merged'

  const statuses: PhaseStatus[] = PHASES.map(() => 'todo')
  let activeId: PhaseId | undefined

  if (finished) {
    statuses.fill('done')
  } else if (run.active) {
    if (run.gateRunning && maxRunning <= idx('gate')) activeId = 'gate'
    else if (maxRunning >= 0) activeId = PHASES[maxRunning]
    else activeId = statePhase

    if (activeId === 'approver' && maxRunning < idx('approver')) {
      const approvers = agents.filter(a => phaseOfAgent(a.type) === 'approver')
      const done = approvers.length ? approvers.some(a => a.status === 'done') : run.phaseEnded.approver !== undefined
      if (done) activeId = 'finish'
    }

    if (activeId) {
      const a = idx(activeId)
      const waiting = run.waiting && (activeId === 'interview' || activeId === 'finish' ||
        (activeId === 'spec' && row.state === 'spec-review'))
      PHASES.forEach((_, i) => { statuses[i] = i < a ? 'done' : i === a ? (waiting ? 'waiting' : 'active') : 'todo' })
    }
  } else if (statePhase) {
    const s = idx(statePhase)
    PHASES.forEach((_, i) => { statuses[i] = i < s ? 'done' : 'todo' })
  }
  if (!finished && !activeId && !(statePhase && !run.active)) {
    PHASES.forEach((p, i) => { if (run.phaseEnded[p] !== undefined) statuses[i] = 'done' })
  }

  const shownReviews = latestReviews(reviews, row.round)
  const gate = latestGate(gates, row.round)

  let reentry: FlowView['reentry']
  if (row.round > 1 && activeId === 'build') {
    const cur = gates.find(g => g.round === row.round && !g.pass)
    const bad = reviews.find(r => r.round === row.round - 1 && r.verdict === 'CHANGES')
    if (cur) reentry = { from: 'gate', to: 'build', reason: cur.reason ?? 'gate' }
    else if (bad) reentry = { from: 'review', to: 'build', reason: bad.reason ? `${bad.reviewer}: ${bad.reason}` : bad.reviewer }
  }

  const starts = Object.values(run.phaseStarted).filter((v): v is number => typeof v === 'number')
  const start = starts.length ? Math.min(...starts) : run.startedAt

  return {
    featureId: row.id, title: row.feature, branch: row.branch, round: row.round, maxRounds,
    elapsedMs: Math.max(0, now - start),
    phases: PHASES.map((id, i) => {
      const s = run.phaseStarted[id], e = run.phaseEnded[id]
      const shown = statuses[i] === 'active' || statuses[i] === 'waiting'
      return {
        id, status: statuses[i] ?? 'todo',
        ...(statuses[i] === 'done' && s !== undefined && e !== undefined && e >= s ? { durationMs: e - s } : {}),
        agents: shown ? running.filter(a => phaseOfAgent(a.type) === id) : [],
      }
    }),
    ...(reentry ? { reentry } : {}),
    reviews: shownReviews,
    ...(gate ? { gate } : {}),
  }
}
