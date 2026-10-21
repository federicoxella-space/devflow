# Playbook, interview, DoD, parallel build — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere alla factory devflow interview, playbook di feature e di progetto, Definition of Done, branch `feature/`/`hotfix/` e build parallelo per task.

**Architecture:** Il plugin è solo markdown: una skill orchestratore (`skills/factory/SKILL.md`) e 9 agent (`agents/*.md`). Ogni task modifica i prompt di un gruppo di file che condividono un contratto (nomi di file, sezioni, campi frontmatter definiti in Global Constraints). Non ci sono test automatici: ogni task si verifica con `grep` sui nomi del contratto e con una rilettura contro il design. L'ultimo task fa un dry run su un repo di prova.

**Tech Stack:** Claude Code plugin (skill + subagent in markdown), git, gh.

**Spec:** `docs/superpowers/specs/2026-10-21-playbook-interview-parallel-design.md`

## Global Constraints

Stile: i prompt restano in inglese, concisi, con lo stesso tono e la stessa densità di quelli attuali. Nessun prompt deve crescere più del necessario; niente spiegazioni del "perché" dentro i prompt salvo una riga quando serve a evitare un errore.

Nomi del contratto, da usare identici in tutti i file:

| Cosa | Valore esatto |
|---|---|
| Playbook di progetto | `factory/playbook.md`, sezioni `## Conventions`, `## Patterns`, `## Reusable code`, `## Don'ts`, `## Definition of Done` |
| Voce DoD | `- [<owner>] <item>`, owner ∈ `gate`, `code`, `security`, `ux`, `ui`; id `DoD-<n>` = posizione 1-based nella sezione |
| Playbook di feature | `factory/features/<id>/playbook.md`, sezioni `## Request`, `## Interview`, `## Agent decisions`, `## Done checklist` |
| Q&A interview | `**Q<n>.** ...` / `**A<n>.** ...` |
| Done checklist | tabella `\| id \| item \| owner \| verified by \|`, id `AC<n>` o `DoD-<n>`, owner come sopra oppure `n/a` (motivo in `verified by`) |
| Spec frontmatter | `title`, `kind: feature \| hotfix`, `reviewers`, `ui_pages`; **niente più** `complexity` a livello spec |
| Spec tasks | `## Tasks`, tabella `\| id \| what \| files (owned) \| depends on \| complexity \|`, id `T<n>`, complexity `simple \| complex` |
| Tabella reviewer | `## Checklist`, tabella `\| id \| result \| evidence \|`, result `ok \| fail` |
| Proposte di regole | sezione `## Rule proposals`, righe `- <section>: <rule> — <why>`; raccolte in `factory/features/<id>/rule-proposals.md` |
| Branch | `<kind>/<id>`, cioè `feature/<id>` o `hotfix/<id>`, da `base_branch` |
| Stati | `queued → interview → spec → spec-review → build → review → approve → pr-open → merged`, più `needs-human` |
| Board | colonne `\| id \| feature \| state \| round \| branch \| PR \|` |
| `.gitignore` | `factory/*`, `!factory/config.md`, `!factory/playbook.md` |
| Commit del playbook | fatto dall'orchestratore sul branch della feature: `docs(factory): update playbook` |

## Review Focus

1. **Feature a task singolo**: deve comportarsi esattamente come oggi (un implementer, comandi completi `build/lint/test`). Verificato nel Task 2 (prompt coder/builder) e nel Task 6 (orchestratore).
2. **Utente che risponde "fai come ritieni"** nell'interview: la scelta va in `## Agent decisions` e compare all'approvazione della spec. Verificato nel Task 5 e nel dry run (Task 9).
3. **Implementer che modifica un file non suo**: l'orchestratore lo rileva con `git status --porcelain` contro la colonna `files (owned)` e lo logga. Verificato nel Task 6.
4. **Interview interrotta e ripresa**: il playbook di feature è aggiornato dopo ogni risposta e il resume riparte dalla prima lacuna aperta. Verificato nel Task 5 e nel dry run.
5. **Proposta di regola già presente nel playbook** o duplicata tra agenti: scartata dall'orchestratore prima di mostrarla. Verificato nel Task 7.

