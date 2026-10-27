declare module 'claude-code' {
  interface PluginState {
    devflow: { run: Run; agents: Record<string, AgentCard> }
  }
}

export type BoardState = 'queued' | 'interview' | 'spec' | 'spec-review' | 'build' | 'review' | 'approve' | 'pr-open' | 'merged' | 'needs-human' | 'closed'
export type BoardRow = { id: string; feature: string; state: BoardState | string; round: number; branch: string; pr: string }
export type Verdict = 'PASS' | 'CHANGES'
export type ReviewResult = { reviewer: string; round: number; verdict: Verdict; reason?: string }
export type GateResult = { round: number; pass: boolean; reason?: string }
export type LogLine = { at: string; id: string; text: string }
export type BoardSummary = {
  queued: BoardRow[]
  open: BoardRow[]
  stuck: { row: BoardRow; reason?: string }[]
  merged: { row: BoardRow; at?: string }[]
}

export type PhaseId = 'interview' | 'spec' | 'build' | 'gate' | 'commit' | 'review' | 'approver' | 'finish'
export type PhaseStatus = 'done' | 'active' | 'waiting' | 'todo'
export type AgentCard = {
  id: string; type: string; description: string; model?: string; effort?: string
  startedAt: number; endedAt?: number; status: 'running' | 'done' | 'failed'; activity: string; escalatedFrom?: string; task?: string
}
export type Run = {
  featureId?: string; active: boolean; startedAt: number; waiting: boolean; gateRunning: boolean
  phaseStarted: Partial<Record<PhaseId, number>>; phaseEnded: Partial<Record<PhaseId, number>>; questions: number
  /** Domande o attese dell'utente in questa run: numera le notifiche, una per domanda */
  asks?: number
  /** Lavoro della factory (skill, agenti devflow, board, domande, gate) dall'ultima risposta della persona */
  activitySinceAnswer?: boolean
}
export type FlowView = {
  featureId: string; title: string; branch: string; round: number; maxRounds: number; elapsedMs: number
  phases: { id: PhaseId; status: PhaseStatus; durationMs?: number; agents: AgentCard[] }[]
  reentry?: { from: PhaseId; to: PhaseId; reason: string }
  reviews: ReviewResult[]
  gate?: GateResult
  /** Domande dell'intervista fatte finora in questa run */
  questions?: number
  /** Piattaforma di `forge` in config.md (assente → github) */
  forge?: Forge
}
export type Forge = 'github' | 'gitlab' | 'azure' | 'git'
