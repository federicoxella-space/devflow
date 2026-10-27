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
  contracts: {
    interview: 'Interview (orchestrator): reads feature.md, playbook, codebase. Asks until every criterion can be written without guessing; the human chooses integrate or defer for new logic.',
    spec: 'spec-writer: reads both playbooks and the codebase, writes spec.md and the done checklist. Decides kind, tasks with owned files and complexity, reviewers list.',
    build: 'coder / builder: reads spec.md, one task, reviews. Writes code and tests for owned files (no commits). The coder sends ESCALATE to the builder if the task is not simple.',
    gate: 'Gate (orchestrator): reads the commands in config.md, writes gate-rN.md. Decides by exit codes.',
    commit: 'committer: reads working tree, Tasks, commit rules. Writes Conventional Commits on the feature branch, one per task. A failing hook stops it.',
    review: 'reviewers: read diff, spec.md, playbooks. Write reviews/rN-<name>.md with a checklist table. Verdict PASS or CHANGES (CHANGES only for blocking items).',
    approver: 'approver: reads everything above, writes decision.md. Every checklist item has evidence: APPROVE, otherwise ESCALATE.',
    finish: 'Rule proposals (orchestrator + human): proposals from all agents, written to factory/playbook.md on the feature branch. The human approves, edits or discards each one.',
  } as Record<PhaseId, string>,
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
  contracts: {
    interview: 'Intervista (orchestratore): legge feature.md, il playbook e la codebase. Chiede finché ogni criterio si può scrivere senza indovinare; l\'utente sceglie se integrare o rimandare la logica nuova.',
    spec: 'spec-writer: legge i due playbook e la codebase, scrive spec.md e la checklist di fine lavori. Decide kind, task con file assegnati e complessità, elenco dei reviewer.',
    build: 'coder / builder: legge spec.md, il proprio task e le review. Scrive codice e test per i file assegnati (niente commit). Se il task non è semplice, il coder risponde ESCALATE e lo passa al builder.',
    gate: 'Gate (orchestratore): legge i comandi di config.md, scrive gate-rN.md. Decide in base agli exit code.',
    commit: 'committer: legge il working tree, la sezione Tasks e le regole di commit. Scrive i Conventional Commits sul branch della feature, uno per task. Si ferma se un hook fallisce.',
    review: 'reviewer: leggono il diff, spec.md e i playbook. Scrivono reviews/rN-<nome>.md con la tabella della checklist. Verdetto PASS o CHANGES (CHANGES solo per punti bloccanti).',
    approver: 'approver: legge tutto ciò che precede, scrive decision.md. Se ogni voce della checklist ha una prova: APPROVE, altrimenti ESCALATE.',
    finish: 'Rule proposals (orchestratore + utente): proposte di tutti gli agenti, scritte in factory/playbook.md sul branch della feature. L\'utente approva, modifica o scarta ciascuna.',
  },
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