---

### Task 1: spec-writer

**Files:**
- Modify: `agents/spec-writer.md`

**Interfaces:**
- Consumes: `factory/playbook.md`, `factory/features/<id>/playbook.md` (sezioni `## Request`, `## Interview`, `## Agent decisions`).
- Produces: `spec.md` con frontmatter `title`, `kind`, `reviewers`, `ui_pages` e sezioni `## Goal`, `## Context`, `## Behaviour`, `## Tasks`, `## Out of scope`, `## Open questions`, `## Rule proposals`; sezione `## Done checklist` scritta nel playbook di feature.

- [ ] **Step 1: Aggiornare input e letture.** Il prompt riceve anche i path dei due playbook. Ordine di lettura: playbook di progetto, playbook di feature, `config.md`, `CLAUDE.md` se presente, poi solo il codice che il playbook non copre. Non ripetere domande già presenti in `## Interview`.
- [ ] **Step 2: File scritti.** Il writer scrive `spec.md` **e** solo la sezione `## Done checklist` del playbook di feature (non tocca le altre sezioni).
- [ ] **Step 3: Template della spec.** Rimuovere `complexity` dal frontmatter, aggiungere `kind: feature  # feature = new or changed behaviour; hotfix = fix of a behaviour that should already work` e una riga di motivo in `## Goal`. Sostituire `## Acceptance criteria` con una riga "See `## Done checklist` in the feature playbook." Aggiungere `## Tasks` e `## Rule proposals` con i formati di Global Constraints.
- [ ] **Step 4: Regole della Done checklist.** AC della feature con id `AC<n>`, ognuno osservabile e con `verified by`; poi ogni voce DoD del playbook di progetto con id `DoD-<n>` e owner dal tag, oppure `n/a` con motivo. Con `ui_review: none` le voci `ux` e `ui` sono `n/a`. Ogni owner non `n/a` diverso da `gate` deve essere in `reviewers` (code sempre).
- [ ] **Step 5: Regole dei task.** Più task solo se almeno due hanno file disgiunti; altrimenti un solo task `T1`. Ogni file appartiene a un solo task; i file condivisi in un task da cui gli altri dipendono. `complexity` per task con la definizione attuale di simple/complex.
- [ ] **Step 6: Risposta all'orchestratore.** Path della spec, `kind`, una riga per task (`T<n> complexity — what`), numero di voci della checklist, numero di rule proposals.
- [ ] **Step 7: Verifica.**
  Run: `grep -cE "kind:|## Tasks|## Done checklist|## Rule proposals|playbook" agents/spec-writer.md`
  Expected: ≥ 5. E `grep -c "complexity: simple" agents/spec-writer.md` → 0 nel frontmatter della spec (la parola resta solo nella tabella Tasks).
- [ ] **Step 8: Commit.**
  ```bash
  git add agents/spec-writer.md
  git commit -m "feat(agents): spec-writer writes tasks, kind and done checklist"
  ```

### Task 2: coder e builder

**Files:**
- Modify: `agents/coder.md`, `agents/builder.md`

**Interfaces:**
- Consumes: `spec.md` `## Tasks`, task id, lista `files (owned)`, flag `parallel: true|false` passato dall'orchestratore, `factory/playbook.md`, Done checklist.
- Produces: modifiche nel working tree limitate ai file posseduti; risposta con sezione `## Rule proposals` (anche vuota omessa).

