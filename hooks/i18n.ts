// Testi del pannello in italiano e inglese. Una lingua nuova = una tabella con le stesse chiavi (lo verifica il test).
import type { PhaseId } from '../types'

export type Lang = 'it' | 'en'

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
    approver: 'verifies the evidence', finish: 'you decide · then PR on github',
  } as Record<PhaseId, string>,
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
    needsHuman: (id: string, why: string) => `${id}: needs you${why ? ` - ${why}` : ''}`,
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
    approver: 'verifica le evidenze', finish: 'qui tocca a te · poi PR su github',
  },
  contracts: {
    interview: 'Intervista (orchestratore): legge feature.md, playbook, codebase. Chiede finché ogni criterio si può scrivere senza indovinare; l\'umano sceglie se integrare o rimandare la logica nuova.',
    spec: 'spec-writer: legge i due playbook e la codebase, scrive spec.md e la checklist di fine lavori. Decide kind, task con file assegnati e complessità, elenco dei reviewer.',
    build: 'coder / builder: legge spec.md, un task, le review. Scrive codice e test per i file assegnati (niente commit). Il coder manda ESCALATE al builder se il task non è semplice.',
    gate: 'Gate (orchestratore): legge i comandi di config.md, scrive gate-rN.md. Decide dagli exit code.',
    commit: 'committer: legge working tree, Tasks, regole di commit. Scrive Conventional Commits sul branch della feature, uno per task. Un hook che fallisce lo ferma.',
    review: 'reviewer: leggono diff, spec.md, playbook. Scrivono reviews/rN-<nome>.md con la tabella checklist. Verdetto PASS o CHANGES (CHANGES solo per punti bloccanti).',
    approver: 'approver: legge tutto quanto sopra, scrive decision.md. Ogni voce della checklist ha evidenza: APPROVE, altrimenti ESCALATE.',
    finish: 'Rule proposals (orchestratore + umano): proposte di tutti gli agenti, scritte in factory/playbook.md sul branch della feature. L\'umano approva, modifica o scarta ciascuna.',
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
    queued: 'In coda', open: 'PR aperte', stuck: 'Ferme', merged: 'Ultime mergiate', none: 'nessuna',
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
    needsHuman: (id: string, why: string) => `${id}: serve il tuo intervento${why ? ` - ${why}` : ''}`,
    prOpen: (id: string, pr: string) => `${id}: PR aperta${pr ? ` ${pr}` : ''}, in attesa di revisione`,
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
