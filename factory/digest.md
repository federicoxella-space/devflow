# Rules digest

Date: 2026-11-17 21:14
Features: 001-worktree-or-branch, 002-pane-survives-reload, 003-risultato-atteso, 004-regole-playbook-in-blocco, 005-modifica-feature-in-pr, 006-implementer-unico, 007-board-unico-worktree, 008-contatore-round-pannello, 009-rilevamento-stack, 010-rimuovere-alias-agenti, 011-playwright-versione-fissa, 012-build-clone-pulito, 013-ci-pull-request, 014-eval-skill, 015-factory-references, 016-guard-vincoli-agenti, 017-board-senza-collisioni, 018-titolo-pr-orchestratore, 019-scansione-segreti, 020-comandi-status-abandon, 021-budget-token, 022-lint-java-python, 023-scaffold-eval-guard, 024-eval-pr-open-merged, 025-create-issue-apici-singoli, 026-board-compatto, 027-playbook-rules-per-feature, 028-plan-skill, 029-rules-digest

Previous digest: none (first run, no date limit).

| # | section | rule | evidence | outcome |
|---|---------|------|----------|---------|
| 1 | Conventions | Skills, agents, forges, README and CHANGELOG are written in English; code com... | skill/agent in inglese | keep |
| 2 | Conventions | Skills and agents are imperative markdown prompts, short paragraphs, wrapped... | path citati esistenti; nata da review/fix nel periodo | keep |
| 3 | Conventions | Mod logic lives in pure modules (`hooks/board.ts`, `flow.ts`, `feature.ts`, `... | elenco senza guard.ts, restore.ts, i18n.ts, palette.ts | modified |
| 4 | Conventions | Shared types go in `types/index.d.ts`, not in the modules. | moduli importano tipi da types/ | keep |
| 5 | Conventions | Every pure module has a `<name>.test.ts` next to it, using `claude-code/testi... | hooks/i18n.ts senza i18n.test.ts | keep |
| 6 | Conventions | User-facing pane texts go through `hooks/i18n.ts`: add every new key to both... | path citati esistenti; nata da review/fix nel periodo | keep |
| 7 | Conventions | The plugin version, `CHANGELOG.md` and tags are written only by `.github/work... | duplicato della regola Don'ts sulla versione | merged |
| 8 | Conventions | Agents that run git or project commands use the `workdir` they receive (`git... | [dup] in 001/007; fix d71ae53, 8d8fecf | merged |
| 9 | Conventions | Placeholders derived from feature ids or user text (`<path>`, `<kind>/<id>`)... | sovrapposta a 45 e 56; fix fdb972f, 51a8657, 255348a | check queued 030-skill-placeholder-quote-check |
| 10 | Conventions | Run state that must survive a resume goes in `$.store` under a key with the s... | nessuna review, gate o fix nel periodo | no evidence |
| 11 | Conventions | A test rewritten because behaviour changed replaces each removed assertion wi... | path citati esistenti; nata da review/fix nel periodo | keep |
| 12 | Conventions | In forge commands the PR title is passed in single quotes or from a file, nev... | path citati esistenti; nata da review/fix nel periodo | keep |
| 13 | Conventions | Every new agent in `agents/` that the pane must show is added to `phaseOfAgen... | phaseOfAgent in hooks/flow.ts | keep |
| 14 | Conventions | Tests with multi-line prompt strings build them with `[...].join('\n')`, neve... | path citati esistenti; nata da review/fix nel periodo | keep |
| 15 | Conventions | Every git command the factory skill prescribes for a feature uses an explicit... | sovrapposta a 11 | merged |
| 16 | Conventions | Git `--format=%(...)` arguments in skill commands are single-quoted: bash rej... | path citati esistenti; nata da review/fix nel periodo | keep |
| 17 | Conventions | When the factory skill states a general rule for a mode (workdir, checkout),... | path citati esistenti; nata da review/fix nel periodo | keep |
| 18 | Conventions | External tools started by `.mcp.json` are pinned to an exact version (never `... | .mcp.json @playwright/mcp@0.0.83 | keep |
| 19 | Conventions | Updating a tool pinned in `.mcp.json` includes reading its upstream changelog... | nessuna review, gate o fix nel periodo | no evidence |
| 20 | Conventions | Notes in `factory/config.md` about what the repo contains are checked on a cl... | nessuna review, gate o fix nel periodo | no evidence |
| 21 | Conventions | In `.github/workflows/` user-written event fields (PR title, body, branch) re... | workflow usano env per PR_TITLE/BODY | keep |
| 22 | Conventions | After a Claude Code update, the types in `.claude-plugin/types/` are regenera... | nessuna review, gate o fix nel periodo | no evidence |
| 23 | Conventions | CI steps that must run even after an earlier failure use `if: ${{ !cancelled(... | path citati esistenti; nata da review/fix nel periodo | keep |
| 24 | Conventions | Workflows on PR events use `pull_request`, never `pull_request_target`, unles... | nessun pull_request_target | keep |
| 25 | Conventions | Every `claude plugin eval` command written in the README passes `--no-publish... | path citati esistenti; nata da review/fix nel periodo | keep |
| 26 | Conventions | A mod hook that can refuse a call (`{ deny }`) fails open on every error or u... | path citati esistenti; nata da review/fix nel periodo | keep |
| 27 | Conventions | A guard pattern that allows a write checks the path against the known roots (... | path citati esistenti; nata da review/fix nel periodo | keep |
| 28 | Conventions | A shell command tokenizer in the mod keeps quoted words whole (spaces inside... | path citati esistenti; nata da review/fix nel periodo | keep |
| 29 | Conventions | When the guard tokenizer sends quoted content to one check (git), it sends it... | path citati esistenti; nata da review/fix nel periodo | keep |
| 30 | Conventions | A fail-open test raises the error inside the code that must absorb it and che... | path citati esistenti; nata da review/fix nel periodo | keep |
| 31 | Conventions | The guard's shell tokenizer, used for Bash and PowerShell, treats a delimiter... | path citati esistenti; nata da review/fix nel periodo | keep |
| 32 | Conventions | When a guard rule moves from substring to token matching, its tests cover eve... | path citati esistenti; nata da review/fix nel periodo | keep |
| 33 | Conventions | A hand-written parser of agent input runs in linear time: failed scans are ca... | path citati esistenti; nata da review/fix nel periodo | keep |
| 34 | Conventions | Timing tests use a wide margin or a step counter instead of a tight threshold... | path citati esistenti; nata da review/fix nel periodo | keep |
| 35 | Conventions | A synchronous hook that parses agent input sets a maximum input length and, a... | MAX_LEN ora in hooks/guard.ts:494, esempio superato | modified |
| 36 | Conventions | Shell scripts in `skills/` avoid GNU-only options (`stat -c`, `date -d`, `sed... | sovrapposta a 41; nessuna violazione nel codice | merged |
| 37 | Conventions | Every new `test-*.sh` gets its own step in `.github/workflows/ci.yml`: CI lis... | tutti i test-*.sh hanno uno step in ci.yml | keep |
| 38 | Conventions | Shell scripts in `skills/` run on macOS bash 3.2: no `mapfile`, associative a... | sovrapposta a 39 | merged |
| 39 | Conventions | When a skill prescribes shell escaping for user text, it quotes the exact idi... | path citati esistenti; nata da review/fix nel periodo | keep |
| 40 | Conventions | In shell lock code, prepare every value before the atomic `mkdir` and read fi... | path citati esistenti; nata da review/fix nel periodo | keep |
| 41 | Conventions | A loop that waits on a lock checks its time limit on every path that retries,... | path citati esistenti; nata da review/fix nel periodo | keep |
| 42 | Conventions | In a shell command a skill prescribes, every placeholder taken from a name or... | sovrapposta a 12; review 017/025 | merged |
| 43 | Conventions | Decisions with permanent effects (PR title → version and tag) are made by an... | nessuna review, gate o fix nel periodo | no evidence |
| 44 | Conventions | A frontmatter field that a forge command uses is validated against the quotin... | path citati esistenti; nata da review/fix nel periodo | keep |
| 45 | Conventions | A compatibility exception for files written before a rule ("skip if the field... | path citati esistenti; nata da review/fix nel periodo | keep |
| 46 | Conventions | A value that goes into a shell command in single quotes is escaped (`'\''`) o... | path citati esistenti; nata da review/fix nel periodo | keep |
| 47 | Conventions | A script that parses `git status --porcelain -z` handles rename/copy codes in... | secrets-scan.sh:59 controlla ancora solo X | keep |
| 48 | Conventions | Changes to secrets scanner allowlists made in a feature (`.gitleaks.toml`, `.... | nessuna review, gate o fix nel periodo | no evidence |
| 49 | Conventions | User text that a skill passes to `board.sh` (note, log) is checked against wh... | path citati esistenti; nata da review/fix nel periodo | keep |
| 50 | Conventions | Before `git worktree remove` on a feature's worktree, the plan shows any igno... | path citati esistenti; nata da review/fix nel periodo | keep |
| 51 | Conventions | A `board.sh` command that writes two files writes the destination first, then... | nessuna review, gate o fix nel periodo | no evidence |
| 52 | Conventions | Shell and awk parsers of `board.md`/`archive.md` match headings with a traili... | path citati esistenti; nata da review/fix nel periodo | keep |
| 53 | Conventions | A skill command whose placeholder is read from a board or archive cell (branc... | sovrapposta a 12; fix fdb972f | merged |
| 54 | Conventions | When a pane layout formula is generalised from a fixed count to n, a test pin... | path citati esistenti; nata da review/fix nel periodo | keep |
| 55 | Conventions | Parsers on the pane render path aggregate with `reduce`, never `Math.max(...a... | Math.max(...) in flow.ts solo su round/fasi, non su righe | keep |
| 56 | Conventions | A guard rule that protects a folder also covers the folder path itself, witho... | path citati esistenti; nata da review/fix nel periodo | keep |
| 57 | Conventions | An awk script that reads two files with `FNR == NR` handles an empty first fi... | path citati esistenti; nata da review/fix nel periodo | keep |
| 58 | Conventions | Scripts that read files out of a git tree checked out from the base branch on... | fusa con la regola successiva sulla stessa riga | modified |
| 59 | Conventions | A skill that commits by itself on the base branch (`plan`, `rules.sh`) commit... | fusa con la regola precedente sulla stessa riga | modified |
| 60 | Conventions | A skill that commits a file under `factory/` first adds its `!factory/<file>`... | path citati esistenti; nata da review/fix nel periodo | keep |
| 61 | Conventions | Values passed to awk, sed or grep programs in a shell script arrive through `... | path citati esistenti; nata da review/fix nel periodo | keep |
| 62 | Patterns | New forge: add `skills/factory/forges/<forge>.md` with the same sections as `... | nessuna review, gate o fix nel periodo | no evidence |
| 63 | Patterns | New subagent: `agents/<name>.md` with frontmatter `name`, `description` ("dev... | nessuna review, gate o fix nel periodo | no evidence |
| 64 | Patterns | Shell script: `set -u`, a sibling `test-<name>.sh` against a temp repo with s... | path citati esistenti; nata da review/fix nel periodo | keep |
| 65 | Patterns | New forge operation: add a `## <operation>` section to all four files in `ski... | nessuna review, gate o fix nel periodo | no evidence |
| 66 | Patterns | Before a `git worktree remove` or `git branch -D` on a path read from a featu... | path citati esistenti; nata da review/fix nel periodo | keep |
| 67 | Patterns | Eval case: `evals/<group>/<case>/case.yaml` + `scaffold.sh` starting with `#!... | tutti gli scaffold.sh conformi | keep |
| 68 | Patterns | Every eval `scaffold.sh` checks that the cwd is empty as its first statement... | guard cwd vuota in tutti gli scaffold.sh; fix 873ce1a | keep |
| 69 | Patterns | Parts of a skill needed only in some cases go in `references/<area>.md` in it... | path citati esistenti; nata da review/fix nel periodo | keep |
| 70 | Patterns | An eval case's prompt or `append_system_prompt` never names the commands, scr... | path citati esistenti; nata da review/fix nel periodo | keep |
| 71 | Patterns | Literal edits that contain `\n` (or other escapes) are made with Edit or a sc... | path citati esistenti; nata da review/fix nel periodo | keep |
| 72 | Patterns | Tests of scripts that resolve external tools with `command -v` run the script... | path citati esistenti; nata da review/fix nel periodo | keep |
| 73 | Reusable code | Board parsing: `hooks/board.ts` (`parseBoard`, `summarize`, `isTerminal`). | path citati esistenti; nata da review/fix nel periodo | keep |
| 74 | Reusable code | Gate and review outcomes: `hooks/feature.ts` (`parseGate`, `parseReview`). | path citati esistenti; nata da review/fix nel periodo | keep |
| 75 | Reusable code | Forge parsing and names: `hooks/i18n.ts` (`parseForge`, `FORGE_NAME`). | path citati esistenti; nata da review/fix nel periodo | keep |
| 76 | Reusable code | Colours: `hooks/palette.ts`; never hard-code colours in `svg.ts` or `terminal... | path citati esistenti; nata da review/fix nel periodo | keep |
| 77 | Reusable code | Board-level selection helpers (`featureOfArg`, `soleActive`, `bindFeature`) l... | path citati esistenti; nata da review/fix nel periodo | keep |
| 78 | Don'ts | Do not touch `vault/`, `.superpowers/`, `node_modules/`, `.claude/`. | path citati esistenti; nata da review/fix nel periodo | keep |
| 79 | Don'ts | Do not edit the version in `.claude-plugin/plugin.json` or `CHANGELOG.md` by... | duplicato di Conventions "plugin version ... release.yml" | removed |
| 80 | Don'ts | Do not add a `package.json` or runtime dependencies to the mod. | path citati esistenti; nata da review/fix nel periodo | keep |
| 81 | Don'ts | Do not change `skills/init/release/*` without keeping `.github/scripts/releas... | nessuna review, gate o fix nel periodo | no evidence |
| 82 | Definition of Done | [gate] Build, lint and tests are green. | checklist approver nelle feature 001-029 | keep |
| 83 | Definition of Done | [code] Every acceptance criterion has an automated test or a precise manual s... | checklist approver nelle feature 001-029 | keep |
| 84 | Definition of Done | [security] No secrets in code or committed configuration. | nessuna review, gate o fix nel periodo | no evidence |
| 85 | Definition of Done | [code] A changed shell script passes its `test-*.sh` (`bash <dir>/test-<name>... | checklist approver nelle feature 001-029 | keep |
| 86 | Definition of Done | [code] A behaviour change visible to users is described in `README.md`. | checklist approver nelle feature 001-029 | keep |
| 87 | Definition of Done | [ux] New pane texts exist in both `en` and `it` and the terminal fallback sho... | nessuna review, gate o fix nel periodo | no evidence |
| 88 | Definition of Done | [security] Shell scripts quote every variable that comes from a PR title, bod... | checklist approver nelle feature 001-029 | keep |