- [ ] **Step 1: Branch.** Sostituire `factory/<id>` con `<kind>/<id>` (il branch corrente) in entrambi i file.
- [ ] **Step 2: Input e letture.** Ricevono anche task id, file posseduti, `parallel`, path dei due playbook. Leggono prima il playbook di progetto; il criterio "every acceptance criterion" diventa "every Done checklist item owned by the task's scope" (gli AC del task + le voci DoD applicabili ai suoi file).
- [ ] **Step 3: Perimetro.** Modificare solo i file posseduti. Se serve toccare altro: coder → `ESCALATE`, builder → fermarsi e dirlo nella risposta.
- [ ] **Step 4: Comandi.** `parallel: false` → come oggi (build, lint, test fino al verde). `parallel: true` → solo test e lint limitati ai propri file quando lo stack lo permette (esempi: `vitest <path>`, `pytest <path>`, `dotnet test --filter`), altrimenti nessun comando; il gate finale è l'autorità. Nel coder, "three serious attempts" vale per i soli comandi eseguiti.
- [ ] **Step 5: Rule proposals.** Se scoprono una convenzione o un pattern non presente nel playbook, lo riportano in coda alla risposta in `## Rule proposals`. Il limite di 10 righe della risposta esclude questa sezione.
- [ ] **Step 6: Verifica.**
  Run: `grep -c "factory/<id>" agents/coder.md agents/builder.md`
  Expected: 0 e 0. Run: `grep -cE "parallel|owned|Rule proposals|playbook" agents/coder.md agents/builder.md` → ≥ 4 ciascuno.
- [ ] **Step 7: Commit.**
  ```bash
  git add agents/coder.md agents/builder.md
  git commit -m "feat(agents): implementers work per task with owned files"
  ```

### Task 3: i quattro reviewer

**Files:**
- Modify: `agents/review-code.md`, `agents/review-security.md`, `agents/review-ux.md`, `agents/review-ui.md`

**Interfaces:**
- Consumes: playbook di feature (`## Done checklist`), `factory/playbook.md`.
- Produces: file di review con `## Blocking`, `## Non-blocking`, `## Checklist`, `## Rule proposals`; `verdict: CHANGES` se Blocking non è vuoto.

- [ ] **Step 1: Letture.** Ogni reviewer riceve anche i path dei due playbook e confronta il diff con le convenzioni del playbook di progetto oltre che con `CLAUDE.md`.
- [ ] **Step 2: Checklist.** Aggiungere al template di output la tabella `## Checklist` con le sole voci il cui `owner` è il reviewer stesso (`code`, `security`, `ux`, `ui`). Ogni `fail` compare anche in `## Blocking`.
- [ ] **Step 3: Round > 1.** Sostituire la regola attuale con: verificare i propri blocking precedenti e le voci in `fail`, ricontrollare le voci toccate dai nuovi commit, copiare le altre dal round precedente; la tabella resta completa. Il divieto di sollevare nuovi problemi su codice invariato resta.
- [ ] **Step 4: Rule proposals.** Sezione opzionale `## Rule proposals` nel file di output, formato di Global Constraints.
- [ ] **Step 5: Verifica.**
  Run: `grep -lE "## Checklist" agents/review-*.md | wc -l` → 4. Run: `grep -lE "## Rule proposals" agents/review-*.md | wc -l` → 4.
- [ ] **Step 6: Commit.**
  ```bash
  git add agents/review-*.md
  git commit -m "feat(agents): reviewers verify done checklist items they own"
  ```

### Task 4: approver e committer

**Files:**
- Modify: `agents/approver.md`, `agents/committer.md`

**Interfaces:**
- Consumes: Done checklist, ultime review, ultimo `gate-r<N>.md`.
- Produces: `decision.md` con tabella `| Item | Evidence |` su tutte le voci non `n/a`; committer accetta `feature/<id>` o `hotfix/<id>`.

