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
const stubEngine = (on: On, { files, bash }: { files: Record<string, string>; bash?: (command: string) => Promise<void> }) => {
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
    if (e.tool === 'Bash' && bash) await bash(e.command)
    return { result: {} }
  })
  let n = 0
  on('agent.spawn', (_, e) => ({ model: e.model ?? 'sonnet', agentId: `a${++n}` }))
  on('turn.complete', () => ({ text: '' }))
  return { calls, clock }
}

const spawn = (description: string, subagentType: string, model = 'sonnet', prompt = 'p') => ({
  tool_use_id: `tu-${description}`, prompt, description, subagentType, model,
  provider: { plugin: 'engine', tier: 'core' as const }, parentModel: 'opus', background: false, fork: false,
})
/** Props dell'Svg disegnato, come stringhe */
const svgOf = (el: { props: Record<string, unknown> } | undefined) =>
  el && { alt: String(el.props.alt), source: String(el.props.source), isInteractive: el.props.isInteractive }

/** Turno principale finito normalmente */
const endTurn = (turnId: string, answer = 'ok') => ({ reason: 'answer' as const, answer, durationMs: 10, isAborted: false, turnId })
const animated = async ($: Parameters<TestBody>[0]) => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const source = svgOf(await ui.find({ type: 'Svg' }))?.source ?? ''
  await ui.unmount()
  return source.includes('<animate')
}

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

test('init a metà sessione: la Write di config.md attiva la mod', async ($, on) => {
  const files: Record<string, string> = { 'factory/board.md': BOARD_BUILD }
  const { calls } = stubEngine(on, { files })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(calls.commands).toEqual([])
  // /devflow:init scrive config.md: il file esiste quando la Write ha finito
  files['factory/config.md'] = CONFIG
  await $.tool.call({ tool: 'Write', file_path: 'F:/repo/factory/config.md', content: CONFIG })
  expect(calls.commands).toEqual(['devflow-panel'])
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  expect(calls.opened).toEqual(['devflow-flow'])
  await $.agent.spawn(spawn('Test di regressione', 'devflow:coder'))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = svgOf(await ui.find({ type: 'Svg' }))
  expect(svg?.alt.includes('Test di regressione')).toBe(true)
  expect(svg?.alt.includes('003-reset')).toBe(true)
  expect(svg?.source.includes('R1/3')).toBe(true)
  await ui.unmount()
})

test('config.md creato tra session.start e la Skill: la Skill attiva la mod', async ($, on) => {
  const files: Record<string, string> = { 'factory/board.md': BOARD_BUILD }
  const { calls } = stubEngine(on, { files })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(calls.commands).toEqual([])
  files['factory/config.md'] = CONFIG
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  expect(calls.commands).toEqual(['devflow-panel'])
  expect(calls.opened).toEqual(['devflow-flow'])
  await $.agent.spawn(spawn('Test di regressione', 'devflow:coder'))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const svg = svgOf(await ui.find({ type: 'Svg' }))
  expect(svg?.alt.includes('Test di regressione')).toBe(true)
  await ui.unmount()
})

test('config.md riscritto con la mod attiva: rilegge max_rounds, comando registrato una volta', async ($, on) => {
  const files: Record<string, string> = { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD }
  const { calls } = stubEngine(on, { files })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  files['factory/config.md'] = CONFIG.replace('max_rounds: 3', 'max_rounds: 5')
  await $.tool.call({ tool: 'Write', file_path: 'factory/config.md', content: CONFIG })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  await $.agent.spawn(spawn('Test di regressione', 'devflow:coder'))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(svgOf(await ui.find({ type: 'Svg' }))?.source.includes('R1/5')).toBe(true)
  await ui.unmount()
  expect(calls.commands).toEqual(['devflow-panel'])
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

test('domande in spec-review: una notifica per domanda, non per evento ripetuto', async ($, on) => {
  const { calls } = stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': board('spec-review') } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  const ask = (tool_use_id: string) => ({
    tool: 'AskUserQuestion' as const, tool_use_id,
    questions: [{ question: 'Approvi la spec?', header: 'Spec', multiSelect: false, options: [{ label: 'Sì', description: '' }, { label: 'No', description: '' }] }],
  })
  const text = '003-reset: the spec is ready for approval'
  // la stessa chiamata rielaborata: una notifica sola
  await $.tool.call(ask('q-1'))
  await $.tool.call(ask('q-1'))
  expect(calls.toasts).toEqual([text])
  // una seconda domanda nello stesso stato: notifica anche lei
  await $.tool.call(ask('q-2'))
  expect(calls.toasts).toEqual([text, text])
  expect(calls.notifies).toEqual([{ text, title: 'devflow · 003-reset' }, { text, title: 'devflow · 003-reset' }])
})

