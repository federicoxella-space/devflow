// Testi del pannello in italiano e inglese. Una lingua nuova = una tabella con le stesse chiavi (lo verifica il test).
import type { Forge, PhaseId } from '../types'

export type Lang = 'it' | 'en'

/** Nome della piattaforma di `forge` (config.md) */
export const FORGE_NAME: Record<Forge, string> = { github: 'GitHub', gitlab: 'GitLab', azure: 'Azure DevOps', git: 'git' }

/** `forge` di config.md: assente o ignoto → github */
export const parseForge = (value: unknown): Forge => {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return v === 'gitlab' || v === 'azure' || v === 'git' ? v : 'github'
}

const enFinish = (forge: Forge) => `you decide · ${forge === 'git' ? 'then push the branch' : `then PR on ${FORGE_NAME[forge]}`}`
const itFinish = (forge: Forge) => `qui tocca a te · ${forge === 'git' ? 'poi push del branch' : `poi PR su ${FORGE_NAME[forge]}`}`

const en = {
  paneTitle: 'devflow',
  commandDescription: 'Open or close the devflow flow pane',
  commandOpened: 'devflow pane opened.',
  commandClosed: 'devflow pane closed.',
  phases: {
    interview: 'Interview', spec: 'Spec', build: 'Build', gate: 'Gate', commit: 'Commit',
    review: 'Review', approver: 'Approver', finish: 'Rule proposals and pull request',
  } as Record<PhaseId, string>,
  short: {
    interview: 'interview', spec: 'spec', build: 'build', gate: 'gate', commit: 'commit',
    review: 'review', approver: 'approver', finish: 'pr',
  } as Record<PhaseId, string>,
  desc: {
    interview: 'orchestrator · questions', spec: 'spec-writer · writes the spec', build: 'coder · builder',
    gate: 'orchestrator', commit: 'committer · Conventional Commits', review: 'reviewers · PASS or CHANGES',
    approver: 'verifies the evidence', finish: enFinish('github'),
  } as Record<PhaseId, string>,
  questionsDesc: (n: number) => `orchestrator · ${n} ${n === 1 ? 'question' : 'questions'}`,
  finishDesc: enFinish,
  featureCount: (n: number) => `${n} ${n === 1 ? 'feature' : 'features'}`,
  thinking: 'Thinking…',
  yourTurn: 'your turn',
  metricPhase: 'PHASE',
  metricAgents: 'AGENTS',
  metricRound: 'ROUND',
  metricTime: 'TIME',
  agentsActive: (n: number) => `${n} active`,
  allDone: 'DONE',
  roundTitle: (title: string, round: number) => `${title} · round ${round}`,
  reviewResult: (title: string, round: number) => `${title} · result r${round}`,
  gateCommands: 'build · lint · test',
  gatePass: (round: number) => `r${round} pass`,
  gateFail: (round: number, reason: string) => `r${round} ✕ ${reason}`,
  board: {
    queued: 'Queued', open: 'Open PRs', stuck: 'Stuck', merged: 'Recently merged', none: 'none',
  },
  stuckIn: (state: string) => `stuck in ${state || '(?)'}`,
  legend: {
    done: 'done', active: 'active', waiting: 'your turn', todo: 'to do', pass: 'pass', reentry: 'reentry', models: 'models',
  },
  alt: (id: string, phase: string | undefined, agents: number, reentry: string | undefined) =>
    `devflow panel, ${id}: ${phase ? `${phase} phase` : 'no active phase'}, ${agents} ${agents === 1 ? 'agent' : 'agents'}` +
    (reentry ? `, back to build after ${reentry}` : ''),
  attention: {
    interview: (id: string) => `${id}: the interview has a question for you`,
    spec: (id: string) => `${id}: the spec is ready for approval`,
    approve: (id: string) => `${id}: rule proposals to review`,
    needsHuman: (id: string, why: string) => `${id}: needs you${why ? ` — ${why}` : ''}`,
    prOpen: (id: string, pr: string) => `${id}: PR open${pr ? ` ${pr}` : ''}, waiting for review`,
  },
}

export type Strings = typeof en

