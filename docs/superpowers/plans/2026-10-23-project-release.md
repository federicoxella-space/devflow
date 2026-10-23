# Project release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** nei progetti della factory ogni PR/MR mergiata crea tag `vX.Y.Z` e release (GitHub o GitLab), installate da `/devflow:init`.

**Architecture:** template in `skills/init/release/` (script bash + due file di CI); init li copia nel progetto. `next-version.sh` diventa unico per plugin e progetti.

**Tech Stack:** bash, git, curl, `gh`, GitHub Actions, GitLab CI.

**Spec:** `docs/superpowers/specs/2026-10-23-project-release-design.md`

## Global Constraints
- Nessun commit o push su branch dalla CI: solo tag e release via API.
- `release.sh` interfaccia env: `RELEASE_FORGE` (`github`|`gitlab`), `RELEASE_SHA`; GitHub `PR_TITLE`, `PR_BODY`, `PR_NUMBER`; GitLab `CI_COMMIT_MESSAGE`, `CI_API_V4_URL`, `CI_PROJECT_ID`, `CI_JOB_TOKEN`.
- Tag validi solo `^v[0-9]+\.[0-9]+\.[0-9]+$`; nessuno → `0.0.0`. Max 5 tentativi, attesa `2 × tentativo` s.
- Note: `- <title> (#<n>)` su GitHub, `- <title> (!<n>)` su GitLab, `- <title>` senza numero.
- File copiati con header `# Installed by devflow {{DEVFLOW_VERSION}}. Re-run /devflow:init → Release to update.`; placeholder `{{BASE_BRANCH}}` nei file di CI.
- LF, testo dei file skill in inglese.

