# Forge-independent factory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/devflow:factory` e `/devflow:init` funzionano su GitHub, GitLab, Azure DevOps e in modalità solo git.

**Architecture:** l'orchestratore nomina cinque operazioni; i comandi stanno in un file markdown per forge, letto solo quello attivo. Il rilevamento del merge in modalità git è uno script bash testato.

**Tech Stack:** markdown (skill Claude Code), bash, git, `gh`, `glab`, `az` (estensione azure-devops).

**Spec:** `docs/superpowers/specs/2026-10-23-forge-independent-design.md`

## Global Constraints
- Campi config: `forge: github | gitlab | azure | git`, `forge_host`, `azure_org`, `azure_project`; `forge` assente → `github`.
- Operazioni, nomi esatti: `auth`, `open-pr`, `pr-state`, `issues-enabled`, `create-issue`. `pr-state` restituisce `MERGED` / `CLOSED` / `OPEN` / `UNKNOWN`.
- Script: `skills/factory/scripts/git-merged.sh <branch> <base>` → `merged` | `squashed` | `open`, exit 0; confronta con `origin/<base>`; il chiamante ha già fatto `git fetch --prune`.
- La factory e init non committano mai sul base branch.
- Repo senza remote: non supportato. Azure Server: predisposto, non verificato (dichiararlo in `forges/azure.md`).
- File con fine riga LF; testo dei file skill in inglese, come quelli esistenti.

## Review Focus
- `config.md` di un progetto esistente senza `forge` → comportamento identico a oggi (GitHub).
- GitLab self-managed: ogni comando `glab` usa `forge_host`.
- Modalità git: riga `pr-open` con PR `-` → `pr-state` usa la colonna branch, non la colonna PR.
- Squash mergiato e poi `main` avanzato con altri commit → ancora `squashed` (test in Task 1).
- Riga segnata `merged` a mano con branch locale presente → cleanup la elimina.

---

### Task 1: rilevamento del merge in modalità git

**Files:**
- Create: `skills/factory/scripts/git-merged.sh`, `skills/factory/scripts/test-git-merged.sh`

**Interfaces:**
- Produces: `git-merged.sh <branch> <base>` → stdout `merged` | `squashed` | `open`; branch locale inesistente → `open` + messaggio su stderr.

- [ ] **Step 1: test.** `test-git-merged.sh` crea in una dir temporanea un remote bare e un clone con `main` e un file base; funzione `check <atteso> <branch>` dopo `git fetch --prune`. Casi:
  - `merged` ← branch `f-merge` (2 commit) unito con `git merge --no-ff` e push di main
  - `merged` ← `f-ff` unito con fast-forward
  - `merged` ← `f-rebase` (2 commit) ribasato su main avanzato e poi fast-forward (commit riscritti)
  - `squashed` ← `f-squash` (2 commit) unito con `git merge --squash` + commit
  - `squashed` ← `f-squash-later`: squash come sopra, poi un altro commit su main che tocca un altro file
  - `open` ← `f-conflict`: squash con conflitto risolto in modo diverso dal branch
  - `open` ← `f-open` mai mergiato
  - `open` ← `missing` (branch inesistente), stderr non vuoto
  Exit 1 se un caso fallisce, ultima riga `all passed`.
- [ ] **Step 2:** `bash skills/factory/scripts/test-git-merged.sh` → FAIL (script mancante).
- [ ] **Step 3:** implementare lo script con l'algoritmo dello spec (is-ancestor → `git cherry` tutto `-` → commit temporaneo `git commit-tree <branch>^{tree} -p <merge-base>` + `git cherry` → `open`).
- [ ] **Step 4:** test → `all passed`.
- [ ] **Step 5:** commit `feat(factory): detect merged branches from git alone`.

### Task 2: file dei forge

**Files:**
- Create: `skills/factory/forges/github.md`, `gitlab.md`, `azure.md`, `git.md`

**Interfaces:**
- Consumes: `git-merged.sh` (Task 1), in `git.md`.
- Produces: in ogni file le sezioni `## auth`, `## open-pr`, `## pr-state`, `## issues-enabled`, `## create-issue`, con comando, parsing dell'output, errori; mappatura degli stati sui quattro valori di `pr-state`.

