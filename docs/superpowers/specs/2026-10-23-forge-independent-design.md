# Factory indipendente dalla piattaforma (forge)

## Intento
Oggi `/devflow:factory` funziona solo su GitHub (`gh`). L'utente lavora su GitHub cloud e su un
GitLab aziendale, e vuole poter usare anche Azure DevOps o, se la piattaforma non è supportata, solo
git. È il prerequisito della release automatica (tag + changelog a ogni PR mergiata), che sarà un
design separato costruito sul campo `forge` introdotto qui.

## Obiettivi
- Quattro modalità: `github`, `gitlab`, `azure`, `git` (solo git).
- Istanze aziendali: GitLab self-managed (l'host non si deduce dall'URL), eventualmente Azure DevOps
  Server e GitHub Enterprise con lo stesso meccanismo.
- Progetti devflow esistenti: nessuna migrazione obbligatoria, comportamento invariato.
- In modalità `git`, merge della PR dedotto da git (merge, fast-forward, rebase, squash), con
  fallback manuale sulla board.

## Non obiettivi
- Release automatica, tag, changelog, file di CI: design successivo.
- Bitbucket e altre piattaforme: coperte dalla modalità `git`.
- Distinguere in modalità `git` una PR chiusa senza merge: si imposta `closed` a mano.

## Anti-obiettivi
- Rompere un progetto devflow esistente o chiedergli di rilanciare init.
- Caricare nel contesto dell'orchestratore i comandi di tutte le piattaforme a ogni run.
- Commit sul base branch da parte della factory o di init (regola esistente).

## Approcci
- **A. Un file di riferimento per forge + uno script testato per il rilevamento del merge in
  modalità git** — scelto dall'utente. Coerente con la factory (istruzioni markdown per
  l'orchestratore); codice testato solo dove c'è un algoritmo.
- B. Script `forge.sh <operazione>` con un ramo per piattaforma — scartato: va normalizzato ogni
  output (URL, stati, errori), richiede bash e aggiunge un livello tra l'orchestratore e CLI che
  conosce già.
- Tabella di tutte le piattaforme in `SKILL.md` — scartata: quattro set di comandi in contesto a ogni
  run.

## Design

### Configurazione
In `factory/config.md` (frontmatter):
```yaml
forge: github          # github | gitlab | azure | git
forge_host: ""         # solo per istanze self-hosted, es. gitlab.azienda.it
azure_org: ""          # solo Azure DevOps Server: URL della collection, es. https://tfs.azienda.it/tfs/DefaultCollection
azure_project: ""      # solo Azure DevOps Server: nome del progetto
```
`forge` assente → `github`, gli altri campi assenti → vuoti. Nessun altro cambio al formato esistente.
Azure cloud ricava organizzazione e progetto dal remote (`--detect`); se vuoti, i comandi `az` non
ricevono `--org`/`--project`. Se valorizzati (Server), ogni comando `az repos`/`az boards` riceve
`--org <azure_org> --project <azure_project>`.

### Rilevamento in `/devflow:init`
Nuovo passo dopo "Stack and commands", dall'URL di `git remote get-url origin`:

| Host del remote | forge |
|---|---|
| `github.com` | `github` |
| `gitlab.com` | `gitlab` |
| `dev.azure.com`, `*.visualstudio.com`, `ssh.dev.azure.com` | `azure` |
| nessun remote | non supportato: dire all'utente di aggiungere `origin` e rilanciare init |
| altro | chiedere: **GitLab / Azure DevOps Server / GitHub Enterprise / Solo git**; salvare l'host in `forge_host`; per Azure DevOps Server chiedere anche URL della collection e progetto (`azure_org`, `azure_project`) |

Poi verificare l'operazione `auth` del forge scelto; se fallisce, mostrare il comando di
installazione/login (`gh auth login`, `glab auth login --hostname <host>`,
`az login` + `az extension add --name azure-devops`) e proseguire comunque: serve solo prima del build.
Nel menu "progetto già configurato" di init si aggiunge la voce **Forge** (rifà solo questo passo).

### Operazioni
`SKILL.md` della factory nomina solo queste operazioni; i comandi stanno in
`skills/factory/forges/<forge>.md`, che l'orchestratore legge una volta per run, solo quello attivo.
Ogni file ha la stessa struttura: una sezione per operazione con comando, parsing dell'output ed
errori.

| Operazione | Input | Output |
|---|---|---|
| `auth` | — | ok, oppure messaggio con il comando per sistemare |
| `open-pr` | base, head, titolo, file del body | riferimento da scrivere nella colonna PR della board |
| `pr-state` | riferimento PR, branch, base | `MERGED` / `CLOSED` / `OPEN` / `UNKNOWN` |
| `issues-enabled` | — | `true` / `false` |
| `create-issue` | titolo, file del body, label `devflow`, `deferred`, `enhancement` | URL o id |

Per forge:

| | github | gitlab | azure | git |
|---|---|---|---|---|
| `auth` | `gh auth status` | `glab auth status --hostname <host>` | `az account show` + `az devops` disponibile | `git ls-remote origin` |
| `open-pr` | `git push -u` + `gh pr create` → URL | `git push -u` + `glab mr create` → URL | `git push -u` + `az repos pr create` → URL web della PR | `git push -u`; riferimento = `-`; dire all'utente di aprire la PR a mano |
| `pr-state` | `gh pr view --json state` | `glab mr view -F json` (`merged`/`closed`/`opened`) | `az repos pr show` (`completed`/`abandoned`/`active`) | script `git-merged.sh` → `MERGED` o `OPEN`; mai `CLOSED` |
| `issues-enabled` | `gh repo view --json hasIssuesEnabled` | `glab api projects/:id` → `issues_enabled` | `true` se `az boards` risponde per il progetto | sempre `false` |
| `create-issue` | label + `gh issue create` | label + `glab issue create` | work item con tag `devflow; deferred` (Azure non ha label) | — |

GitHub Enterprise e GitLab self-managed passano `forge_host` (`GH_HOST`, `--hostname` / `GITLAB_HOST`).
`issues-enabled` = `false` → fallback esistente: coda locale in `factory/backlog.md`.

### Modalità git: `skills/factory/scripts/git-merged.sh`
`git-merged.sh <branch> <base>` → stampa `merged`, `squashed` o `open`; exit 0. Il chiamante ha già
fatto `git fetch --prune`. Confronto con `origin/<base>`:
1. `git merge-base --is-ancestor <branch> origin/<base>` → `merged` (merge commit, fast-forward).
2. `git cherry origin/<base> <branch>`: tutte le righe iniziano con `-` → `merged` (rebase merge).
3. Commit temporaneo `git commit-tree <branch>^{tree} -p $(git merge-base origin/<base> <branch>)`,
   poi `git cherry origin/<base> <tmp>`: riga con `-` → `squashed`.
4. Altrimenti `open` (anche squash con conflitti risolti: la riga resta `pr-open`, l'utente la segna
   `merged` a mano).
Branch locale inesistente → `open` con messaggio su stderr. `merged`/`squashed` → `pr-state` = `MERGED`.

### Cambi in `skills/factory/SKILL.md`
- Entry point 2 (stato PR, cleanup): `pr-state` al posto di `gh pr view`; il `-D` è giustificato da
  "il forge (o git-merged.sh) ha confermato il merge". In modalità `git` le righe senza merge
  rilevato restano `pr-open` e lo si dice in una riga.
- Precondizioni prima del build: `auth` al posto di `gh auth status`.
- Deferring logic: `issues-enabled` + `create-issue` al posto dei comandi `gh`; fallback invariato.
- Approval: `open-pr` al posto di `git push` + `gh pr create`; in modalità `git` stato `pr-open`
  con PR `-` e messaggio all'utente.
- Lessico: "PR" resta il termine generico (MR su GitLab, PR su Azure).

### Documentazione
`README.md`: requisiti per forge (CLI e login); riga "Pull request on GitHub" → sulla piattaforma
configurata. Vault: una riga sulla scelta del forge.

## Deciso dall'utente
Azure DevOps: oggi non usato, ma previsto. Cloud supportato come GitHub e GitLab; Server
predisposto (`azure_org`, `azure_project`) ma **non verificato**: il supporto di `az devops` per
Server è parziale e non c'è un'istanza su cui provarlo. `forges/azure.md` lo dichiara in testa.
Nessuna verifica dal vivo di Azure in questo build (nemmeno cloud): solo revisione dei comandi.
Quattro modalità (GitHub, GitLab, Azure DevOps, solo git); approccio A con script; merge in modalità
git dedotto da git con fallback manuale per lo squash; GitHub cloud e GitLab aziendale come casi reali.

## Scelte mie (da confermare in lettura)
- `forge` assente = `github`, perché i progetti esistenti richiedono già `gh`.
- `create-label` assorbita in `create-issue` (cinque operazioni, non sei).
- Azure: tipo di work item per le logiche rinviate = il primo disponibile tra `Issue`, `User Story`,
  `Product Backlog Item` (dipende dal process template).
- `auth` fallita in init non blocca: blocca solo prima del build, come oggi.
- Repo senza remote: non supportato in nessuna modalità (serve `origin` per push e confronto).
- Cleanup (entry point 2): vale per ogni riga `merged` il cui branch locale esiste ancora, anche se
  segnata `merged` a mano dall'utente: la modifica manuale della board vale come conferma del merge
  e giustifica il `-D`. L'aggiornamento del base branch si fa se almeno un branch è stato
  eliminato o una riga è diventata `merged` nel run.

## Lasciato al builder
Testo esatto dei file `forges/*.md`, flag precisi delle CLI per ottenere output JSON, messaggi
all'utente, struttura dei test dello script.
