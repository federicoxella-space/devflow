declare module 'claude-code' {
  interface PluginState {
    devflow: {}
  }
}

export type BoardState = 'queued' | 'interview' | 'spec' | 'spec-review' | 'build' | 'review' | 'approve' | 'pr-open' | 'merged' | 'needs-human' | 'closed'
export type BoardRow = { id: string; feature: string; state: BoardState | string; round: number; branch: string; pr: string }
export type LogLine = { at: string; id: string; text: string }
export type BoardSummary = {
  queued: BoardRow[]
  open: BoardRow[]
  stuck: { row: BoardRow; reason?: string }[]
  merged: { row: BoardRow; at?: string }[]
}
