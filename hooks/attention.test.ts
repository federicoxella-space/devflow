import { expect, test } from 'claude-code/testing'

import type { BoardRow } from '../types'
import { Notified, onBoardChange, onQuestion } from './attention'
import { STRINGS } from './i18n'

const row = (state: string, over: Partial<BoardRow> = {}): BoardRow => ({
  id: '003-password-reset', feature: 'password reset', state, round: 0, branch: '', pr: '', ...over,
})

test('spec da approvare', () => {
  expect(onQuestion(row('spec-review'), STRINGS.it)?.text).toBe('003-password-reset: la spec è pronta per l’approvazione')
  expect(onQuestion(row('spec'), STRINGS.it)?.key).toBe('003-password-reset:spec:q')
})
test('needs-human e pr-open solo al cambio di stato', () => {
  expect(onBoardChange(row('build'), row('needs-human'), 'needs-human: gate keeps failing', STRINGS.it)?.text.includes('gate keeps failing')).toBe(true)
  expect(onBoardChange(row('pr-open'), row('pr-open'), undefined, STRINGS.it)).toBeUndefined()
  expect(onBoardChange(undefined, row('pr-open', { pr: '#42' }), undefined, STRINGS.en)?.text.includes('#42')).toBe(true)
  expect(onBoardChange(row('build'), row('pr-open'), undefined, STRINGS.it)?.key).toBe('003-password-reset:pr-open')
  expect(onBoardChange(row('build'), row('review'), undefined, STRINGS.it)).toBeUndefined()
})
test('domanda fuori dagli stati con attesa', () => {
  expect(onQuestion(row('build'), STRINGS.it)).toBeUndefined()
  expect(onQuestion(row('interview'), STRINGS.en)?.key).toBe('003-password-reset:interview:q')
  expect(onQuestion(row('approve'), STRINGS.en)?.text.includes('rule proposals')).toBe(true)
})
test('Notified ricorda le chiavi', () => {
  const n = new Notified()
  expect(n.has('a')).toBe(false)
  n.add('a')
  expect(n.has('a')).toBe(true)
})