- [ ] **Step 1: Approver.** Lo step 1 passa da "spec.md acceptance criteria" a "every Done checklist item that is not `n/a`": evidenza dalle tabelle `## Checklist` dell'ultimo round, e per le voci `gate` dall'ultimo gate file. Una voce senza evidenza → `ESCALATE`. Lo step 4 aggiunge: nessun file modificato fuori dalla colonna `files (owned)` dei task. Il template rinomina la colonna `Criterion` in `Item`.
- [ ] **Step 2: Committer.** Branch atteso `feature/<id>` o `hotfix/<id>` (riga iniziale e step 1). Nelle default rules: con branch `hotfix/` il tipo di default del commit principale è `fix`. La regola "never commit files under `factory/`" resta invariata.
- [ ] **Step 3: Verifica.**
  Run: `grep -c "factory/<id>" agents/committer.md` → 0. Run: `grep -cE "Done checklist|n/a|owned" agents/approver.md` → ≥ 3.
- [ ] **Step 4: Commit.**
  ```bash
  git add agents/approver.md agents/committer.md
  git commit -m "feat(agents): approver checks full done checklist, committer accepts feature/hotfix branches"
  ```

### Task 5: orchestratore — file, board, entry point, Init, interview

**Files:**
- Modify: `skills/factory/SKILL.md` (sezioni `## Files`, board, `## Entry point`, `## Init`, nuovo step `### 0. Interview`)

**Interfaces:**
- Consumes: formati di Global Constraints.
- Produces: stato `interview`, playbook di feature con `## Request`, `## Interview`, `## Agent decisions`; `factory/playbook.md` in bozza.

- [ ] **Step 1: Albero file e board.** Aggiungere `playbook.md` (progetto) e, per feature, `playbook.md` e `rule-proposals.md`. Board con colonna `branch`; elenco stati con `interview`. Aggiornare la riga del frontmatter `description` della skill (interview, playbook).
- [ ] **Step 2: Entry point.**
  - Se `factory/playbook.md` manca e `config.md` esiste: eseguire **Playbook draft** (sotto), aggiungere `!factory/playbook.md` al `.gitignore`, chiedere all'utente di committare, fermarsi.
  - Nuova feature → stato `interview` (non più `spec`).
  - Riga attiva in qualunque stato tra `spec` e `approve` senza `features/<id>/playbook.md` → stato `interview` con riga di log "restarted: old format".
  - `interview` si aggiunge agli stati riprendibili.
- [ ] **Step 3: Init.** Al passo 3 il `.gitignore` include `!factory/playbook.md`; nuovo passo 4 **Playbook draft**: leggere `CLAUDE.md`, note di `config.md`, il codebase; scrivere la bozza con le cinque sezioni e una DoD iniziale per lo stack (sempre almeno una voce `[gate]` e una `[code]` "every AC has a test or a precise manual step"); mostrarla, applicare le modifiche dell'utente, scriverla. Chiedere all'utente di committare `config.md`, `playbook.md` e `.gitignore`.
- [ ] **Step 4: Step 0 Interview.** Scrivere il passo come nel design §2: letture; elenco privato delle lacune; **una domanda alla volta** (AskUserQuestion se ci sono opzioni naturali, altrimenti domanda aperta e attesa della risposta); dopo ogni risposta aggiornare `## Interview`; "decide you" → `## Agent decisions` con motivo; stop quando ogni AC si può scrivere senza indovinare; richiesta già completa → `## Interview` con "No questions needed." Al resume, rileggere il playbook di feature e continuare dalla prima lacuna aperta. Poi stato `spec`.
- [ ] **Step 5: Verifica.**
  Run: `grep -cE "interview" skills/factory/SKILL.md` → ≥ 5. Run: `grep -c "!factory/playbook.md" skills/factory/SKILL.md` → ≥ 2.
- [ ] **Step 6: Commit.**
  ```bash
  git add skills/factory/SKILL.md
  git commit -m "feat(factory): add interview step and project playbook bootstrap"
  ```

### Task 6: orchestratore — spec review, branch, build parallelo, gate

