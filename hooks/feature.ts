import type { GateResult, ReviewResult, Verdict } from '../types'

const REASON_MAX = 80

/** Numero di round dal nome file: `gate-r2.md` e `r1-security.md` -> numero dopo `r`. */
function roundOf(name: string, m: RegExpExecArray | null): number | undefined {
  const n = Number(m?.[1])
  return Number.isInteger(n) && n >= 0 && typeof name === 'string' ? n : undefined
}

/**
 * Legge un file di review (`r<N>-<reviewer>.md`, formato di agents/review-code.md).
 * Non lancia mai: nome o frontmatter non validi danno `undefined`.
 */
export function parseReview(fileName: string, text: string): ReviewResult | undefined {
  if (typeof fileName !== 'string' || typeof text !== 'string') return undefined
  const nm = /^r(\d+)-(.+)\.md$/i.exec(fileName.trim())
  const round = roundOf(fileName, nm)
  const reviewer = nm?.[2]
  if (round === undefined || !reviewer) return undefined

  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return undefined
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end < 0) return undefined
  let verdict: Verdict | undefined
  for (const l of lines.slice(1, end)) {
    const m = /^verdict:\s*(PASS|CHANGES)\b/.exec(l.trim())
    if (m) verdict = m[1] as Verdict
  }
  if (!verdict) return undefined

  const result: ReviewResult = { reviewer, round, verdict }
  const reason = blockingReason(lines.slice(end + 1))
  if (reason) result.reason = reason
  return result
}

/** Primo item non vuoto sotto `## Blocking`: se e' `` `path` — problema — fix `` tiene solo il problema. */
function blockingReason(lines: string[]): string | undefined {
  let inBlocking = false
  for (const raw of lines) {
    const line = raw.trim()
    if (/^##\s/.test(line)) {
      if (inBlocking) return undefined
      inBlocking = /^##\s+blocking\b/i.test(line)
      continue
    }
    if (!inBlocking) continue
    const item = /^[-*]\s+(.*)$/.exec(line)?.[1]?.trim()
    if (!item) continue
    const structured = /^`[^`]+`\s+(?:—|-)\s+(.+?)(?:\s+(?:—|-)\s+.*)?$/.exec(item)
    return (structured?.[1] ?? item).trim().slice(0, REASON_MAX)
  }
  return undefined
}

// Il gate e' markdown libero scritto dall'orchestrator (skills/factory/SKILL.md, passi 4 e 4b).
// Euristiche, in ordine:
//  1. testo con `hook` e `fail` (senza distinzione di maiuscole) -> fallito, reason `commit hook`;
//  2. riga che nomina un comando e un exit code (`npm test: exit 1`, `npm test → exit 1`,
//     `npm test failed with exit code 1`) oppure riga di tabella `| npm test | 1 |`:
//     il primo con codice != 0 da' `reason: "<comando>: exit <n>"`;
//  3. nessun exit code trovato: pass solo se il testo non contiene la parola `fail`
//     (altrimenti pass false senza reason).
const EXIT_RE = /^(.*?)[\s:,(→>=-]*\bexit(?:\s+code)?\s*[:=]?\s*(\d+)/i

function commandOf(raw: string): string {
  return raw
    .replace(/^[\s>*#-]+/, '')
    .replace(/[`*]/g, '')
    .replace(/\s+(?:failed|exited|returned|ended)(?:\s+with)?\s*$/i, '')
    .replace(/[\s:,(→>=-]+$/, '')
    .trim()
}

function exitCodes(text: string): { command: string; code: number }[] {
  const found: { command: string; code: number }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('|')) {
      const c = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(x => x.trim().replace(/`/g, ''))
      const codeIdx = c.findIndex((x, i) => i > 0 && /^\d+$/.test(x))
      if (c[0] && codeIdx > 0 && !/^:?-+:?$/.test(c[0])) {
        found.push({ command: c[0], code: Number(c[codeIdx]) })
        continue
      }
    }
    const m = EXIT_RE.exec(line)
    if (m) found.push({ command: commandOf(m[1] ?? ''), code: Number(m[2]) })
  }
  return found
}

/** Legge `gate-r<N>.md`. Non lancia mai; nome non valido -> `undefined`. */
export function parseGate(fileName: string, text: string): GateResult | undefined {
  if (typeof fileName !== 'string' || typeof text !== 'string') return undefined
  const nm = /^gate-r(\d+)\.md$/i.exec(fileName.trim())
  const round = roundOf(fileName, nm)
  if (round === undefined) return undefined

  if (/hook/i.test(text) && /fail/i.test(text)) return { round, pass: false, reason: 'commit hook' }
  const failed = exitCodes(text).find(x => x.code !== 0)
  if (failed) {
    return { round, pass: false, reason: failed.command ? `${failed.command}: exit ${failed.code}` : `exit ${failed.code}` }
  }
  if (/\bfail/i.test(text) && exitCodes(text).length === 0) return { round, pass: false }
  return { round, pass: true }
}
