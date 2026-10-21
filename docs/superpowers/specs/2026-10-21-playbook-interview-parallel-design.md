# Design: interview, playbook, Definition of Done, builder in parallelo

Data: 2026-10-21 · Stato: bozza da approvare

## Perché

Oggi ogni agente della factory (spec-writer, coder/builder, reviewer) riparte da zero a ogni
feature: rilegge `CLAUDE.md`, `config.md` e buona parte del codebase per ricostruire convenzioni e
pattern già capiti in una feature precedente. La richiesta dell'utente arriva allo spec-writer così
com'è, senza un momento in cui chiarire i dettagli mancanti. Il "fatto" è definito solo dagli
acceptance criteria della singola feature: manca uno standard di progetto. Il build è seriale anche
quando il lavoro si divide in parti indipendenti.

Le quattro aggiunte:

1. **Interview** dopo la richiesta: l'orchestratore fa domande finché può procedere senza indovinare,
   e registra tutto nel playbook di feature.
2. **Playbook di progetto**: le regole stabili (convenzioni, pattern, codice riusabile) vivono in un
   file letto da tutti gli agenti, e crescono solo con l'approvazione dell'utente.
3. **Definition of Done di progetto**: checklist valida per ogni feature, combinata con gli AC della
   feature e usata da reviewer e approver.
4. **Builder in parallelo dentro una feature**: task indipendenti implementati insieme.

## Obiettivi

- Gli agenti leggono prima il playbook di progetto ed esplorano il codice solo per ciò che non copre.
- Nessuna spec parte da requisiti indovinati: le lacune si chiudono nell'interview.
- Ogni feature ha una checklist esplicita di "fatto" (AC + DoD applicabile), visibile in un unico file.
- Le feature divisibili in parti indipendenti si implementano più in fretta.

## Non obiettivi

- **Parallelo tra feature** (più feature della board insieme, worktree separati): progetto
  successivo, da progettare quando playbook e interview saranno in uso. La factory resta "una feature
  alla volta".
- Agenti che modificano il playbook di progetto in autonomia.
- Manutenzione automatica del playbook (deduplica, potatura delle regole vecchie).

## Anti-obiettivi (fallimento anche se tecnicamente funziona)

- L'interview chiede cose che si ricavano dalla richiesta, dal playbook o dal codice.
- Il playbook di progetto diventa un documento lungo che costa più leggere che esplorare il codice.
- Una regola sbagliata entra nel playbook senza che l'utente l'abbia vista.
- I builder in parallelo si pestano i piedi sugli stessi file o rendono il rework più confuso di oggi.
- La factory perde la semplicità attuale: chi la guarda deve capirla in pochi minuti
  (principio del vault, `vault/Software factory.md`).

## Il nuovo loop

Stati: `queued → interview → spec → spec-review → build → review → approve → pr-open → merged`,
più `needs-human`. Il nuovo stato `interview` si comporta come gli altri: resume dalla board,
riga di log a ogni transizione.

