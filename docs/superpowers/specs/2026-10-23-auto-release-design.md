# Release automatica del plugin devflow

## Intento
Ogni PR mergiata su `main` diventa una release: versione in `plugin.json` aggiornata, voce in
`CHANGELOG.md`, tag `vX.Y.Z`, GitHub Release. Claude Code usa `version` di `plugin.json` per
capire se un plugin installato va aggiornato: senza bump un merge non arriva agli utenti.

## Obiettivi / non obiettivi
- Obiettivi: nessun passaggio manuale dopo il merge; versione calcolata dal titolo della PR.
- Non obiettivi: gestione della versione nei progetti della factory (design separato);
  ricreare il tag mancante `v0.5.0`.
- Anti-obiettivi: conflitti tra PR aperte in parallelo; dipendenze esterne (Node, release tool).

## Approcci
- **A. Action al merge che committa la release su `main`** — scelto dall'utente. Versione
  calcolata dopo il merge: nessun conflitto tra PR. Un bot committa su `main` (oggi non protetto).
- B. Bump dentro la PR — scartato: PR parallele calcolano la stessa versione e confliggono.
- release-please / semantic-release — scartati: richiedono un merge manuale della release PR o
  portano Node per aggiornare un solo JSON.

## Design
- File: `.github/workflows/release.yml`, solo bash + `jq` + `gh` (presenti sui runner GitHub).
- Trigger: `pull_request` `closed` su `main` con `merged == true`. Fonte del bump = **titolo della
  PR** (non il commit: il repo ammette anche merge commit e rebase).
- Bump (scelta mia): `<type>!:` o `BREAKING CHANGE` nel body → major, ma finché la versione è
  `0.x` diventa minor (convenzione SemVer 0.x); `feat` → minor; tutto il resto, titoli non
  conventional inclusi → patch.
- Bump manuale: se la versione in `plugin.json` su `main` è già maggiore dell'ultimo tag `v*`
  (qualcuno l'ha alzata nella PR), si usa quella senza bump ulteriore.
- Release: checkout di `main` aggiornato (non lo SHA del merge), aggiorna `plugin.json`, aggiunge
  in testa a `CHANGELOG.md` `## vX.Y.Z — YYYY-MM-DD` + `- <titolo PR> (#N)`, commit
  `chore(release): vX.Y.Z` come `github-actions[bot]`, tag annotato, push, `gh release create`
  con la voce del changelog come note.
- Sicurezza: `permissions: contents: write`; `concurrency: release` senza cancel, così due merge
  ravvicinati producono due release in sequenza. Il push con `GITHUB_TOKEN` non riattiva
  workflow: nessun loop.
- `CHANGELOG.md` iniziale con la voce `v0.6.0` (#2).

## Lasciato al builder
Parsing esatto del titolo (regex), formato dei messaggi d'errore, nome dello step.
