# Project playbook

## Conventions
- Skills, agents, forges, README and CHANGELOG are written in English; code comments in `hooks/` are in Italian.
- Skills and agents are imperative markdown prompts, short paragraphs, wrapped at ~100 columns: follow `skills/factory/SKILL.md` and `agents/implementer.md`.
- Mod logic lives in pure modules (`hooks/board.ts`, `flow.ts`, `feature.ts`, `attention.ts`, `svg.ts`); only `hooks/register.tsx` talks to the engine (`claude-code` hooks, atoms, panes).
- Shared types go in `types/index.d.ts`, not in the modules.
- Every pure module has a `<name>.test.ts` next to it, using `claude-code/testing` (`hooks/board.test.ts`).
- User-facing pane texts go through `hooks/i18n.ts`: add every new key to both `en` and `it`.
- The plugin version, `CHANGELOG.md` and tags are written only by `.github/workflows/release.yml`.
- Agents that run git or project commands use the `workdir` they receive (`git -C <workdir>`), never the implicit cwd: worktree features do not run in the main checkout.
- Placeholders derived from feature ids or user text (`<path>`, `<kind>/<id>`) are quoted in every shell command the skills prescribe.
- Run state that must survive a resume goes in `$.store` under a key with the session id; `$.state` covers only a hot reload.
- A test rewritten because behaviour changed replaces each removed assertion with an equivalent one, so coverage is not lost silently.
- In forge commands the PR title is passed in single quotes or from a file, never inside double quotes: a title derived from user text may contain `$(...)` or backticks.
- Every new agent in `agents/` that the pane must show is added to `phaseOfAgent` in `hooks/flow.ts` with a test.
- Tests with multi-line prompt strings build them with `[...].join('\n')`, never a literal line break inside quotes.
- Every git command the factory skill prescribes for a feature uses an explicit `git -C "<dir>"`, never the session cwd: once a session can live in a worktree, commands without `-C` run in the wrong checkout.
- Git `--format=%(...)` arguments in skill commands are single-quoted: bash rejects an unquoted `%(refname:short)`.
- When the factory skill states a general rule for a mode (workdir, checkout), per-step text refers to that rule instead of restating a narrower condition.
- External tools started by `.mcp.json` are pinned to an exact version (never `latest` or a range), and that version is cited in the README.
- Updating a tool pinned in `.mcp.json` includes reading its upstream changelog, not only checking that the tool names used by the agents still exist.
- Notes in `factory/config.md` about what the repo contains are checked on a clean clone before they are written.
## Patterns
- New forge: add `skills/factory/forges/<forge>.md` with the same sections as `github.md` (auth, open-pr, pr-state, issues-enabled, create-issue, ...), then the detection table in `skills/init/SKILL.md` and `parseForge` in `hooks/i18n.ts`.
- New subagent: `agents/<name>.md` with frontmatter `name`, `description` ("devflow factory - ... Spawned by /devflow:factory, not for direct use."), `tools`, `model`.
- Shell script: `set -u`, a sibling `test-<name>.sh` against a temp repo with stubbed CLIs (`.github/scripts/test-release.sh`).
- New forge operation: add a `## <operation>` section to all four files in `skills/factory/forges/` (`git.md` with a manual fallback) and list it in step 1 of the factory entry point, without a count that goes stale.
- Before a `git worktree remove` or `git branch -D` on a path read from a feature file, check that the path is listed in `git worktree list --porcelain` on the expected branch: an edited or stale `checkout:` line must not remove an unrelated clean worktree.
## Reusable code
- Board parsing: `hooks/board.ts` (`parseBoard`, `summarize`, `isTerminal`).
- Gate and review outcomes: `hooks/feature.ts` (`parseGate`, `parseReview`).
- Forge parsing and names: `hooks/i18n.ts` (`parseForge`, `FORGE_NAME`).
- Colours: `hooks/palette.ts`; never hard-code colours in `svg.ts` or `terminal.tsx`.
- Board-level selection helpers (`featureOfArg`, `soleActive`, `bindFeature`) live in `hooks/board.ts`, not in `register.tsx`.
## Don'ts
- Do not touch `vault/`, `.superpowers/`, `node_modules/`, `.claude/`.
- Do not edit the version in `.claude-plugin/plugin.json` or `CHANGELOG.md` by hand.
- Do not add a `package.json` or runtime dependencies to the mod.
- Do not change `skills/init/release/*` without keeping `.github/scripts/release.sh` in line where they share logic.
## Definition of Done
- [gate] Build, lint and tests are green.
- [code] Every acceptance criterion has an automated test or a precise manual step.
- [security] No secrets in code or committed configuration.
- [code] A changed shell script passes its `test-*.sh` (`bash <dir>/test-<name>.sh`).
- [code] A behaviour change visible to users is described in `README.md`.
- [ux] New pane texts exist in both `en` and `it` and the terminal fallback shows the same data as the SVG.
- [security] Shell scripts quote every variable that comes from a PR title, body or branch name.