- [ ] **Step 1:** scrivere i quattro file dalla tabella "Per forge" dello spec. Specifiche:
  - `github.md`: `GH_HOST=<forge_host>` se valorizzato; label e issue come oggi in `SKILL.md` (colori e descrizioni invariati, "already exists" ignorato).
  - `gitlab.md`: `--hostname <forge_host>` / `GITLAB_HOST`; `open-pr` → `glab mr create --source-branch --target-branch --title --description` con body dal file; stato `merged`/`closed`/`opened`.
  - `azure.md`: in testa "Azure DevOps Server: prepared, not verified"; `--org <azure_org> --project <azure_project>` se valorizzati, altrimenti `--detect true`; work item del primo tipo disponibile tra `Issue`, `User Story`, `Product Backlog Item`, tag `devflow; deferred`; URL web della PR in `open-pr`.
  - `git.md`: `auth` = `git ls-remote origin`; `open-pr` = push, riferimento `-`, messaggio all'utente; `pr-state` = `bash <skill base dir>/scripts/git-merged.sh <branch> <base>` (`merged`/`squashed` → `MERGED`, `open` → `OPEN`, mai `CLOSED`); `issues-enabled` = `false`; nessuna `create-issue`.
- [ ] **Step 2:** verifica: per ogni file `grep -c '^## \(auth\|open-pr\|pr-state\|issues-enabled\|create-issue\)$'` → 5 (4 per `git.md` se `create-issue` è assente: dichiararla comunque con "not available" → 5). `grep -c forge_host skills/factory/forges/gitlab.md` ≥ 1, `grep -c "not verified" skills/factory/forges/azure.md` ≥ 1.
- [ ] **Step 3:** commit `feat(factory): add forge reference files for github, gitlab, azure and git`.

### Task 3: orchestratore

**Files:**
- Modify: `skills/factory/SKILL.md` (Files, entry point 2 e 4, Deferring logic, step 6)

**Interfaces:**
- Consumes: operazioni del Task 2 per nome.

- [ ] **Step 1:** in "Files" aggiungere i campi config; in testa al loop: "read `forges/<forge>.md` (this skill's base directory) once; `forge` absent → `github`".
- [ ] **Step 2:** entry point 2: `pr-state` al posto di `gh pr view`, con riferimento PR o, se `-`, branch; `UNKNOWN` → salta e dillo; cleanup per ogni riga `merged` con branch locale esistente (anche segnata a mano); in modalità git le righe senza merge rilevato restano `pr-open` con una riga all'utente.
- [ ] **Step 3:** precondizioni: `auth`; Deferring logic: `issues-enabled` + `create-issue`, fallback invariato; step 6: `open-pr`, PR = riferimento restituito.
- [ ] **Step 4:** verifica: `grep -cE '\bgh (pr|issue|label|repo|auth)' skills/factory/SKILL.md` → 0; `grep -cE 'open-pr|pr-state|issues-enabled|create-issue' skills/factory/SKILL.md` ≥ 4.
- [ ] **Step 5:** commit `feat(factory): run on any forge through named operations`.

### Task 4: init e documentazione

**Files:**
- Modify: `skills/init/SKILL.md`, `README.md`, `vault/Software factory.md`

- [ ] **Step 1:** init: nuovo passo "Forge" dopo "Stack and commands" con la tabella di rilevamento dello spec (incluso "nessun remote → non supportato"), domanda per host sconosciuti, `azure_org`/`azure_project` per Server, verifica `auth` non bloccante con i comandi di login; campi nel template di `config.md`; voce **Forge** nel menu "both present".
- [ ] **Step 2:** README: requisiti per forge, "Pull request on GitHub" → "on the configured forge"; vault: una riga sulla scelta del forge.
- [ ] **Step 3:** verifica: `grep -c 'forge' skills/init/SKILL.md` ≥ 5; `grep -c 'glab' README.md` ≥ 1.
- [ ] **Step 4:** commit `feat(init): detect and configure the forge`.
