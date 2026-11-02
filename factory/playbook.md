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
- In `.github/workflows/` user-written event fields (PR title, body, branch) reach steps only through `env` and are used quoted, never as `${{ ... }}` inside `run:`: a PR title must not be able to inject shell code.
- After a Claude Code update, the types in `.claude-plugin/types/` are regenerated and committed in the same PR: CI installs the version written on their first line, so types and CLI always change together.
- CI steps that must run even after an earlier failure use `if: ${{ !cancelled() && steps.<setup>.outcome == 'success' }}`, gated on the setup step: one failing test does not hide the others, and nothing runs on a broken setup.
- Workflows on PR events use `pull_request`, never `pull_request_target`, unless the job checks out no PR code: fork code must not get secrets or write tokens.
- Every `claude plugin eval` command written in the README passes `--no-publish`: by default the CLI publishes the report (prompts, verdicts) to claude.ai, while `README.md` `### Skill evals` promises results stay local.
- A mod hook that can refuse a call (`{ deny }`) fails open on every error or unknown state: `hooks/register.tsx` already wraps its logic in `quiet`, and a guard that throws must not stop a normal session or another plugin's agents.
- A guard pattern that allows a write checks the path against the known roots (checkout and worktrees), not only its suffix: in `hooks/guard.ts` the `(^|/)factory/...` patterns also match paths outside the repo, which weakens "own output file only".
- A shell command tokenizer in the mod keeps quoted words whole (spaces inside quotes do not split tokens) and rescans their content for nested commands: in 016 r1 `git -C "<dir with spaces>" push` bypassed the guard.
- When the guard tokenizer sends quoted content to one check (git), it sends it to the other checks of the same rule too, or the spec says why not: `hooks/guard.ts` sends `nested` segments to `gitInvocations` but not to `leadingWrite`, so `bash -c "x; rm -rf src"` passes for read-only agents.
- A fail-open test raises the error inside the code that must absorb it and checks that the call reaches `next`: in 016 r1/r2 the AC10 test passed a non-string `command`, which was rejected before the guard logic, so the `catch` never ran.
## Patterns
- New forge: add `skills/factory/forges/<forge>.md` with the same sections as `github.md` (auth, open-pr, pr-state, issues-enabled, create-issue, ...), then the detection table in `skills/init/SKILL.md` and `parseForge` in `hooks/i18n.ts`.
- New subagent: `agents/<name>.md` with frontmatter `name`, `description` ("devflow factory - ... Spawned by /devflow:factory, not for direct use."), `tools`, `model`.
- Shell script: `set -u`, a sibling `test-<name>.sh` against a temp repo with stubbed CLIs (`.github/scripts/test-release.sh`).
- New forge operation: add a `## <operation>` section to all four files in `skills/factory/forges/` (`git.md` with a manual fallback) and list it in step 1 of the factory entry point, without a count that goes stale.
- Before a `git worktree remove` or `git branch -D` on a path read from a feature file, check that the path is listed in `git worktree list --porcelain` on the expected branch: an edited or stale `checkout:` line must not remove an unrelated clean worktree.
- Eval case: `evals/<group>/<case>/case.yaml` + `scaffold.sh` starting with `#!/usr/bin/env bash` and `set -eu`, tagged `shell` or `no-shell`: the split is what lets the suite run on native Windows.
- Every eval `scaffold.sh` checks that the cwd is empty as its first statement after `set -eu`, before any write (git or not), and exits otherwise: `evals/factory/pr-open-merged/scaffold.sh` runs `git reset --hard HEAD~1` and `evals/spec-checker/known-gap/scaffold.sh` writes `factory/config.md`, which would damage the devflow checkout if run by hand outside `claude plugin eval --scaffold`.
- Parts of a skill needed only in some cases go in `references/<area>.md` in its base directory, with a pointer in `SKILL.md` that says when to read them: `skills/factory/SKILL.md` reached 522 lines loaded whole on every run (~575k tokens/run, issue #25), and the pointers keep the core small as the skill grows.
- An eval case's prompt or `append_system_prompt` never names the commands, scripts or flags its `tool_used` graders match: the note added to `evals/factory/pr-open-merged/case.yaml` could otherwise make `pull --ff-only` or `branch -D` pass without the skill prescribing them.
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
