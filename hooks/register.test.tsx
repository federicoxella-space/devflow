import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

const PANE = {
  plugin: 'devflow',
  component: 'Pane',
  requestId: 'devflow-flow',
  props: {
    title: 'devflow',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const CONFIG = `---
base_branch: main
build: npm run build
lint: npm run lint
test: npm test
max_rounds: 3          # rework rounds
---
Notes.
`

const board = (state: string, pr = '', log: string[] = []) => `# Factory board

| id | feature | state | round | branch | PR |
|----|---------|-------|-------|--------|----|
| 003-reset | Reset password | ${state} | 1 | feat/003-reset | ${pr} |
| 001-old | Old thing | merged | 1 | feat/001-old | #7 |

## Log
${log.map(l => `- 2026-10-27 10:00 · 003-reset · ${l}`).join('\n')}
`
const BOARD_BUILD = board('build', '', ['spec-review → build'])

type Calls = { toasts: string[]; notifies: { text: string; title?: string }[]; opened: string[]; commands: string[]; invalidations: number }

/** Sta al posto del motore: file in memoria, store, clock, UI registrata */
const stubEngine = (on: On, { files, bash }: { files: Record<string, string>; bash?: () => Promise<void> }) => {
  const calls: Calls = { toasts: [], notifies: [], opened: [], commands: [], invalidations: 0 }
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  mock.env(on, {})
  // il motore passa i path già risolti sulla cartella di lavoro: si confronta da `factory/` in poi
  const norm = (p: string) => {
    const s = p.replace(/\\/g, '/')
    const i = s.indexOf('factory/')
    return i < 0 ? s : s.slice(i)
  }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('settings.read', () => ({ value: {} }))
  on('config.list', () => ({ value: [] }))
  on('fs.exists', (_, e) => ({ value: norm(e.path) in files }))
  on('fs.read', (_, e) => {
    const text = files[norm(e.path)]
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('fs.list', (_, e) => {
    const dir = norm(e.path ?? '').replace(/\/$/, '') + '/'
    const names = Object.keys(files).filter(f => f.startsWith(dir)).map(f => f.slice(dir.length))
    if (!names.length) throw new Error(`ENOENT ${e.path}`)
    const top = [...new Set(names.map(n => n.split('/')[0] ?? ''))]
    return { value: top.map(name => ({ name, kind: names.includes(name) ? 'file' : 'dir', size: 1, mtimeMs: 0, isLink: false })) }
  })
  on('command.register', (_, e) => { calls.commands.push(e.name); return { value: { command: e.name } } })
  on('ui.open', (_, e) => { calls.opened.push(e.id); return { value: { isPlaced: true } } })
  on('ui.toast', (_, e) => { calls.toasts.push(e.text); return { value: undefined } })
  on('ui.notify', (_, e) => { calls.notifies.push({ text: e.text, title: e.title }); return { value: { isSent: true, channel: 'iterm2' } } })
  on('ui.invalidate', () => { calls.invalidations++; return { value: undefined } })
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', async (_, e) => {
    if (e.tool === 'Bash' && bash) await bash()
    return { result: {} }
  })
  let n = 0
  on('agent.spawn', (_, e) => ({ model: e.model ?? 'sonnet', agentId: `a${++n}` }))
  on('turn.complete', () => ({ text: '' }))
  return { calls, clock }
}

const spawn = (description: string, subagentType: string, model = 'sonnet') => ({
  tool_use_id: `tu-${description}`, prompt: 'p', description, subagentType, model,
  provider: { plugin: 'engine', tier: 'core' as const }, parentModel: 'opus', background: false, fork: false,
})
/** Props dell'Svg disegnato, come stringhe */
const svgOf = (el: { props: Record<string, unknown> } | undefined) =>
  el && { alt: String(el.props.alt), source: String(el.props.source), isInteractive: el.props.isInteractive }

const start = ($: Parameters<Parameters<typeof test>[1] & (($: never, on: never) => unknown)>[0]) => $

test('card di un coder durante la factory', async ($, on) => {
  const { calls } = stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  expect(calls.opened).toEqual(['devflow-flow'])
  await $.agent.spawn(spawn('Test di regressione', 'devflow:coder'))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = svgOf(await ui.find({ type: 'Svg' }))
  expect(svg?.alt.includes('Test di regressione')).toBe(true)
  expect(svg?.alt.includes('003-reset')).toBe(true)
  expect(svg?.isInteractive).toBe(true)
  expect(svg?.source.includes('Test di regressione')).toBe(true)
  // max_rounds dal frontmatter di config.md
  expect(svg?.source.includes('R1/3')).toBe(true)
  await ui.unmount()
})

test('niente factory: riepilogo del board', async ($, on) => {
  const { calls } = stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(calls.commands).toEqual(['devflow-panel'])
  // un agente devflow senza /devflow:factory non anima nulla
  await $.agent.spawn(spawn('Test di regressione', 'devflow:coder'))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = svgOf(await ui.find({ type: 'Svg' }))
  expect(svg?.alt).toBe('devflow: Queued 0, Open PRs 0, Stuck 1, Recently merged 1')
  expect(svg?.source.includes('stuck in build')).toBe(true)
  expect(calls.opened).toEqual([])
  await ui.unmount()
})

test('repo senza devflow: nessun pane, nessun comando', async ($, on) => {
  const { calls } = stubEngine(on, { files: { 'factory/board.md': BOARD_BUILD } })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  await $.agent.spawn(spawn('Test di regressione', 'devflow:coder'))
  expect(calls.commands).toEqual([])
  expect(calls.opened).toEqual([])
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('Esc a metà: fine turno principale ferma l animazione', async ($, on) => {
  const { calls, clock } = stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  await $.agent.spawn(spawn('Test di regressione', 'devflow:coder'))
  // mentre la factory gira con un agente vivo, il pannello si ridisegna ogni secondo
  const before = calls.invalidations
  await clock.advance(3000)
  expect(calls.invalidations - before >= 3).toBe(true)

  await $.turn.complete({ reason: 'aborted', answer: '', durationMs: 10, isAborted: true, turnId: 't1' })
  const after = calls.invalidations
  await clock.advance(3000)
  expect(calls.invalidations).toBe(after)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = svgOf(await ui.find({ type: 'Svg' }))
  // niente diagramma animato: il board la mostra ferma in build
  expect(svg?.alt.includes('Test di regressione')).toBe(false)
  expect(svg?.source.includes('stuck in build')).toBe(true)
  expect(svg?.source.includes('<animate')).toBe(false)
  await ui.unmount()
})

test('domanda in spec-review: toast e notify una volta', async ($, on) => {
  const { calls } = stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': board('spec-review') } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  const ask = {
    tool: 'AskUserQuestion' as const,
    questions: [{ question: 'Approvi la spec?', header: 'Spec', multiSelect: false, options: [{ label: 'Sì', description: '' }, { label: 'No', description: '' }] }],
  }
  await $.tool.call(ask)
  await $.tool.call(ask)
  expect(calls.toasts).toEqual(['003-reset: the spec is ready for approval'])
  expect(calls.notifies).toEqual([{ text: '003-reset: the spec is ready for approval', title: 'devflow · 003-reset' }])
})

test('board scritto durante la factory: needs-human notificato col motivo dal log', async ($, on) => {
  const files: Record<string, string> = { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD }
  const { calls } = stubEngine(on, { files })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  files['factory/board.md'] = board('needs-human', '', ['spec-review → build', 'needs-human: gate keeps failing'])
  await $.tool.call({ tool: 'Edit', file_path: 'F:\\repo\\factory\\board.md', old_string: 'a', new_string: 'b' })
  expect(calls.toasts).toEqual(['003-reset: needs you - gate keeps failing'])
  // stesso stato riscritto: nessuna seconda notifica
  await $.tool.call({ tool: 'Write', file_path: 'factory/board.md', content: files['factory/board.md'] ?? '' })
  expect(calls.toasts.length).toBe(1)
})

test('escalation: builder dopo un coder sullo stesso task', async ($, on) => {
  stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  const coder = await $.agent.spawn(spawn('Task parser', 'devflow:coder', 'haiku'))
  await $.turn.complete({ reason: 'answer', answer: 'ESCALATE', durationMs: 10, isAborted: false, turnId: 't2', agentId: coder.agentId })
  await $.agent.spawn(spawn('Task parser', 'devflow:builder', 'opus'))
  await $.agent.spawn(spawn('Altro task', 'devflow:builder', 'opus'))
  // un agente non devflow non ha card
  await $.agent.spawn(spawn('Cerca file', 'Explore', 'haiku'))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = svgOf(await ui.find({ type: 'Svg' }))
  expect(svg?.source.includes('builder ← coder')).toBe(true)
  expect(svg?.alt.includes('Cerca file')).toBe(false)
  expect(svg?.alt.includes('2 agents')).toBe(true)
  await ui.unmount()
})

test('/devflow:factory scritto dall utente avvia la run', async ($, on) => {
  let during = ''
  const { calls } = stubEngine(on, {
    files: { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD },
    bash: async () => {
      const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
      during = svgOf(await ui.find({ type: 'Svg' }))?.alt ?? ''
      await ui.unmount()
    },
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: '/devflow:factory', wait: false, origin: { kind: 'user' } } as never)
  expect(calls.opened).toEqual(['devflow-flow'])
  await $.agent.spawn(spawn('Test di regressione', 'devflow:coder'))
  // il comando del gate accende la fase gate finché gira
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(during.includes('gate phase')).toBe(true)
})
