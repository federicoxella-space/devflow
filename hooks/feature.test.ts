import { expect, test } from 'claude-code/testing'

import { changeStart, parseGate, parseReview } from './feature'

const REVIEW_CHANGES = `---
verdict: CHANGES        # CHANGES if and only if Blocking is not empty
---

## Blocking
- \`src/repo/UserRepo.ts:42\` — SQL injection in UserRepo — use parameterized queries
- \`src/api/login.ts:10\` — missing rate limit — add a limiter

## Non-blocking
- \`src/a.ts:1\` — naming — rename

## Checklist
- [x] input validated

## Rule proposals
- none
`

const REVIEW_PASS = `---
verdict: PASS        # CHANGES if and only if Blocking is not empty
---

## Blocking

## Non-blocking
- \`src/a.ts:1\` — naming — rename

## Checklist
- [x] ok

## Rule proposals
`

const GATE_FAIL = `# Gate round 2

- npm run lint: exit 0
- npm test: exit 1

Last lines of output:
\`\`\`
FAIL src/user.test.ts
  expected 1, received 2
\`\`\`
`

const GATE_OK = `# Gate round 1

- npm run lint: exit 0
- npm test: exit 0

003-password-reset ok

Commits:
- abc1234 feat: reset password

PR title: feat: password reset
`

test('review CHANGES con motivo', () => {
  expect(parseReview('r1-security.md', REVIEW_CHANGES)).toEqual({ reviewer: 'security', round: 1, verdict: 'CHANGES', reason: 'SQL injection in UserRepo' })
})
test('review PASS', () => {
  expect(parseReview('r2-code.md', REVIEW_PASS)).toEqual({ reviewer: 'code', round: 2, verdict: 'PASS' })
})
test('nome o frontmatter non validi', () => {
  expect(parseReview('notes.md', REVIEW_PASS)).toBeUndefined()
  expect(parseReview('r1-ux.md', 'no frontmatter')).toBeUndefined()
  expect(parseReview('r1-ux.md', '---\nverdict: MAYBE\n---\n')).toBeUndefined()
})
test('review: motivo senza formato path/fix, troncato a 80', () => {
  const long = 'x'.repeat(120)
  const t = `---\nverdict: CHANGES\n---\n## Blocking\n\n- ${long}\n`
  expect(parseReview('r1-code.md', t)?.reason).toBe('x'.repeat(80))
  const plain = '---\nverdict: CHANGES\n---\n## Blocking\n- plain problem\n## Non-blocking\n'
  expect(parseReview('r1-code.md', plain)?.reason).toBe('plain problem')
  const dash = '---\nverdict: CHANGES\n---\n## Blocking\n- `a.ts:1` - bad thing - fix it\n'
  expect(parseReview('r1-code.md', dash)?.reason).toBe('bad thing')
})
test('review: input non valido non lancia', () => {
  expect(parseReview('r1-code.md', undefined as unknown as string)).toBeUndefined()
})
test('gate', () => {
  expect(parseGate('gate-r2.md', GATE_FAIL)).toEqual({ round: 2, pass: false, reason: 'npm test: exit 1' })
  expect(parseGate('gate-r1.md', GATE_OK)?.pass).toBe(true)
})
test('gate: forme alternative di exit code', () => {
  expect(parseGate('gate-r1.md', 'npm test → exit 1')).toEqual({ round: 1, pass: false, reason: 'npm test: exit 1' })
  expect(parseGate('gate-r1.md', '| command | exit code |\n|---|---|\n| npm run lint | 0 |\n| npm test | 2 |\n')).toEqual({ round: 1, pass: false, reason: 'npm test: exit 2' })
  expect(parseGate('gate-r1.md', '`npm test` failed with exit code 3')?.reason).toBe('npm test: exit 3')
})
test('gate: commit hook', () => {
  expect(parseGate('gate-r3.md', 'npm test: exit 0\nCommit hook failed:\nlint-staged error')).toEqual({ round: 3, pass: false, reason: 'commit hook' })
})
test('gate: pass realistico con menzione di hook', () => {
  const t = `# Gate round 1

- npm run lint: exit 0
- npm test: exit 0

Output: 3 passed, 0 failed

003-password-reset ok

Commits:
- abc1234 fix: pre-commit hook config

PR title: fix: pre-commit hook config
`
  expect(parseGate('gate-r1.md', t)).toEqual({ round: 1, pass: true })
})
test('gate: testo non riconosciuto', () => {
  expect(parseGate('gate-r1.md', 'all good')).toEqual({ round: 1, pass: true })
  expect(parseGate('gate-r1.md', 'something failed')).toEqual({ round: 1, pass: false })
})
test('gate: nome non valido', () => {
  expect(parseGate('gate.md', GATE_OK)).toBeUndefined()
  expect(parseGate('gate-r1.md', undefined as unknown as string)).toBeUndefined()
})

const playbook = (...changes: string[]) => ['# P', '', '## Changes', ...changes, '', '## Done checklist', '- Change 9 — z — from round 9 — in progress'].join('\n')
test('changeStart: round della change in progress', () => {
  expect(changeStart(playbook('- Change 1 — x — from round 4 — in progress'))).toBe(4)
})
test('changeStart: vince il numero di change piu alto', () => {
  expect(changeStart(playbook('- Change 2 — y — from round 7 — in progress', '- Change 1 — x — from round 4 — in progress'))).toBe(7)
})
test('changeStart: testo con from round, vale l ultima occorrenza', () => {
  expect(changeStart(playbook('- Change 1 — redo from round 2 — from round 5 — in progress'))).toBe(5)
})
test('changeStart: default 1', () => {
  expect(changeStart(undefined)).toBe(1)
  expect(changeStart('')).toBe(1)
  expect(changeStart('# P\n- Change 1 — x — from round 4 — in progress')).toBe(1)
  expect(changeStart(playbook('- Change 1 — x — from round 4 — rejected'))).toBe(1)
  expect(changeStart(playbook('- Change 1 — x — from round abc — in progress'))).toBe(1)
  expect(changeStart(playbook('- Change 1 — x — from round 0 — in progress'))).toBe(1)
  expect(changeStart(playbook('Change 1 from round 4 in progress'))).toBe(1)
})