**Files:**
- Modify: `skills/factory/SKILL.md` (step 1-4b)

**Interfaces:**
- Consumes: risposta e frontmatter dello spec-writer (Task 1), flag `parallel` e file posseduti per gli implementer (Task 2).
- Produces: branch `<kind>/<id>`, round di build per task.

- [ ] **Step 1: Spec.** Lo spec-writer riceve anche i path dei due playbook.
- [ ] **Step 2: Spec review.** Mostrare titolo, `kind` con motivo, tasks, Done checklist, Agent decisions, Open questions, out of scope. Le Open questions si pongono all'utente una alla volta e le risposte vanno in `## Interview` del playbook di feature prima di riprendere lo spec-writer. Un cambio di `kind` da parte dell'utente è una "Request changes". Approve → `git switch -c <kind>/<id>` dopo il pull del base branch; scrivere `branch` nella board.
- [ ] **Step 3: Build.** Sostituire il paragrafo di routing con: per ogni task `simple` → coder, `complex` → builder; un solo task → `parallel: false`; altrimenti lanciare **in un solo messaggio** i task senza dipendenze aperte con `parallel: true`, poi i task sbloccati. `ESCALATE` vale per il task. Tenere in contesto gli agent id per task.
- [ ] **Step 4: Controllo perimetro.** Dopo che tutti i task sono finiti: `git status --porcelain`, confronto con `files (owned)`; ogni file fuori perimetro → riga di log `<id> · out-of-scope file <path> (T<n>)`. Non blocca: lo vede l'approver.
- [ ] **Step 5: Rework.** Review: raggruppare i punti `## Blocking` per `path` e mandarli all'implementer del task proprietario (in parallelo se più task); punti senza path o con file senza proprietario → stessa regola del gate. Gate: il task proprietario se un path dell'output corrisponde a `files (owned)`, altrimenti il builder di un task complex se c'è, altrimenti il coder di `T1`. In rework `parallel: true` solo se più implementer lavorano insieme.
- [ ] **Step 6: Gate e voci `gate`.** Dopo un gate verde, l'orchestratore scrive in `gate-r<N>.md` una riga `ok` per ogni voce con owner `gate`.
- [ ] **Step 7: Rule proposals.** Dopo ogni risposta di spec-writer e implementer, appendere le loro `## Rule proposals` a `rule-proposals.md` (con autore e round).
- [ ] **Step 8: Verifica.**
  Run: `grep -n "factory/<id>" skills/factory/SKILL.md` → solo righe della sezione PR (le sistema il Task 7). Run: `grep -cE "parallel: (true|false)|files \(owned\)" skills/factory/SKILL.md` → ≥ 3.
- [ ] **Step 9: Commit.**
  ```bash
  git add skills/factory/SKILL.md
  git commit -m "feat(factory): branch by kind and parallel build per task"
  ```

### Task 7: orchestratore — review, regole proposte, PR

**Files:**
- Modify: `skills/factory/SKILL.md` (step 5-6)

**Interfaces:**
- Consumes: `## Checklist` e `## Rule proposals` dei reviewer (Task 3), `decision.md` (Task 4).
- Produces: `factory/playbook.md` aggiornato sul branch; PR con la Done checklist.

- [ ] **Step 1: Review.** Ogni reviewer riceve anche i path dei due playbook. Dopo le review, appendere le loro `## Rule proposals` a `rule-proposals.md`.
- [ ] **Step 2: Regole proposte.** Nuovo step tra `APPROVE` e push: leggere `rule-proposals.md`, scartare doppioni e regole già nel playbook; se ne resta qualcuna, mostrarle **una alla volta** con AskUserQuestion: Approve / Edit / Discard. Le approvate (o modificate) vanno nella sezione indicata di `factory/playbook.md`, poi `git add factory/playbook.md && git commit -m "docs(factory): update playbook"`. Annotare l'esito di ogni proposta in `rule-proposals.md`. Se la feature va in `needs-human`, il file resta e viene ripreso quando arriva ad `approve`.
- [ ] **Step 3: PR.** `factory/<id>` → `<kind>/<id>` nei comandi `git push` e `gh pr create`. Il body della PR usa la tabella della Done checklist di `decision.md` al posto della tabella AC.
- [ ] **Step 4: Verifica.**
  Run: `grep -c "factory/<id>" skills/factory/SKILL.md` → 0. Run: `grep -cE "rule-proposals.md|docs\(factory\): update playbook" skills/factory/SKILL.md` → ≥ 3.