**Compatibilità** (decisione dell'utente): non ci sono feature in corso da preservare. All'entry
point, una feature attiva senza `features/<id>/playbook.md` torna allo stato `interview`, con una
riga di log. Gli agenti gestiscono solo il formato nuovo.

```
feature → interview (orchestratore + utente) → playbook di feature
        → spec-writer → approvazione spec (spec + checklist)
        → build: task in parallelo (coder/builder per task) → gate → committer
        → review in parallelo (checklist per ambito) → approver
        → revisione regole proposte (utente) → PR
```

## File

```
factory/
├── config.md                 committato (invariato)
├── playbook.md               NUOVO, committato: regole di progetto + Definition of Done
├── board.md
└── features/<id>/
    ├── feature.md
    ├── playbook.md           NUOVO: richiesta, Q&A, decisioni dell'agente, checklist di "fatto"
    ├── spec.md               ora con la sezione Tasks; gli AC stanno nel playbook di feature
    ├── rule-proposals.md     NUOVO: regole proposte dagli agenti, raccolte dall'orchestratore
    ├── gate-r<N>.md
    ├── reviews/r<N>-<reviewer>.md
    └── decision.md
```

`.gitignore` del progetto target (scritto da Init) diventa:

```
factory/*
!factory/config.md
!factory/playbook.md
```

## 1. Playbook di progetto — `factory/playbook.md`

Contenuto, una regola per riga, ognuna con il path di riferimento quando esiste:

```markdown
# Project playbook

## Conventions
- Servizi in `src/services/`, sempre con interfaccia `I<Name>Service`.

## Patterns
- Nuovo endpoint REST: seguire `src/api/orders/OrdersController.cs`.

## Reusable code
- Validazione email: `src/shared/validation/email.ts` (non riscriverla).

## Don'ts
- Non toccare `legacy/`.

## Definition of Done
- [code] Ogni AC ha almeno un test automatico o un passo manuale preciso.
- [gate] Build, lint e test verdi.
- [ui] Nessun testo visibile hardcoded fuori dai file di localizzazione.
- [security] Nessun segreto nel codice o nella configurazione committata.
```

**Chi lo legge**: tutti gli agenti, per primo. Le istruzioni di ogni agente passano da "leggi
`CLAUDE.md` ed esplora" a "leggi il playbook di progetto; esplora il codice solo per ciò che non
copre". `CLAUDE.md` resta letto se presente.

**Chi lo scrive**: solo l'orchestratore, solo con l'approvazione dell'utente.

**Creazione**:
- `init` produce una bozza leggendo `CLAUDE.md`, `config.md` (sezione note) e il codebase, inclusa
  una DoD iniziale adatta allo stack. L'utente la approva o la modifica, poi viene scritta.
- Progetti già inizializzati senza `factory/playbook.md`: all'entry point l'orchestratore propone la
  stessa bozza prima di lavorare sulla feature, e aggiunge `!factory/playbook.md` al `.gitignore`.
- In entrambi i casi l'orchestratore **non committa**: come oggi per `config.md`, scrive i file,
  chiede all'utente di committarli e si ferma. Così non ci sono commit diretti sul branch base e la
  precondizione "working tree pulito" del build resta valida.

**Crescita**: vedi "Regole proposte" sotto.

## 2. Interview — stato `interview`

Condotta dall'**orchestratore** (i subagent non possono parlare con l'utente).

1. Legge `feature.md`, `factory/playbook.md` e le parti del codice coinvolte.
2. Elenca per sé le lacune: tutto ciò che non si ricava dalla richiesta, dal playbook o dal codice,
   più i dettagli non specificati (comportamento in errore, casi limite, permessi, testi visibili,
   dati, compatibilità).
3. Fa **una domanda alla volta**: ogni risposta orienta la successiva. Usa AskUserQuestion quando
   la domanda ha opzioni naturali, altrimenti una domanda aperta in chat.
4. Dopo ogni risposta aggiorna subito `features/<id>/playbook.md`, così un'interview interrotta
   riprende da dove era rimasta.
5. **Si ferma** quando può scrivere ogni acceptance criterion senza indovinare niente.
   Se l'utente lascia la decisione all'agente ("fai come ritieni"), la scelta va registrata come
   *decisione dell'agente* e l'utente la rivede all'approvazione della spec.
6. Se la richiesta è già completa, l'interview si chiude senza domande e lo registra.

Poi stato `spec`.

Playbook di feature dopo l'interview:

```markdown
# <id> — <titolo breve>

## Request
<testo di feature.md>

## Interview
**Q1.** ...
**A1.** ...

## Agent decisions
- <decisione> — perché

## Done checklist
(compilata dallo spec-writer)
```

## 3. Spec e checklist di "fatto"

Lo spec-writer legge anche il playbook di feature e quello di progetto. Non ripete domande già fatte.
Se trova comunque una lacuna, la mette in `## Open questions` come oggi; l'orchestratore la pone
all'utente durante `spec-review` e registra la risposta nel playbook di feature.

**Checklist di "fatto"**: lo spec-writer compila `## Done checklist` nel **playbook di feature**,
con due parti:

```markdown
## Done checklist
| id | item | owner | verified by |
|----|------|-------|-------------|
| AC1 | <criterio osservabile> | code | test `...` |
| AC2 | ... | ux | passo manuale: ... |
| DoD-1 | Ogni AC ha un test o passo manuale | code | |
| DoD-3 | Nessun testo hardcoded | n/a | feature solo backend |
```

- Gli AC della feature stanno **solo** qui, non più in `spec.md`, per evitare due copie che
  divergono. `spec.md` rimanda alla checklist.
- Ogni voce ha un `owner`: `gate`, `code`, `security`, `ux`, `ui`, oppure `n/a` con il motivo.
  Le voci DoD ereditano l'owner dal tag nel playbook di progetto.
