import type { BoardRow, BoardSummary, LogLine } from '../types'

const LOG_RE = /^-\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s+·\s+(.+?)\s+·\s*(.*)$/
const SEPARATOR_CELL = /^:?-+:?$/
const WAITING = new Set(['queued', 'pr-open', 'merged', 'closed', 'needs-human'])

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
}

/** Legge board.md della factory. Non lancia mai: righe illeggibili vengono saltate. */
export function parseBoard(text: string): { rows: BoardRow[]; log: LogLine[] } {
  const rows: BoardRow[] = []
  const log: LogLine[] = []
  if (typeof text !== 'string') return { rows, log }
  let headerSeen = false
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('|')) {
      const c = cells(line)
      if (c.every(x => SEPARATOR_CELL.test(x))) continue
      const id = c[0] ?? ''
      if (!headerSeen && id.toLowerCase() === 'id') { headerSeen = true; continue }
      if (!id) continue
      const round = Number(c[3])
      rows.push({
        id,
        feature: c[1] ?? '',
        state: c[2] ?? '',
        round: Number.isFinite(round) ? round : 0,
        branch: c[4] ?? '',
        pr: c[5] ?? '',
      })
    } else if (line.startsWith('-')) {
      const m = LOG_RE.exec(line)
      if (m) log.push({ at: m[1] ?? '', id: m[2] ?? '', text: m[3] ?? '' })
    }
  }
  return { rows, log }
}

export function isTerminal(state: string): boolean {
  return state === 'merged' || state === 'closed'
}

export function summarize(board: { rows: BoardRow[]; log: LogLine[] }): BoardSummary {
  const lastLog = (id: string): LogLine | undefined => {
    for (let i = board.log.length - 1; i >= 0; i--) {
      const l = board.log[i]
      if (l && l.id === id) return l
    }
    return undefined
  }
  const queued = board.rows.filter(r => r.state === 'queued').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const open = board.rows.filter(r => r.state === 'pr-open')
  const stuck = board.rows
    .filter(r => r.state === 'needs-human' || !WAITING.has(r.state))
    .map(row => ({ row, reason: lastLog(row.id)?.text }))
  const merged = board.rows
    .filter(r => r.state === 'merged')
    .map(row => ({ row, at: lastLog(row.id)?.at }))
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
    .slice(0, 3)
  return { queued, open, stuck, merged }
}
