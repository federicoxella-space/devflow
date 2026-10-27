import { expect, test } from 'claude-code/testing'

import { DARK, family, LIGHT, shortModel, styleBlock } from './palette'

test('famiglia dal modello', () => {
  expect(family('claude-opus-5-5')).toBe('opus')
  expect(family('global.anthropic.claude-sonnet-5-5')).toBe('sonnet')
  expect(family('claude-mythos-5-1')).toBe('mythos')
  expect(family('gpt-5')).toBe('other')
  expect(family(undefined)).toBe('other')
})
test('tinte distinte per famiglia', () => {
  expect(DARK.op).toBe('#A78BFA'); expect(DARK.so).toBe('#34D399'); expect(DARK.my).toBe('#22D3EE')
  expect(LIGHT.op).toBe('#7C3AED'); expect(LIGHT.ok).toBe('#4D7C0F')
})
test('auto porta la media query, dark e light no', () => {
  expect(styleBlock('auto').includes('prefers-color-scheme:light')).toBe(true)
  expect(styleBlock('dark').includes('prefers-color-scheme')).toBe(false)
  expect(styleBlock('light').includes('--op:#7C3AED')).toBe(true)
})
test('nome breve', () => { expect(shortModel('claude-haiku-5-5')).toBe('haiku 5.5') })
