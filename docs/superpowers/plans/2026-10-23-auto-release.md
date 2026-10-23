# Auto release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ogni PR mergiata su `main` produce una release (bump in `plugin.json`, `CHANGELOG.md`, tag, GitHub Release).

**Architecture:** la logica del bump sta in uno script bash puro e testabile in locale; il workflow GitHub lo chiama e fa git/gh.

**Tech Stack:** bash, `jq`, `gh`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-23-auto-release-design.md`

## Global Constraints
- Nessuna dipendenza oltre bash, `jq`, `gh`, `git` (presenti su `ubuntu-latest`).
- Tag `vX.Y.Z` annotato; commit `chore(release): vX.Y.Z` con footer standard del bot.
- Versione `0.x`: breaking → minor. `feat` → minor. Tutto il resto → patch.
- Se `plugin.json` > ultimo tag `v*`, usare la versione di `plugin.json` senza bump.
- Script e workflow con fine riga LF.

## Review Focus
- Titolo con scope e `!` (`feat(factory)!: x`) → breaking, non solo feat.
- Titolo non conventional (`Update README`) → patch, nessun errore.
- Nessun tag `v*` nel repo → ultimo tag trattato come `0.0.0`.
- Due merge ravvicinati → il secondo parte da `main` aggiornato dal primo (checkout di `main`, non dello SHA del merge).
- Body della PR vuoto → nessun errore.

---

### Task 1: calcolo della versione

**Files:**
- Create: `.github/scripts/next-version.sh`
- Test: `.github/scripts/test-next-version.sh`

**Interfaces:**
- Produces: `next-version.sh <pr_title> <pr_body_file> <current_version> <last_tag_version>` → stampa `X.Y.Z` su stdout, exit 0. `last_tag_version` senza `v`, stringa vuota = `0.0.0`.

- [ ] **Step 1: test** — `test-next-version.sh` con una funzione `check <atteso> <titolo> <body> <current> <last_tag>` e i casi:
  - `0.7.0` ← `feat(factory): x`, body vuoto, `0.6.0`, `0.6.0`
  - `0.6.1` ← `fix: x`, `0.6.0`, `0.6.0`
  - `0.6.1` ← `docs: x`, `0.6.0`, `0.6.0`
  - `0.6.1` ← `Update README`, `0.6.0`, `0.6.0`
  - `0.7.0` ← `feat(factory)!: x`, `0.6.0`, `0.6.0`
  - `0.7.0` ← `fix: x`, body `BREAKING CHANGE: y`, `0.6.0`, `0.6.0`
  - `2.0.0` ← `refactor!: x`, `1.4.2`, `1.4.2`
  - `1.5.0` ← `feat: x`, `1.4.2`, `1.4.2`
  - `0.8.0` ← `fix: x`, `0.8.0`, `0.6.0` (bump manuale rispettato)
  - `0.6.1` ← `fix: x`, `0.6.0`, `` (nessun tag)
  Stampa `PASS`/`FAIL` per caso, exit 1 se uno fallisce.
- [ ] **Step 2:** `bash .github/scripts/test-next-version.sh` → FAIL (script mancante).
- [ ] **Step 3:** implementare lo script. Breaking = titolo `^[a-z]+(\([^)]*\))?!:` oppure una riga del body che inizia con `BREAKING CHANGE:`. Confronto versioni con `sort -V`.
- [ ] **Step 4:** test → tutti `PASS`.
- [ ] **Step 5:** commit `feat(release): compute next version from the PR title`.

### Task 2: workflow e changelog

**Files:**
- Create: `.github/workflows/release.yml`, `CHANGELOG.md`

**Interfaces:**
- Consumes: `next-version.sh` (Task 1).

- [ ] **Step 1:** `CHANGELOG.md` con heading `# Changelog` e la voce `## v0.6.0 — 2026-10-23` / `- feat(factory): per-task commits, conventional PR titles, merged branch cleanup (#2)`.
- [ ] **Step 2:** `release.yml`:
  - `on: pull_request: types: [closed], branches: [main]`; job con `if: github.event.pull_request.merged == true`.
  - `permissions: contents: write`; `concurrency: { group: release, cancel-in-progress: false }`.
  - `actions/checkout@v4` con `ref: main`, `fetch-depth: 0`; poi `git pull --ff-only`.
  - Titolo e body passati via `env` (mai interpolati nello script: injection), body scritto in un file temporaneo.
  - Ultimo tag: `git tag -l 'v*' --sort=-v:refname | head -1`.
  - Se la versione calcolata è uguale a quella in `plugin.json` e il tag esiste già → uscire senza fare nulla.
  - Aggiornare `plugin.json` con `jq` (indentazione 2), inserire la voce del changelog subito dopo `# Changelog`, commit come `github-actions[bot]`, `git tag -a vX.Y.Z -m vX.Y.Z`, `git push origin main vX.Y.Z`, `gh release create vX.Y.Z --title vX.Y.Z --notes <voce>` con `GH_TOKEN`.
- [ ] **Step 3:** verifica sintassi: `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release.yml'))"` → nessun errore; `actionlint` se disponibile.
- [ ] **Step 4:** commit `ci(release): release on every merged pull request`.
- [ ] **Step 5:** verifica dal vivo dopo il merge di questa PR (titolo `feat(...)`): run verde, `plugin.json` a `0.7.0`, tag `v0.7.0`, GitHub Release e voce nel changelog.
