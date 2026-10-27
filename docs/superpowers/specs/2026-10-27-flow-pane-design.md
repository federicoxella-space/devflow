# Pannello del flusso devflow (mod)

Mockup: [`2026-10-27-flow-pane-mockup.svg`](2026-10-27-flow-pane-mockup.svg) (build round 2 dopo un
rientro dalla review security).

## Intento
Un pannello accanto alla chat, nella desktop app di Claude Code, che disegna il loop di devflow e
anima la fase (o le fasi) in corso, arricchito con i dati live degli agenti (task, modello, tempo,
strumento in uso). Serve a due pubblici con lo stesso disegno:

- l'utente, che tiene d'occhio a colpo d'occhio una feature in esecuzione mentre fa altro;
- chi deve capire come funziona devflow: a riposo il diagramma spiega il flusso da solo.

Ogni momento in cui devflow aspetta l'utente deve raggiungerlo anche se è su un'altra finestra.

## Obiettivi
- Linea verticale delle fasi: intervista → spec → build → gate → commit → review → approver →
  rule proposals e PR. Le frecce di ritorno (gate FAIL, review CHANGES, hook FAIL, ESCALATE) sono
  sempre leggibili.
- Nella fase attiva, una card per agente con: task (`description` dello spawn), tipo di agente,
  badge `modello · effort`, strumento in uso o "Sta ragionando…", tempo trascorso al secondo.
- Rientro: motivo breve sotto il titolo della fase che riparte (da `reviews/rN-*.md` o
  `gate-rN.md`) e freccia rossa animata che scorre dalla fase di origine verso quella di
  destinazione.
- Intestazione: id feature, branch, badge `FASE · Rn/max`, riga di metriche (fase, agenti attivi,
  round, tempo totale).
- Toast e notifica di sistema in ogni momento che richiede l'utente (tabella sotto).
- Senza feature attiva: riepilogo del board.
- Tooltip su ogni fase con il suo contratto (cosa legge, cosa scrive, come decide), dalla tabella
  Contracts di `vault/Software factory.md`.