test('intervista in testo semplice: il turno finisce ma la run resta in attesa', async ($, on) => {
  const files: Record<string, string> = { 'factory/config.md': CONFIG, 'factory/board.md': board('interview', '', ['queued → interview']) }
  const { calls, clock } = stubEngine(on, { files })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({ text: '/devflow:factory', wait: false, origin: { kind: 'composer' } })
  // la domanda è nel testo della risposta: il turno principale finisce normalmente
  await $.turn.complete({ reason: 'answer', answer: 'Quale provider email?', durationMs: 10, isAborted: false, turnId: 't1' })
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  let svg = svgOf(await ui.find({ type: 'Svg' }))
  expect(svg?.alt.includes('interview phase')).toBe(true)
  expect(svg?.source.includes('fill:var(--br)">your turn<')).toBe(true)
  expect(svg?.source.includes('<animate')).toBe(true)
  await ui.unmount()
  expect(calls.toasts).toEqual(['003-reset: the interview has a question for you'])
  const before = calls.invalidations
  await clock.advance(2000)
  expect(calls.invalidations > before).toBe(true)

  // la risposta dell'utente è un prompt qualsiasi: tocca di nuovo alla factory
  await $.prompt.submit({ text: 'SendGrid', wait: false, origin: { kind: 'composer' } })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  svg = svgOf(await ui.find({ type: 'Svg' }))
  expect(svg?.alt.includes('interview phase')).toBe(true)
  expect(svg?.source.includes('fill:var(--br)">your turn<')).toBe(false)
  await ui.unmount()

  // fine intervista: il board passa a spec e parte lo spec-writer
  files['factory/board.md'] = board('spec', '', ['queued → interview', 'interview → spec'])
  await $.tool.call({ tool: 'Edit', file_path: 'factory/board.md', old_string: 'interview', new_string: 'spec' })
  await $.agent.spawn(spawn('Scrive la spec', 'devflow:spec-writer'))
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  svg = svgOf(await ui.find({ type: 'Svg' }))
  expect(svg?.alt.includes('spec phase')).toBe(true)
  expect(svg?.alt.includes('spec-writer Scrive la spec')).toBe(true)
  await ui.unmount()
  expect(calls.toasts.length).toBe(1)

  // la spec ha una domanda in testo semplice: seconda notifica
  await $.turn.complete({ reason: 'answer', answer: 'Includo il rate limit?', durationMs: 10, isAborted: false, turnId: 't2' })
  expect(calls.toasts).toEqual(['003-reset: the interview has a question for you', '003-reset: the spec is ready for approval'])
  // la factory resta attiva in attesa della persona
  expect(await animated($)).toBe(true)
})