## Review Focus
- Titolo con virgolette, backslash o a capo → JSON valido verso GitLab (test in Task 2).
- MR chiusa con template di merge di default → titolo dalla terza riga, numero da `!<n>` (test in Task 2).
- `.gitlab-ci.yml` esistente con `include:` in forma stringa singola → init non lo rompe (istruzione in Task 4: se non è una lista, chiedere all'utente).
- Runner senza bash/git/curl → messaggio chiaro (`release.sh` verifica all'avvio).
- Plugin: il workflow del plugin funziona ancora dopo lo spostamento di `next-version.sh` (Task 1).

---

### Task 1: `next-version.sh` unico

**Files:**
- Move: `.github/scripts/next-version.sh`, `.github/scripts/test-next-version.sh` → `skills/init/release/`
- Modify: `.github/scripts/release.sh` (path di next-version)

**Interfaces:**
- Produces: `skills/init/release/next-version.sh <title> <body_file> <current> <last_tag>` (invariato).

- [ ] **Step 1:** `git mv` dei due file; in `.github/scripts/release.sh` usare `$dir/../../skills/init/release/next-version.sh`.
- [ ] **Step 2:** `bash skills/init/release/test-next-version.sh` → `all passed`; `bash .github/scripts/test-release.sh` → `all passed`.
- [ ] **Step 3:** commit `refactor(release): share next-version.sh between plugin and projects`.

### Task 2: `release.sh` per i progetti

**Files:**
- Create: `skills/init/release/release.sh`, `skills/init/release/test-release.sh`

**Interfaces:**
- Consumes: `next-version.sh` nella stessa cartella.
- Produces: `release.sh` con l'interfaccia env dei Global Constraints; exit 0 rilasciato/già rilasciato, 1 errore.

- [ ] **Step 1: test** con remote bare, clone, stub `gh` (log + crea il tag nel remote; `release edit` registrato) e stub `curl` (salva il JSON, crea il tag nel remote). Casi:
  - github, nessun tag (solo `release-2024` e `v1.2`), `feat: a` #5 → tag `v0.1.0`, note `- feat: a (#5)`
  - github, ultimo `v0.1.0`, `fix: b` #6 su commit successivo → `v0.1.1`
  - github, re-run dello stesso SHA → nessuna nuova chiamata `release create`
  - github, fuori ordine: due commit A < B, ultimo tag `v0.1.1`; lo stub alla prima `release create` per A crea `v0.2.0` su B e risponde "already exists" → nessun tag su A, `release edit v0.2.0` con la riga di A
  - gitlab, messaggio `Merge branch 'f' into 'main'\n\nfeat(api): x "q" \ y\n\nSee merge request grp/proj!12` → JSON valido (`python -c json.load`), `tag_name` `v0.2.0`... (versione attesa dal tag più alto al momento), `ref` = SHA, `description` `- feat(api): x "q" \ y (!12)`
  - gitlab, messaggio senza `Merge branch` e senza `!n` → note `- <prima riga>`
  Ultima riga `all passed`.
- [ ] **Step 2:** `bash skills/init/release/test-release.sh` → FAIL (script mancante).
- [ ] **Step 3:** implementare i passi 1-6 dello spec più: verifica di bash/git/curl all'avvio; JSON costruito con una funzione `json_escape` (`\`, `"`, a capo, tab); GitLab "tag esistente" = HTTP 409 o messaggio `already exists`; append alle note: GitHub `gh release view --json body` + `gh release edit --notes`, GitLab `GET`/`PUT .../releases/<tag>`.
- [ ] **Step 4:** test → `all passed`.
- [ ] **Step 5:** commit `feat(release): release script for factory projects`.

### Task 3: template di CI

**Files:**
- Create: `skills/init/release/github-workflow.yml`, `skills/init/release/gitlab-ci.yml`

- [ ] **Step 1:** GitHub: trigger `pull_request` `closed` su `{{BASE_BRANCH}}`, `if: merged`, `permissions: contents: write`, checkout `fetch-depth: 0`, env dello spec con `RELEASE_SHA: ${{ github.event.pull_request.merge_commit_sha }}`, `run: bash .devflow/release.sh`. Header dei Global Constraints.
- [ ] **Step 2:** GitLab: job `devflow-release`, `stage: .post`, `variables: DEVFLOW_RELEASE_IMAGE: "alpine:3"`, `GIT_DEPTH: "0"`, `image: $DEVFLOW_RELEASE_IMAGE`, `resource_group: devflow-release`, `rules` push su `{{BASE_BRANCH}}`, `before_script` `command -v apk >/dev/null && apk add --no-cache bash git curl || true`, `script: RELEASE_FORGE=gitlab RELEASE_SHA=$CI_COMMIT_SHA bash .devflow/release.sh`.
- [ ] **Step 3:** verifica: entrambi caricati con `yaml.safe_load` (dopo sostituzione dei placeholder) senza errori.
- [ ] **Step 4:** commit `feat(release): CI templates for GitHub and GitLab`.

### Task 4: init e documentazione

**Files:**
- Modify: `skills/init/SKILL.md`, `README.md`, `vault/Software factory.md`

- [ ] **Step 1:** init passo **1c. Release** (solo forge `github`/`gitlab`): spiegazione, **Enable / Skip**, `release: auto | off` nel template di config; Enable → copia `release.sh` e `next-version.sh` in `.devflow/`, il file di CI (sostituendo `{{DEVFLOW_VERSION}}` con `version` di `.claude-plugin/plugin.json` del plugin e `{{BASE_BRANCH}}`), per GitLab `include: - local: .devflow/gitlab-release.yml` in `.gitlab-ci.yml` (crearlo se manca; se `include:` non è una lista, mostrare la riga e chiedere); GitLab: controllo `merge_method` con `glab api projects/:id` e avviso se non `merge`; dire come impostare `DEVFLOW_RELEASE_IMAGE`; per resource group `process_mode`: `glab api --method PUT projects/:id/resource_groups/devflow-release -f process_mode=oldest_first` dopo il primo run (dire all'utente). Menu: voce **Release**. Hand-over: committare anche i file di release.
- [ ] **Step 2:** README: sezione "Automatic releases"; vault: una riga.
- [ ] **Step 3:** verifica: `grep -c "1c. Release" skills/init/SKILL.md` = 1, `grep -c "merge_method" skills/init/SKILL.md` ≥ 1, `grep -ci "automatic release" README.md` ≥ 1.
- [ ] **Step 4:** commit `feat(init): install automatic releases for GitHub and GitLab`.