## Non obiettivi
- Seguire una factory che gira in un'altra sessione o finestra sullo stesso repo: il pannello
  mostra solo la sessione in cui è aperto (scelta dell'utente). Nessun watch o polling di `factory/`.
- Token e costi (sono già in agent-monitor).
- Agire sulla factory dal pannello (avviare, fermare, approvare): il pannello osserva.
- Storico delle feature passate oltre al riepilogo del board.

## Anti-obiettivi
- Un diagramma che mente: meglio una fase mostrata in ritardo che una fase sbagliata.
- Modificare l'orchestratore perché il pannello funzioni (al massimo una riga di log nel board).
- Rendere devflow inutilizzabile o rumoroso dove la mod non gira (terminale, `claude -p`).

## Approcci
- **A. Mod dentro il plugin devflow, deduzione passiva** — scelto dall'utente. Il modulo vive in
  `devflow/hooks/` e si installa con devflow. Le fasi macro arrivano dalla colonna `state` di
  `factory/board.md`; agenti, task e tempi da `agent.spawn` e `$.agent.list()`; gate e rientri dalle
  chiamate Bash con i comandi di `factory/config.md` e dai file `gate-rN.md` / `reviews/`. Zero
  modifiche all'orchestratore; i passaggi brevi (committer) sono dedotti, non dichiarati.
- B. Mod + event log scritto dall'orchestratore (`features/<id>/events.jsonl`) — scartato: più
  istruzioni e turni per l'orchestratore, e se il modello salta una riga il diagramma mente.
- C. Plugin separato `devflow-viz` — scartato: due install e versioni da allineare con il formato
  del board.

## Design

### Fonti dei dati
| Dato | Fonte |
|---|---|
| Feature, stato, round, branch, PR | `factory/board.md` (riga + log), riletto a ogni `Write`/`Edit` su quel file e a `session.start` |
| Fase attiva | stato del board, raffinato dagli agenti vivi (`devflow:*` in `subagentType`) e dai comandi del gate |
| Agenti | `agent.spawn` (description, subagentType, model, effort), `$.agent.list()` (status) |
| Strumento in uso | `tool.call` con `agentId` dell'agente |
| Gate | `tool.call` Bash che corrisponde ai comandi `build`/`lint`/`test` di `config.md`; esito da `gate-rN.md` |
| Esiti review | frontmatter `verdict` di `reviews/rN-<name>.md`; motivo = primo item bloccante |
| Escalation | spawn di `devflow:builder` per un task già assegnato a `devflow:coder` nello stesso round |
| Attesa utente | `tool.call` di `AskUserQuestion` sul loop principale mentre è attivo `/devflow:factory` |

La mod si attiva solo se nel repo esiste `factory/config.md`; altrove non fa nulla.

**Scelte del designer (da confermare in lettura)**
- *Feature attiva*: la fase anima solo mentre `/devflow:factory` gira in questa sessione, dalla
  chiamata `Skill` fino alla fine del lavoro o allo stop. Se il turno principale finisce
  normalmente mentre la feature è in `interview`, `spec`, `spec-review` o `approve`, la factory
  sta facendo una domanda in testo semplice: la run resta attiva, la fase passa a "tocca a te" e
  parte la notifica, come per una domanda con AskUserQuestion. Il prompt successivo dell'utente è
  la risposta e la fase torna in corso. Esc, un errore o la fine del turno in qualsiasi altro stato
  chiudono la run. Una riga ferma in uno stato intermedio senza orchestratore attivo è mostrata nel
  riepilogo del board come "ferma in `<stato>`", mai animata.
- *Tempi per fase*: misurati dalla mod ai cambi di stato e salvati in `$.store` per feature, così
  sopravvivono a un riavvio; per le fasi viste solo dal log del board si usa la precisione al
  minuto. Il conteggio delle domande dell'intervista è il numero di `AskUserQuestion` visti in
  `interview`; se non noto, si omette.
- *Stato `approve`*: l'approver è "in corso" finché vive il suo agente e "fatto" quando termina;
  il nodo "Rule proposals e pull request" diventa "tocca a te" solo su `AskUserQuestion`, e "in
  corso" dopo, fino a `pr-open`. Senza proposte passa direttamente all'apertura della PR.
- *Card*: solo gli agenti `devflow:*` hanno una card e contano in "agenti attivi". Gli altri
  (Explore, general-purpose, …) sono ignorati: li mostra agent-monitor.

### Notifiche ("tocca a te")
| Momento | Segnale |
|---|---|
| Domanda dell'intervista | `AskUserQuestion` con board in `interview` |
| Approvazione spec | `AskUserQuestion` con board in `spec-review` |
| Rule proposals | `AskUserQuestion` con board in `approve` |
| needs-human | board → `needs-human`, motivo dal log |
| PR aperta | board → `pr-open`, link alla PR |
| Permesso richiesto da un agente | notifica di permesso del motore, se intercettabile (da verificare) |

Ognuno produce `$.ui.toast` + `$.ui.notify` (titolo `devflow · <id>`), una volta per evento.

### Aspetto
Stile di agent-monitor (font monospace, nodi esagonali, card con leggero alone, riga `↳` dello
strumento), senza sfondo proprio: l'SVG usa lo sfondo del pannello e porta due palette.

**Stati delle fasi (esagoni)**
| Stato | Esagono |
|---|---|
| Fatto | pieno sabbia (`#C9B79C` scuro / `#8A7458` chiaro) |
| In corso | pieno bianco caldo, alone che si espande (come agent-monitor v0.3.2) |
| Tocca a te | contorno bianco che pulsa in scala |
| Da fare | contorno grigio |

**Esiti**: pass (review ✓, gate PASS, APPROVE) lime `#A3E635` / `#4D7C0F`; rientro e CHANGES rosso
`#EF4444` / `#DC2626`, sempre con ✓/✕ oltre al colore.

**Modelli** (bordo card, badge, nomi modello nel testo), per famiglia, con la stessa funzione
`family()` di agent-monitor, così un modello nuovo assegnato a un agente è colorato senza patch:
| Famiglia | Scuro | Chiaro |
|---|---|---|
| fable | `#F59E0B` | `#B45309` |
| mythos | `#22D3EE` | `#0891B2` |
| opus | `#A78BFA` | `#7C3AED` |
| sonnet | `#34D399` | `#059669` |
| haiku | `#60A5FA` | `#2563EB` |
| altro | `#9A8F85` | `#7A7068` |

La stessa palette è proposta per agent-monitor:
[federicoxella-space/claude-agent-monitor#1](https://github.com/federicoxella-space/claude-agent-monitor/issues/1).

**Tema chiaro/scuro**: `@media (prefers-color-scheme)` dentro l'SVG. Da verificare con una prova
che il frame sandbox della desktop app lo propaghi; altrimenti la mod legge `theme` da
`$.config.list()` e genera direttamente la palette giusta.

**Animazioni**: SMIL nell'`Svg` con `isInteractive: true`; i timer avanzano ridisegnando il
pannello ogni secondo (`$.clock.every`) solo mentre qualche agente lavora. La freccia di rientro
termina all'altezza del centro dell'esagono della fase di destinazione e il tratteggio scorre nel
verso della freccia.

### Riepilogo del board (nessuna feature attiva)
Stesso stile, quattro sezioni: in coda (la più vecchia in cima), PR aperte (con link), needs-human
(con motivo), ultime 3 mergiate (con data). Il diagramma torna quando una feature passa in
`interview`.

### Apertura, comandi, superfici, lingua
- Si apre da solo al primo `/devflow:factory` della sessione; un comando del plugin lo apre e chiude
  a mano (`/devflow:panel` o il nome che il motore consente).
- Terminale (nessun `Svg`): righe testuali con gli stessi dati, colori dalle chiavi del tema.
- Testi in italiano, con i18n come agent-monitor.

## Lasciato al builder
- Struttura dei moduli (prendere a modello `claude-agent-monitor/hooks`: `register.tsx`, `svg.ts`,
  `i18n.ts`, test `*.test.ts` con `claude plugin test`).
- Parsing del board e dei file di feature, robusto a righe modificate a mano.
- Layout del riepilogo del board e del fallback da terminale, nello stile descritto.
- Altezza del pannello con molti agenti in parallelo (scroll o compressione delle card).
