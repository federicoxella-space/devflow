import type { BoardRow } from '../types'
import type { Strings } from './i18n'

export type Attention = { key: string; text: string }

/** `n`: numero della domanda nella run, così ogni domanda ha la sua notifica */
export const onQuestion = (row: BoardRow, t: Strings, n: number): Attention | undefined => {
  const a = t.attention
  const text =
    row.state === 'interview' ? a.interview(row.id)
    : row.state === 'spec' || row.state === 'spec-review' ? a.spec(row.id)
    : row.state === 'approve' ? a.approve(row.id)
    : undefined
  return text === undefined ? undefined : { key: `${row.id}:${row.state}:q${n}`, text }
}

export const onBoardChange = (
  prev: BoardRow | undefined, next: BoardRow, lastLog: string | undefined, t: Strings,
): Attention | undefined => {
  if (prev?.state === next.state) return undefined
  const key = `${next.id}:${next.state}`
  if (next.state === 'needs-human') return { key, text: t.attention.needsHuman(next.id, lastLog ?? '') }
  if (next.state === 'pr-open') return { key, text: t.attention.prOpen(next.id, next.pr ?? '') }
  return undefined
}

export class Notified {
  private readonly keys = new Set<string>()
  has(key: string): boolean { return this.keys.has(key) }
  add(key: string): void { this.keys.add(key) }
  /** Dimentica le chiavi che iniziano con `prefix` (es. `<id>:` quando la riga cambia stato) */
  forget(prefix: string): void { for (const k of [...this.keys]) if (k.startsWith(prefix)) this.keys.delete(k) }
}