- Ogni owner di una voce non `n/a` deve comparire nei `reviewers` della spec: se una voce si
  applica, lo spec-writer aggiunge il reviewer corrispondente. Con `ui_review: none` le voci `ux` e
  `ui` sono `n/a` d'ufficio.

All'approvazione della spec l'orchestratore mostra: titolo, task, checklist completa, decisioni
dell'agente, out of scope.

## 3b. Branch per tipo: feature o hotfix

Ogni feature resta su un branch separato (decisione dell'utente), ma il prefisso dipende
dall'analisi invece di essere sempre `factory/<id>`:

- `feature/<id>`: nuovo comportamento o modifica di un comportamento esistente;
- `hotfix/<id>`: correzione di un difetto in un comportamento che dovrebbe già funzionare.

Lo spec-writer decide il tipo in base a richiesta e interview e lo scrive nel frontmatter di
`spec.md` (`kind: feature | hotfix`, con una riga di motivo nella spec). L'utente lo vede e può
cambiarlo all'approvazione della spec. Dopo l'approvazione l'orchestratore crea il branch
`<kind>/<id>` da `base_branch`. La board ottiene una colonna `branch`.

*Mia scelta:* entrambi i tipi partono da `base_branch` e la PR va verso `base_branch`. Non c'è un
branch base separato per gli hotfix: si può aggiungere in futuro con una chiave in `config.md`.
Il committer accetta solo `feature/<id>` o `hotfix/<id>`, e per gli hotfix usa di default il tipo
`fix` nel primo commit.

## 4. Builder in parallelo dentro la feature

`spec.md` ottiene una sezione `## Tasks`; la `complexity` passa dal frontmatter della spec al
singolo task:

```markdown
## Tasks
| id | what | files (owned) | depends on | complexity |
|----|------|---------------|------------|------------|
| T1 | API reset password | `src/api/auth/**` | — | complex |
| T2 | Form reset password | `web/src/pages/reset/**` | — | simple |
| T3 | Email template | `templates/reset.html` | T1 | simple |
```

Regole per lo spec-writer:
- Divide in task solo se ne escono almeno due con file disgiunti. Altrimenti un solo task:
  il comportamento è quello di oggi.
- Ogni file modificato appartiene a un solo task. I file condivisi (es. registrazione DI, routing)
  vanno in un task e gli altri task ne dipendono.

Orchestratore, stato `build`:
- Lancia **in un solo messaggio** gli implementer dei task senza dipendenze aperte; quando finiscono,
  quelli sbloccati. Routing per task: `simple` → coder, `complex` → builder; `ESCALATE` del coder
  vale per quel task.
- Ogni implementer riceve: feature dir, spec, task id, lista dei file posseduti, config, playbook.
  Modifica solo i propri file.
- Al termine, `git status --porcelain`: se un file modificato non appartiene a nessun task o
  appartiene a un task diverso da chi l'ha toccato, l'orchestratore lo segnala nel log e
  l'approver lo vedrà come diff fuori dalla spec.
- **Gate e committer una sola volta**, quando tutti i task sono finiti.

**Comandi durante il build parallelo**: con più implementer nello stesso working tree, build e
test completi vedrebbero il codice a metà degli altri task e si contenderebbero gli output
(`bin/obj`, `dist`, lockfile). Quindi:
- con **un solo task** gli implementer si comportano come oggi (build, lint, test fino al verde);
- con **task in parallelo** non eseguono i comandi completi di `config.md`. Eseguono solo test e
  lint limitati ai propri file quando lo stack lo permette (es. `vitest <path>`, `pytest <path>`,
  `dotnet test --filter`), altrimenti nessuno. L'autorità è il gate unico finale;
- il criterio di `ESCALATE` del coder "non arrivo al verde dopo tre tentativi" si applica ai soli
  test limitati al task.

**Rework**:
- Punti bloccanti delle review: ogni punto (`path:line`) torna all'implementer del task che possiede
  quel file. Gli implementer coinvolti lavorano in parallelo, gli altri no.
- Fallimento del gate: va a un solo implementer, quello del task proprietario se il file è
  identificabile dall'output, altrimenti il builder della feature (se c'è un task complex) o il
  coder.

## 5. Review e approvazione con la checklist

- Ogni reviewer riceve anche il playbook di feature. Oltre a Blocking / Non-blocking, il file di
  review ha una tabella delle voci della checklist con il suo `owner`:

  ```markdown
  ## Checklist
  | id | result | evidence |
  |----|--------|----------|
  | AC1 | ok | `tests/auth/reset.spec.ts::expired token` |
  | DoD-1 | fail | AC2 senza test |
  ```
  Una voce `fail` è un punto bloccante (→ `verdict: CHANGES`).
- Dal round 2 la tabella resta **completa**: il reviewer riporta tutte le sue voci, verifica di
  nuovo quelle in `fail` e quelle toccate dai nuovi commit, e copia le altre dal round precedente.
  L'approver legge quindi solo l'ultimo round.
- Le voci con owner `gate` le verifica l'orchestratore leggendo l'ultimo `gate-r<N>.md`.
- L'approver verifica che **ogni voce** della checklist non `n/a` abbia evidenza, al posto dei soli
  AC di oggi. La tabella in `decision.md` e nel body della PR diventa la checklist completa.

## 6. Regole proposte

- Gli agenti non scrivono `rule-proposals.md` (reviewer e implementer girano in parallelo).
  Ognuno mette le proprie proposte in una sezione `## Rule proposals` del proprio output:
  spec-writer in `spec.md`, reviewer nel file di review, implementer nella risposta. Una proposta
  è una riga nel formato del playbook, con sezione di destinazione e motivo.
- L'orchestratore le raccoglie in `features/<id>/rule-proposals.md`, scartando i doppioni e quelle
  già presenti nel playbook.
- **Quando**: dopo `APPROVE` dell'approver e **prima** di aprire la PR. L'orchestratore mostra le
  proposte una alla volta: approva / modifica / scarta. Le regole approvate vengono aggiunte a
  `factory/playbook.md` e committate sul branch della feature dall'orchestratore
  (`docs(factory): update playbook`), così entrano nella stessa PR e passano dalla review umana.
- Una feature che finisce in `needs-human` conserva le proposte: vengono mostrate quando la
  feature arriva ad `approve`.

## Modifiche per file del plugin

| File | Modifica |
|------|----------|
| `skills/factory/SKILL.md` | stato `interview`; branch `<kind>/<id>` e colonna `branch` nella board; bozza playbook in Init ed entry point; build per task in parallelo e rework per proprietario; voci `gate` della checklist; raccolta e revisione regole prima della PR; `.gitignore` con `!factory/playbook.md` |
| `agents/spec-writer.md` | `kind: feature \| hotfix` nel frontmatter; legge i due playbook; scrive `## Done checklist` nel playbook di feature; sezione `## Tasks`; `complexity` per task; `## Rule proposals` |
| `agents/coder.md`, `agents/builder.md` | branch `<kind>/<id>` invece di `factory/<id>`; leggono il playbook; lavorano su un task e sui soli file posseduti; `ESCALATE` per task; proposte di regole nella risposta |
| `agents/review-*.md` (4) | leggono i playbook; tabella `## Checklist` per le proprie voci; `fail` = blocking; `## Rule proposals` |
| `agents/approver.md` | evidenza per ogni voce della checklist; tabella checklist in `decision.md` |
| `agents/committer.md` | branch atteso `feature/<id>` o `hotfix/<id>`; tipo `fix` di default per gli hotfix (il commit del playbook lo fa l'orchestratore) |
| `vault/Software factory.md` | diagramma, tabella Contracts e struttura file aggiornati |

## Lasciato al builder

- Formulazione esatta dei prompt degli agenti, mantenendo lo stile conciso attuale.
- Come l'orchestratore riconosce il file proprietario dall'output del gate.
- Limite di lunghezza del playbook di progetto e avviso quando lo supera.

## Scelte mie, da verificare

- AC solo nel playbook di feature e non più in `spec.md`, per avere una sola copia.
- Revisione delle regole **prima** di aprire la PR invece che dopo: così la modifica al playbook
  entra nella PR della feature senza commit diretti sul branch base.
- Tag di `owner` sulle voci DoD per assegnarle al reviewer giusto.
- Proposte di regole negli output dei singoli agenti, raccolte dall'orchestratore, per evitare
  scritture concorrenti sullo stesso file.
- Il gate dopo il rework parallelo resta unico e seriale.
- Con task in parallelo gli implementer eseguono solo test e lint limitati ai propri file.
- La bozza iniziale del playbook non viene committata dall'orchestratore: la committa l'utente,
  come oggi `config.md`.
- Se una voce della checklist si applica, il suo reviewer entra nella lista `reviewers`.
- Dal round 2 le tabelle checklist dei reviewer restano complete.