test('seconda domanda in testo semplice: seconda notifica; Esc chiude la run', async ($, on) => {
  const { calls } = stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': board('interview') } })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  await $.turn.complete({ reason: 'answer', answer: 'Domanda 1?', durationMs: 10, isAborted: false, turnId: 't1' })
  await $.prompt.submit({ text: 'risposta', wait: false, origin: { kind: 'composer' } })
  // la factory annota la risposta nel playbook della feature (SKILL.md §0), poi fa la domanda successiva
  await $.tool.call({ tool: 'Write', file_path: 'F:\\repo\\factory\\features\\003-reset\\playbook.md', content: '- provider: SendGrid' })
  await $.turn.complete({ reason: 'answer', answer: 'Domanda 2?', durationMs: 10, isAborted: false, turnId: 't2' })
  expect(calls.toasts.length).toBe(2)
  // Esc durante l'attesa: la run finisce
  await $.turn.complete({ reason: 'aborted', answer: '', durationMs: 10, isAborted: true, turnId: 't3' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(svgOf(await ui.find({ type: 'Svg' }))?.source.includes('<animate')).toBe(false)
  await ui.unmount()
})

test('intervista abbandonata: un prompt d altro chiude la run, niente notifiche a ogni turno', async ($, on) => {
  const { calls, clock } = stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': board('interview') } })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  await $.turn.complete(endTurn('t1', 'Quale provider email?'))
  expect(calls.toasts.length).toBe(1)
  // la persona chiede altro: il turno non fa nulla per la factory
  await $.prompt.submit({ text: 'come si rinomina un branch?', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete(endTurn('t2', 'git branch -m'))
  expect(calls.toasts.length).toBe(1)
  expect(calls.notifies.length).toBe(1)
  expect(await animated($)).toBe(false)
  const before = calls.invalidations
  await clock.advance(3000)
  expect(calls.invalidations).toBe(before)
  // un altro turno: ancora niente
  await $.prompt.submit({ text: 'e uno remoto?', wait: false, origin: { kind: 'composer' } })
  await $.turn.complete(endTurn('t3', 'git push origin :old new'))
  expect(calls.toasts.length).toBe(1)
  expect(calls.notifies.length).toBe(1)
})

test('prompt non della persona: l attesa resta, nessuna nuova notifica', async ($, on) => {
  const { calls } = stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': board('interview') } })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  await $.turn.complete(endTurn('t1', 'Quale provider email?'))
  await $.prompt.submit({ text: 'task finito', wait: false, origin: { kind: 'task-notification' } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(svgOf(await ui.find({ type: 'Svg' }))?.source.includes('fill:var(--br)">your turn<')).toBe(true)
  await ui.unmount()
  await $.turn.complete(endTurn('t2', 'preso nota'))
  expect(calls.toasts.length).toBe(1)
  expect(calls.notifies.length).toBe(1)
  // la factory aspetta ancora la persona
  expect(await animated($)).toBe(true)
})

test('/devflow-panel non è la risposta della persona: l attesa resta', async ($, on) => {
  const { calls } = stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': board('interview') } })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  await $.turn.complete(endTurn('t1', 'Quale provider email?'))
  await $.prompt.submit({ text: '/devflow-panel', wait: false, origin: { kind: 'composer' } })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(svgOf(await ui.find({ type: 'Svg' }))?.source.includes('fill:var(--br)">your turn<')).toBe(true)
  await ui.unmount()
  expect(calls.toasts.length).toBe(1)
})

test('fine turno principale in build: la run finisce', async ($, on) => {
  const { calls } = stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  await $.turn.complete({ reason: 'answer', answer: 'fatto', durationMs: 10, isAborted: false, turnId: 't1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(svgOf(await ui.find({ type: 'Svg' }))?.source.includes('stuck in build')).toBe(true)
  await ui.unmount()
  expect(calls.toasts).toEqual([])
})

test('board scritto durante la factory: needs-human notificato col motivo dal log', async ($, on) => {
  const files: Record<string, string> = { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD }
  const { calls } = stubEngine(on, { files })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  files['factory/board.md'] = board('needs-human', '', ['spec-review → build', 'needs-human: gate keeps failing'])
  await $.tool.call({ tool: 'Edit', file_path: 'F:\\repo\\factory\\board.md', old_string: 'a', new_string: 'b' })
  expect(calls.toasts).toEqual(['003-reset: needs you — gate keeps failing'])
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

test('escalation riconosciuta dal task id del prompt, anche con descrizioni diverse', async ($, on) => {
  stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  const coder = await $.agent.spawn(spawn('Parser CSV', 'devflow:coder', 'haiku', 'Feature dir: factory/features/003-reset\nSpec: spec.md\nTask id: T2\nparallel: false'))
  await $.turn.complete({ reason: 'answer', answer: 'ESCALATE', durationMs: 10, isAborted: false, turnId: 't2', agentId: coder.agentId })
  await $.agent.spawn(spawn('Parser CSV robusto', 'devflow:builder', 'opus', 'Feature dir: factory/features/003-reset\nTask id: T2\nCoder reply: ESCALATE'))
  // stessa descrizione ma task diverso: nessuna escalation
  await $.agent.spawn(spawn('Parser CSV', 'devflow:builder', 'opus', 'Task id: T3'))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const source = svgOf(await ui.find({ type: 'Svg' }))?.source ?? ''
  expect(source.split('builder ← coder').length - 1).toBe(1)
  expect(/Parser CSV robusto<\/text><text class="d"[^>]*>builder ← coder/.test(source)).toBe(true)
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
  await $.prompt.submit({ text: '/devflow:factory', wait: false, origin: { kind: 'composer' } })
  expect(calls.opened).toEqual(['devflow-flow'])
  await $.agent.spawn(spawn('Test di regressione', 'devflow:coder'))
  // il comando del gate accende la fase gate finché gira
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(during.includes('gate phase')).toBe(true)
})

test('needs-human due volte nella stessa sessione: due notifiche', async ($, on) => {
  const files: Record<string, string> = { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD }
  const { calls } = stubEngine(on, { files })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  const write = async (text: string) => {
    files['factory/board.md'] = text
    await $.tool.call({ tool: 'Write', file_path: 'factory/board.md', content: text })
  }
  await write(board('needs-human', '', ['needs-human: gate keeps failing']))
  await write(board('build', '', ['needs-human → build']))
  await write(board('needs-human', '', ['needs-human: still red']))
  expect(calls.toasts).toEqual(['003-reset: needs you — gate keeps failing', '003-reset: needs you — still red'])
})

test('comandi del gate reali: pipe e catene; npm install no', async ($, on) => {
  const seen: Record<string, string> = {}
  const { calls } = stubEngine(on, {
    files: { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD },
    bash: async command => {
      const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
      seen[command] = svgOf(await ui.find({ type: 'Svg' }))?.alt ?? ''
      await ui.unmount()
    },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  for (const command of ['npm test 2>&1 | tail -60', 'npm run build && npm run lint && npm test', 'npm install']) {
    await $.tool.call({ tool: 'Bash', command })
  }
  expect(seen['npm test 2>&1 | tail -60']?.includes('gate phase')).toBe(true)
  expect(seen['npm run build && npm run lint && npm test']?.includes('gate phase')).toBe(true)
  expect(seen['npm install']?.includes('build phase')).toBe(true)
  expect(calls.toasts).toEqual([])
})

test('cambio del board durante il gate non spegne gateRunning', async ($, on) => {
  const files: Record<string, string> = { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD }
  let during = ''
  stubEngine(on, {
    files,
    bash: async () => {
      // l'orchestratore scrive il board mentre il comando del gate gira
      files['factory/board.md'] = board('build', '', ['round 2'])
      files['factory/board.md'] = files['factory/board.md'].replace('| build | 1 |', '| review | 1 |')
      await $.tool.call({ tool: 'Edit', file_path: 'factory/board.md', old_string: 'build', new_string: 'review' })
      const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
      during = svgOf(await ui.find({ type: 'Svg' }))?.alt ?? ''
      await ui.unmount()
    },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  expect(during.includes('gate phase')).toBe(true)
  // a gate finito resta la fase dello stato del board
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(svgOf(await ui.find({ type: 'Svg' }))?.alt.includes('review phase')).toBe(true)
  await ui.unmount()
})

test('terminale: righe di fase, card dell agente e rientro come Text', async ($, on) => {
  const round2 = BOARD_BUILD.replace('| build | 1 |', '| build | 2 |')
  const review = '---\nverdict: CHANGES\n---\n## Blocking\n- `a.ts` — SQL injection — use params\n'
  stubEngine(on, {
    files: { 'factory/config.md': CONFIG, 'factory/board.md': round2, 'factory/features/003-reset/reviews/r1-security.md': review },
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  await $.agent.spawn(spawn('Test di regressione', 'devflow:coder'))
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /Test di regressione/ }))?.text).toMatch(/coder · sonnet/)
  expect(await ui.find({ type: 'Text', text: /Build/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /↩ security/ })).toBeDefined()
  await ui.unmount()
})

test('terminale: niente factory, riepilogo del board con riga in coda', async ($, on) => {
  const queued = BOARD_BUILD.replace('| build | 1 |', '| queued | 0 |')
  stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': queued } })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /QUEUED · 1/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /003-reset/ })).toBeDefined()
  await ui.unmount()
})

test('forge di config.md nel testo della fase finale', async ($, on) => {
  stubEngine(on, { files: { 'factory/config.md': CONFIG.replace('max_rounds', 'forge: git\nmax_rounds'), 'factory/board.md': BOARD_BUILD } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(svgOf(await ui.find({ type: 'Svg' }))?.source.includes('then push the branch')).toBe(true)
  await ui.unmount()
})

test('attività della card dal turn.step dell agente, nessun hook sul tool Agent', async ($, on) => {
  stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': BOARD_BUILD } })
  on('turn.step', async function* (_, e) {
    return {
      turnId: e.turnId, index: 0, answer: '', stopReason: 'tool_use',
      toolUses: [{ name: 'Edit', input: { file_path: 'src/repo/UserRepo.ts' } }],
    } as never
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  const coder = await $.agent.spawn(spawn('Test di regressione', 'devflow:coder'))
  const step = $.turn.step({ turnId: 't9', index: 0, model: 'claude-sonnet-5-5', effort: 'medium', agentId: coder.agentId } as never)
  for await (const _ of step) { /* consuma lo stream */ }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const source = svgOf(await ui.find({ type: 'Svg' }))?.source ?? ''
  expect(source.includes('Edit repo/UserRepo.ts')).toBe(true)
  expect(source.includes('sonnet 5.5 · medium')).toBe(true)
  await ui.unmount()
})

test('factory ripresa dopo Esc: la prima domanda della nuova run notifica', async ($, on) => {
  const { calls } = stubEngine(on, { files: { 'factory/config.md': CONFIG, 'factory/board.md': board('interview') } })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  await $.turn.complete({ reason: 'answer', answer: 'Domanda 1?', durationMs: 10, isAborted: false, turnId: 't1' })
  await $.turn.complete({ reason: 'aborted', answer: '', durationMs: 10, isAborted: true, turnId: 't2' })
  await $.tool.call({ tool: 'Skill', skill: 'devflow:factory' })
  await $.turn.complete({ reason: 'answer', answer: 'Domanda 2?', durationMs: 10, isAborted: false, turnId: 't3' })
  expect(calls.toasts.length).toBe(2)
})
