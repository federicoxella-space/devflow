# Release automatica nei progetti della factory

## Intento
Nei progetti su cui gira la factory (app deployate) ogni PR/MR mergiata nel base branch diventa
una release: tag `vX.Y.Z` e voce nella pagina Releases di GitHub o GitLab. Serve a sapere cosa
contiene ogni versione deployata. Nessun commit del bot: funziona con `main` protetto.

## Obiettivi
- GitHub (cloud) e GitLab (anche self-managed, il caso reale dell'utente).
- Versione calcolata dal titolo della PR/MR con le regole del plugin (`feat` → minor, breaking →
  major/minor in 0.x, resto → patch), partendo dall'ultimo tag `vX.Y.Z`.
- Installazione e aggiornamento da `/devflow:init`; nessun file scritto senza consenso.

## Non obiettivi
- Versione nei file dello stack (`package.json`, `.csproj`, ...) e `CHANGELOG.md` nel repo.
- Azure DevOps (previsto ma non usato) e modalità `git` (nessuna CI da configurare).
- Release raggruppate o manuali.

## Anti-obiettivi
- Commit o push su `main` da parte della CI.
- Release perse con merge ravvicinati, o doppie con un re-run.
- Dipendenze nella CI oltre bash, git, curl, `gh` (presente sui runner GitHub).
- Logica di versione duplicata tra plugin e progetti.

## Approcci
- **A. Script condiviso + file di CI sottile per forge** — scelto dall'utente. Logica unica e
  testabile in locale; su GitLab nessun token aggiuntivo.
- B. Logica dentro ogni file di CI — scartato: duplicata, non testabile.
- C. semantic-release — scartato: Node nella CI di progetti .NET/Java, token `api` su GitLab,
  versione dai commit del branch e non dal titolo della PR.

## Design

### File nel plugin (template)
`skills/init/release/`:
- `next-version.sh` — spostato qui da `.github/scripts/` (stessa interfaccia:
  `<title> <body_file> <current> <last_tag>`); il workflow del plugin lo usa da qui, così la logica
  è una sola. I test si spostano con lui.
- `release.sh` — release di un merge, per i progetti (sotto).
- `github-workflow.yml` — copiato in `.github/workflows/devflow-release.yml`.
- `gitlab-ci.yml` — copiato in `.devflow/gitlab-release.yml`.
- `test-release.sh` — test di `release.sh` con remote bare locale e stub di `gh` e `curl`.

### File nel progetto (scritti da init)
`.devflow/release.sh`, `.devflow/next-version.sh`, più `.github/workflows/devflow-release.yml`
(GitHub) oppure `.devflow/gitlab-release.yml` e una voce `include: - local: .devflow/gitlab-release.yml`
in `.gitlab-ci.yml` (creato se manca; se esiste e ha già `include:`, aggiungere l'elemento; se la
struttura non si modifica in modo sicuro, mostrare la riga e chiedere all'utente di aggiungerla).
In testa a ogni file copiato: `# Installed by devflow <versione plugin>. Re-run /devflow:init → Release to update.`

### `release.sh` (progetti)
Input da env: `RELEASE_FORGE` (`github` | `gitlab`), `RELEASE_SHA` (commit da taggare), e:
- GitHub: `PR_TITLE`, `PR_BODY`, `PR_NUMBER`, `GH_TOKEN`.
- GitLab: `CI_COMMIT_MESSAGE`, `CI_API_V4_URL`, `CI_PROJECT_ID`, `CI_JOB_TOKEN`; titolo e numero si
  ricavano dal messaggio: prima riga, salvo che inizi con `Merge branch ` → prima riga non vuota
  dopo di essa (template di merge di default); numero da `See merge request <path>!<n>` se presente.
  Body = il resto del messaggio (per `BREAKING CHANGE:`).

Passi, ripetuti fino a 5 volte:
1. `git fetch --tags --force`.
2. Se un tag `v*` punta già a `RELEASE_SHA` → già rilasciato, uscire 0 (re-run).
   Se `RELEASE_SHA` è antenato del commit dell'ultimo tag (un merge successivo ha già rilasciato
   prima di questo job) → nessun nuovo tag: aggiungere la propria riga alle note di quella release
   (`gh release edit` / `PUT .../releases/<tag>`) se non c'è già, e uscire 0. Così l'ordine delle
   versioni segue sempre l'ordine dei commit.
3. Ultimo tag = il più alto tra quelli che rispettano `^v[0-9]+\.[0-9]+\.[0-9]+$` (altri tag
   ignorati); nessuno → `0.0.0`. Versione = `next-version.sh <title> <body> <last> <last>`.
4. Note = `- <title> (#<n>)` o `- <title> (!<n>)` su GitLab; senza numero solo `- <title>`.
5. Creare tag e release via API:
   - GitHub: `gh release create v<X> --target <RELEASE_SHA> --title v<X> --notes <note>`.
   - GitLab: `curl --fail-with-body -H "JOB-TOKEN: $CI_JOB_TOKEN" -X POST
     "$CI_API_V4_URL/projects/$CI_PROJECT_ID/releases"` con JSON `tag_name`, `ref` (= SHA),
     `name`, `description` (costruito senza interpolare testo libero nella shell: `printf` + escape
     JSON di `"` `\` e a capo).
6. Successo → uscire 0. Errore perché il tag esiste già (un altro merge l'ha preso) → attendere
   `2 × tentativo` secondi e ripetere da 1. Altro errore → uscire 1 con l'output.

### CI
- GitHub: `on: pull_request: types: [closed], branches: [<base_branch>]`, job se `merged`;
  `permissions: contents: write`; checkout `fetch-depth: 0`; `RELEASE_SHA` =
  `github.event.pull_request.merge_commit_sha`; titolo/body via `env`; nessun gruppo `concurrency`.
- GitLab: job `devflow-release`, `stage: .post` (esiste sempre, ma GitLab non crea pipeline con
  soli job `.pre`/`.post`: un `.gitlab-ci.yml` creato da init dichiara `stages: [release]` e sposta
  lì il job), `when: always`, `image: $DEVFLOW_RELEASE_IMAGE`
  con `variables: DEVFLOW_RELEASE_IMAGE: "alpine:3"` (sovrascrivibile dalle CI/CD settings per un
  registry interno; ignorata da un executor shell); `before_script` installa bash, git e curl con
  `apk` solo se mancano e `apk` esiste; `release.sh` verifica bash, git e curl all'avvio e, se ne
  manca uno, esce 1 dicendo cosa installare sul runner o quale immagine impostare; `rules: if $CI_COMMIT_BRANCH == "<base_branch>" &&
  $CI_PIPELINE_SOURCE == "push"`, `resource_group: devflow-release` con `process_mode: oldest_first` (da
  impostare via API sul resource group; GitLab accoda i job senza cancellarli), `GIT_DEPTH: 0`, `RELEASE_SHA = $CI_COMMIT_SHA`. Ogni push su `main` diventa una
  release, anche quelli diretti.

### `/devflow:init`
- Nuovo passo **1c. Release** dopo 1b, solo con forge `github` o `gitlab`: chiedere **Enable / Skip**
  spiegando cosa fa; config `release: auto | off` (assente = `off`). Enable → scrivere i file, che
  l'utente committa al passo finale come gli altri.
- Menu "progetto già configurato": voce **Release** (riesegue 1c e ricopia i file: è anche
  l'aggiornamento dopo un update del plugin).
- Con forge `gitlab`, al passo 1c init legge `merge_method` con `glab api projects/:id`: se non è
  `merge`, avvisa che titolo e numero della MR si ricavano dal merge commit e che con squash o
  fast-forward le versioni saranno sbagliate (la release resta attivabile).
- La factory non cambia: i titoli delle PR sono già Conventional Commits.

### Documentazione
README: sezione breve sulla release automatica (cosa fa, permessi, come aggiornarla). Vault: una riga.

## Deciso dall'utente
App deployate; tag + pagina Releases (no `CHANGELOG.md`, `main` protetto ok); ogni PR mergiata;
approccio A; GitHub cloud e GitLab aziendale. GitLab aziendale: MR chiuse con merge commit, tag
`v*` non protetti (il job token basta), runner sconosciuto (da qui l'immagine configurabile).

## Scelte mie (da confermare in lettura)
- Primo rilascio senza tag: da `0.0.0` (`feat` → `0.1.0`, `fix` → `0.0.1`); tag non SemVer ignorati.
- GitLab: ogni push sul base branch è una release, non solo i merge di MR.
- GitLab: chiamata API con `curl`, non `glab`, per non dipendere da un'immagine con glab.
- `next-version.sh` spostato in `skills/init/release/` e riusato dal workflow del plugin.
- Idempotenza dal tag che punta allo SHA, non dal testo delle note.
- Merge ravvicinati fuori ordine (GitHub): il merge più vecchio non crea un tag minore, si aggiunge
  alle note della release più recente; il bump di quella release può restare più basso del dovuto
  (es. un `feat` dentro una patch), accettato.

## Lasciato al builder
Testo esatto dei file YAML, immagine GitLab precisa, formato dei messaggi, struttura dei test.