- [ ] **Step 5: Commit.**
  ```bash
  git add skills/factory/SKILL.md
  git commit -m "feat(factory): review rule proposals before opening the PR"
  ```

### Task 8: documentazione e versione

**Files:**
- Modify: `vault/Software factory.md`, `.claude-plugin/plugin.json`

- [ ] **Step 1: Vault.** Bullet dell'orchestratore: branch `<kind>/<id>`, interview prima della spec, playbook di progetto. Diagramma mermaid: nodo `interview` prima di `spec-writer`; implementer come "task paralleli"; nodo "rule proposals (human)" tra approver e PR. Tabella Contracts: righe interview e playbook; reviewer e approver citano la Done checklist. Albero file con i nuovi file.
- [ ] **Step 2: Versione.** `plugin.json`: `"version": "0.2.0"`, description con "interview" e "playbook".
- [ ] **Step 3: Verifica.**
  Run: `grep -cE "interview|playbook" "vault/Software factory.md"` → ≥ 4. Verificare che il blocco mermaid sia valido incollandolo in un renderer (es. mermaid.live) oppure aprendo la nota in Obsidian.
- [ ] **Step 4: Commit.**
  ```bash
  git add "vault/Software factory.md" .claude-plugin/plugin.json
  git commit -m "docs(vault): document interview, playbook and parallel build"
  ```

### Task 9: verifica di coerenza e dry run

**Files:** nessuna modifica attesa; correzioni solo se emergono incoerenze.

- [ ] **Step 1: Coerenza dei nomi.** Per ogni valore della tabella Global Constraints, `grep -rn` su `agents/` e `skills/` e controllare che sia scritto identico ovunque compaia (in particolare `## Done checklist`, `## Rule proposals`, `files (owned)`, `kind`, `n/a`, `<kind>/<id>`).
  Expected: nessuna variante (es. `## Done Checklist`, `owned files`, `factory/<id>`).
- [ ] **Step 2: Dry run.** In un repo di prova vuoto nella scratchpad (`git init`, un `package.json` minimale con script `build`/`lint`/`test` che fanno `echo ok`, un remote non necessario), installare il plugin dalla cartella del branch ed eseguire `/devflow:factory init` e poi `/devflow:factory aggiungi una funzione somma e una funzione sottrazione in due file separati`. Fermarsi prima di `git push`.
  Expected: bozza playbook mostrata e scritta; `.gitignore` con le tre righe; interview con domande una alla volta e playbook di feature aggiornato dopo ogni risposta; rispondere "fai come ritieni" a una domanda e trovarla in `## Agent decisions`; spec con `kind: feature`, due task paralleli e Done checklist; due implementer lanciati nello stesso messaggio con `parallel: true`; review con tabella `## Checklist`; `decision.md` con tutte le voci; proposte di regole mostrate una alla volta prima della PR.
- [ ] **Step 3: Resume dell'interview.** Ripetere con una nuova feature, interrompere dopo la prima risposta, rilanciare `/devflow:factory`.
  Expected: l'interview riprende dalla domanda successiva, senza ripetere la prima.
- [ ] **Step 4: Commit delle eventuali correzioni.**
  ```bash
  git add agents skills
  git commit -m "fix(factory): align contract names across agents"
  ```