const it: Strings = {
  paneTitle: 'devflow',
  commandDescription: 'Apre o chiude il pannello del flusso devflow',
  commandOpened: 'Pannello devflow aperto.',
  commandClosed: 'Pannello devflow chiuso.',
  phases: {
    interview: 'Intervista', spec: 'Spec', build: 'Build', gate: 'Gate', commit: 'Commit',
    review: 'Review', approver: 'Approver', finish: 'Rule proposals e pull request',
  },
  short: {
    interview: 'intervista', spec: 'spec', build: 'build', gate: 'gate', commit: 'commit',
    review: 'review', approver: 'approver', finish: 'pr',
  },
  desc: {
    interview: 'orchestratore · domande', spec: 'spec-writer · scrive la spec', build: 'coder · builder',
    gate: 'orchestratore', commit: 'committer · Conventional Commits', review: 'reviewer · PASS o CHANGES',
    approver: 'verifica le prove', finish: itFinish('github'),
  },
  questionsDesc: (n: number) => `orchestratore · ${n} ${n === 1 ? 'domanda' : 'domande'}`,
  finishDesc: itFinish,
  featureCount: (n: number) => `${n} feature`,
  thinking: 'Sta ragionando…',
  yourTurn: 'tocca a te',
  metricPhase: 'FASE',
  metricAgents: 'AGENTI',
  metricRound: 'ROUND',
  metricTime: 'TEMPO',
  agentsActive: (n: number) => `${n} ${n === 1 ? 'attivo' : 'attivi'}`,
  allDone: 'FATTO',
  roundTitle: (title: string, round: number) => `${title} · round ${round}`,
  reviewResult: (title: string, round: number) => `${title} · esito r${round}`,
  gateCommands: 'build · lint · test',
  gatePass: (round: number) => `r${round} pass`,
  gateFail: (round: number, reason: string) => `r${round} ✕ ${reason}`,
  board: {
    queued: 'In coda', open: 'PR aperte', stuck: 'Ferme', merged: 'Merge recenti', none: 'nessuna',
  },
  stuckIn: (state: string) => `ferma in ${state || '(?)'}`,
  legend: {
    done: 'fatto', active: 'in corso', waiting: 'tocca a te', todo: 'da fare', pass: 'pass', reentry: 'rientro', models: 'modelli',
  },
  alt: (id: string, phase: string | undefined, agents: number, reentry: string | undefined) =>
    `Pannello devflow, ${id}: ${phase ? `fase ${phase}` : 'nessuna fase attiva'}, ${agents} ${agents === 1 ? 'agente' : 'agenti'}` +
    (reentry ? `, rientro in build dopo ${reentry}` : ''),
  attention: {
    interview: (id: string) => `${id}: l’intervista ha una domanda per te`,
    spec: (id: string) => `${id}: la spec è pronta per l’approvazione`,
    approve: (id: string) => `${id}: rule proposals da rivedere`,
    needsHuman: (id: string, why: string) => `${id}: serve il tuo intervento${why ? ` — ${why}` : ''}`,
    prOpen: (id: string, pr: string) => `${id}: PR aperta${pr ? ` ${pr}` : ''}, in attesa di review`,
  },
}

export const STRINGS: Record<Lang, Strings> = { en, it }

/** "italian", "Italiano", "it", "it_IT.UTF-8", "en-US" → it | en; altro → undefined */
export const parseLang = (value: unknown): Lang | undefined => {
  if (typeof value !== 'string') return undefined
  const v = value.trim().toLowerCase()
  if (/^(it|ita)([_\-.@].*)?$/.test(v) || v.startsWith('italian')) return 'it'
  if (/^(en|eng)([_\-.@].*)?$/.test(v) || v.startsWith('english') || v.startsWith('inglese')) return 'en'
  return undefined
}

/** Priorità: opzione della mod (se non "auto") → `language` di Claude Code → LANG/LC_ALL → inglese */
export const resolveLang = (option: unknown, ccLanguage: unknown, ...envLangs: unknown[]): Lang =>
  (option !== 'auto' ? parseLang(option) : undefined) ??
  parseLang(ccLanguage) ??
  envLangs.map(parseLang).find(l => l !== undefined) ??
  'en'
