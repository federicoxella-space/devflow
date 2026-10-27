import { expect, test } from 'claude-code/testing'

import type { BoardRow } from '../types'
import { Notified, onBoardChange, onQuestion } from './attention'
import { STRINGS } from './i18n'

const row = (state: string, over: Partial<BoardRow> = {}): BoardRow => ({
  id: '003-password-reset', feature: 'password reset', state, round: 0, branch: '', pr: '', ...over,
})

test('spec da approvare', () => {
  expect(onQuestion(row('spec-review'), STRINGS.it, 1)?.text).toBe('003-password-reset: la spec è pronta per l’approvazione')
  expect(onQuestion(row('spec'), STRINGS.it, 1)?.key).toBe('003-password-reset:spec:q1')
  // una domanda nuova nello stesso stato ha una chiave sua
  expect(onQuestion(row('spec'), STRINGS.it, 2)?.key).toBe('003-password-reset:spec:q2')
})
test('needs-human e pr-open solo al cambio di stato', () => {
  expect(onBoardChange(row('build'), row('needs-human'), 'gate keeps failing', STRINGS.it)?.text).toBe('003-password-reset: serve il tuo intervento — gate keeps failing')
  expect(onBoardChange(row('pr-open'), row('pr-open'), undefined, STRINGS.it)).toBeUndefined()
  expect(onBoardChange(undefined, row('pr-open', { pr: '#42' }), undefined, STRINGS.en)?.text.includes('#42')).toBe(true)
  expect(onBoardChange(row('build'), row('pr-open'), undefined, STRINGS.it)?.key).toBe('003-password-reset:pr-open')
  expect(onBoardChange(row('build'), row('review'), undefined, STRINGS.it)).toBeUndefined()
})
test('domanda fuori dagli stati con attesa', () => {
  expect(onQuestion(row('build'), STRINGS.it, 1)).toBeUndefined()
  expect(onQuestion(row('interview'), STRINGS.en, 3)?.key).toBe('003-password-reset:interview:q3')
  expect(onQuestion(row('approve'), STRINGS.en, 1)?.text.includes('rule proposals')).toBe(true)
})
test('Notified ricorda le chiavi', () => {
  const n = new Notified()
  expect(n.has('a')).toBe(false)
  n.add('a')
  expect(n.has('a')).toBe(true)
})

test('Notified dimentica per prefisso', () => {
  const n = new Notified()
  n.add('003-a:needs-human')
  n.add('003-a:spec-review:q')
  n.add('003-ab:pr-open')
  n.forget('003-a:')
  expect(n.has('003-a:needs-human')).toBe(false)
  expect(n.has('003-a:spec-review:q')).toBe(false)
  expect(n.has('003-ab:pr-open')).toBe(true)
})
