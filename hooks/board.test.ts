import { expect, test } from 'claude-code/testing'

import { bindFeature, featureOfArg, isTerminal, parseBoard, soleActive, summarize } from './board'

const BOARD = `# Factory board

| id | feature | state | round | branch | PR |
|----|---------|-------|-------|--------|----|
| 003-password-reset | Password reset via email | review | 1 | feature/003-password-reset | |

## Log
- 2026-10-20 14:02 · 003-password-reset · build → review
`

const MIXED = `# Factory board

| id | feature | state | round | branch | PR |
|----|---------|-------|-------|--------|----|
| 006-b | Second | queued | 0 | | |
| 005-a | First | queued | 0 | | |
| 004-pr | Open PR | pr-open | 1 | feature/004-pr | #12 |
| 003-nh | Stuck human | needs-human | 3 | feature/003-nh | |
| 002-bd | Idle build | build | 1 | feature/002-bd | |
| 001-m1 | Merged one | merged | 1 | feature/001-m1 | #1 |
| 007-m2 | Merged two | merged | 1 | feature/007-m2 | #2 |
| 008-m3 | Merged three | merged | 1 | feature/008-m3 | #3 |
| 009-m4 | Merged four | merged | 1 | feature/009-m4 | #4 |
| 010-x | Weird | boh | 1 | | |

## Log
- 2026-10-01 09:00 · 001-m1 · pr-open → merged
- 2026-10-02 09:00 · 007-m2 · pr-open → merged
- 2026-10-03 09:00 · 008-m3 · pr-open → merged
- 2026-10-04 09:00 · 009-m4 · pr-open → merged
- 2026-10-05 10:00 · 003-nh · review → needs-human
- 2026-10-06 11:30 · 003-nh · needs-human: gate keeps failing
- 2026-10-06 12:00 · 002-bd · spec-review → build
`

test('riga e log del formato della factory', () => {
  const b = parseBoard(BOARD)
  expect(b.rows[0]).toEqual({ id: '003-password-reset', feature: 'Password reset via email', state: 'review', round: 1, branch: 'feature/003-password-reset', pr: '' })
  expect(b.log[0]).toEqual({ at: '2026-10-20 14:02', id: '003-password-reset', text: 'build → review' })
})
test('board malformato non lancia', () => {
  expect(parseBoard('').rows).toEqual([])
  expect(parseBoard('| id |\n|--|\n| x | y |').rows[0]?.round).toBe(0)
  expect(parseBoard('| id | feature |\n|--|--|\n| | |\n| a | b | c | d | e | f | g |\n- garbage\n- 2026 · x').rows.map(r => r.id)).toEqual(['a'])
  expect(parseBoard(undefined as unknown as string)).toEqual({ rows: [], log: [] })
})
test('riepilogo', () => {
  const s = summarize(parseBoard(MIXED))
  expect(s.queued.map(r => r.id)).toEqual(['005-a', '006-b'])
  expect(s.open.map(r => r.id)).toEqual(['004-pr'])
  expect(s.stuck.map(x => x.row.state)).toEqual(['needs-human', 'build', 'boh'])
  expect(s.stuck[0]?.reason).toBe('needs-human: gate keeps failing')
  expect(s.stuck[1]?.reason).toBe('spec-review → build')
  expect(s.stuck[2]?.reason).toBe(undefined)
  expect(s.merged).toHaveLength(3)
  expect(s.merged.map(m => m.row.id)).toEqual(['009-m4', '008-m3', '007-m2'])
  expect(s.merged[0]?.at).toBe('2026-10-04 09:00')
})
test('stati terminali', () => {
  expect(isTerminal('merged')).toBe(true)
  expect(isTerminal('closed')).toBe(true)
  expect(isTerminal('build')).toBe(false)
})

const row = (id: string, state: string) => ({ id, feature: id, state, round: 0, branch: '', pr: '' })
const ROWS = [row('001-a', 'merged'), row('002-b', 'build'), row('003-c', 'review'), row('004-d', 'queued')]

test('featureOfArg: id completo o NNN, altrimenti undefined', () => {
  expect(featureOfArg('002-b', ROWS)).toBe('002-b')
  expect(featureOfArg(' 003 ', ROWS)).toBe('003-c')
  expect(featureOfArg('009', ROWS)).toBe(undefined)
  expect(featureOfArg('009-x', ROWS)).toBe(undefined)
  expect(featureOfArg('add a login page', ROWS)).toBe(undefined)
  expect(featureOfArg('', ROWS)).toBe(undefined)
  expect(featureOfArg(undefined, ROWS)).toBe(undefined)
})
test('soleActive: solo con esattamente una riga attiva', () => {
  expect(soleActive(ROWS)).toBe(undefined)
  expect(soleActive([row('001-a', 'merged'), row('002-b', 'build'), row('004-d', 'queued')])).toBe('002-b')
  expect(soleActive([row('001-a', 'merged')])).toBe(undefined)
  expect(soleActive([])).toBe(undefined)
})
test('bindFeature: la sola riga cambiata, o quella nominata nell input', () => {
  expect(bindFeature([row('002-b', 'review')], 'qualsiasi')).toBe('002-b')
  const two = [row('002-b', 'review'), row('003-c', 'build')]
  expect(bindFeature(two, 'sed -i s/x/y/ factory/features/003-c/spec.md')).toBe('003-c')
  expect(bindFeature(two, 'niente id')).toBe(undefined)
  expect(bindFeature(two, '002-b e 003-c')).toBe(undefined)
  expect(bindFeature(two, undefined)).toBe(undefined)
  expect(bindFeature([], '002-b')).toBe(undefined)
})
