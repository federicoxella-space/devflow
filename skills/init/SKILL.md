---
name: init
description: Set up the devflow software factory in the current repo - detect or choose the stack, write factory/config.md, draft the project playbook, create the board.
disable-model-invocation: true
---

# Factory init

You prepare the current repo for `/devflow:factory`. You write `factory/config.md`,
`factory/playbook.md`, `factory/board.md` and the `.gitignore` lines; you never commit on the base
branch: at the end you ask the user to commit.

Talk to the user in their language. Ask **one question at a time** and wait for the answer: the
answer shapes the next question. Use AskUserQuestion when the question has natural options,
otherwise ask in plain text.
Before every choice, give a short context in two or three lines: what is being decided, why it
comes up now, and what each option implies. The user must be able to choose without opening any
file.

## Entry point

`git rev-parse --show-toplevel` must succeed. Then:
- no `factory/config.md` → run every step below;
- `factory/config.md` present, no `factory/playbook.md` → run only steps 3 and 4 (add the
  `!factory/playbook.md` and `!factory/backlog.md` lines to `.gitignore` if missing);
- both present → ask what to redo, with AskUserQuestion `multiSelect`: **Config**, **Forge**,
  **Release**, **Playbook** (none selected = nothing). Config = steps 1, 1a and 2. Forge = only step 1b, then update the forge
  fields of `factory/config.md`; Release = only step 1c, which also updates the release files after
  a plugin update. Before redoing the playbook, warn that it holds rules the user approved and
  offer to keep them in the new draft. A `config.md` without `forge` works as `github`, without
  `release` as `off`, without `workspace` as `ask`, without `worktree_setup` as empty, without `implementer_model` as `sonnet / medium`, without
  `escalation_model` as `opus / medium`: nothing
  to migrate.
  Never touch an existing `factory/board.md`.

## 1. Stack and commands

Detect the stack and propose commands; ask the user to confirm or edit them:

| Found | build | lint | test |
|---|---|---|---|
| `package.json` + react | `npm run build` | `npm run lint` | `npm test -- --run` (vitest) / `npm test -- --watchAll=false` (jest) |
| `angular.json` | `npx ng build` | `npx ng lint` | `npx ng test --watch=false --browsers=ChromeHeadless` |
| `*.sln` / `*.csproj` | `dotnet build` | `dotnet format --verify-no-changes` | `dotnet test` |
| `pom.xml` | | | `mvn -q verify` |
| `build.gradle*` | | | `./gradlew build` |
| `pyproject.toml` | | `ruff check .` | `pytest -q` |

Prefer scripts that already exist in the project. Multiple apps (e.g. React + .NET): chain with `&&`.
`ui_review`: `browser` for web frontends, `static` for CLIs, `none` for backend-only.

**No stack yet** (empty repo, or none of the files above): run a **stack interview** instead. Stop
asking when you can choose without guessing. Find out what the user wants to build (kind of
product, users, scale), constraints (languages and frameworks the team knows, hosting, company
standards, integrations, licences) and preferences. Then recommend one stack with a short reason
and at most one alternative, and ask with AskUserQuestion: **Approve / Choose the alternative /
Change**. From the approved stack, derive the commands and `ui_review` as in the table above.
Write the questions, the answers and the chosen stack with its reason in the notes of `config.md`
and, as the first rules, in `## Conventions` of the playbook draft. Init does not create the
project: step 4 queues a feature that scaffolds it.

## 1a. Workspace

Ask with AskUserQuestion which `workspace` the factory uses for new features: **Ask**
(recommended) / **Branch** / **Worktree**. Context in 2-3 lines: a worktree is a separate folder
with its own branch, so several sessions can build different features in parallel; a branch runs
in the main checkout, one feature at a time; Ask decides per feature. Then propose
`worktree_setup`, the command that prepares a fresh worktree, from the stack: `npm ci` with
`package-lock.json`, `dotnet restore` for .NET, empty when nothing is needed; the user confirms or
edits it.

## 1b. Forge

The platform where the factory opens pull requests. From the host in `git remote get-url origin`:

| Remote host | forge |
|---|---|
| `github.com` | `github` |
| `gitlab.com` | `gitlab` |
| `dev.azure.com`, `ssh.dev.azure.com`, `*.visualstudio.com` | `azure` |
| any other host | ask: **GitLab / Azure DevOps Server / GitHub Enterprise / Git only**; save the host in `forge_host` |
| no `origin` remote | ask **GitHub / GitLab / Azure DevOps / Git only**, then whether it is the cloud service or a company instance (then ask its host for `forge_host`); tell the user the factory needs an `origin` remote before the first build |

`forge_host` is the web/API host (e.g. `gitlab.company.com`), not an SSH alias from `~/.ssh/config`:
if the remote uses one, ask for the real host.

For Azure DevOps Server also ask the collection URL (`azure_org`, e.g.
`https://tfs.company.com/tfs/DefaultCollection`) and the project (`azure_project`), and say that
Server support is prepared but not verified. Git only = any other platform: the factory pushes
the branch and the user opens the pull request by hand.

Then run the **auth** operation of `../factory/forges/<forge>.md`, relative to this skill's base
directory. If it fails, show how to fix it — `gh auth login`, `glab auth login --hostname <host>`,
`az login` + `az extension add --name azure-devops` — and go on: it only blocks the first build.

## 1c. Release

Only with forge `github` or `gitlab`; otherwise write `release: off` and skip this step.
Explain in two lines: every pull request merged into the base branch becomes a release, tag
`vX.Y.Z` plus an entry on the Releases page with the PR title; the version comes from the PR title
(`feat` → minor, breaking → major, anything else → patch); nothing is committed by the CI, so it
works with a protected base branch. Ask **Enable / Skip** → `release: auto | off`.

Enable → copy from `release/` in this skill's base directory, replacing `{{DEVFLOW_VERSION}}` with
`version` from the plugin's `.claude-plugin/plugin.json` (two levels above this skill) and
`{{BASE_BRANCH}}` with `base_branch`:
- `release.sh` and `next-version.sh` → `.devflow/` (overwrite: this is also the update path);
- github → `github-workflow.yml` → `.github/workflows/devflow-release.yml`;
- gitlab → `gitlab-ci.yml` → `.devflow/gitlab-release.yml`, and in `.gitlab-ci.yml` the include
  `- local: .devflow/gitlab-release.yml`: add it to an existing `include:` list, or add `include:`
  with it; if `include:` exists but is not a list, show the line and ask the user to add it. Never
  rewrite the rest of the file. The job runs in `.post`, and GitLab creates no pipeline with
  only .pre/.post jobs: if `.gitlab-ci.yml` is missing, create it as
  ```yaml
  include:
    - local: .devflow/gitlab-release.yml
  stages: [release]
  devflow-release:
    stage: release
  ```
  and if it exists but no other job runs on a push to the base branch, tell the user the release
  job will not run until one does (or to add the same `stages`/`stage` override).

GitLab only:
- `glab api projects/:id` → if `merge_method` is not `merge`, warn: the MR title and number are
  read from the merge commit, so with squash or fast-forward merges versions and notes will be
  wrong. The user can still enable it.
- Tell the user: if the runner cannot pull `alpine` from Docker Hub, set the CI/CD variable
  `DEVFLOW_RELEASE_IMAGE` to an image with bash, git and curl; after the first release job, run
  `glab api --method PUT projects/:id/resource_groups/devflow-release -f process_mode=oldest_first`
  so queued releases run in merge order.

## 2. Config

Write `factory/config.md`:

```markdown
---
base_branch: main
forge: github          # github | gitlab | azure | git
forge_host: ""         # self-hosted only, e.g. gitlab.company.com
azure_org: ""          # Azure DevOps Server only: collection URL
azure_project: ""      # Azure DevOps Server only: project name
build: dotnet build
lint: dotnet format --verify-no-changes
test: dotnet test
ui_review: none        # none | static | browser
dev_server: ""         # browser only, e.g. npm run dev
base_url: ""           # browser only, e.g. http://localhost:5173
max_rounds: 2          # rework rounds after the first review
implementer_model: sonnet / medium  # <model> / <effort>: model of the implementers
escalation_model: opus / medium     # <model> / <effort>: complex tasks and escalated tasks
release: "off"         # auto | off — automatic tag + release on every merged PR (github, gitlab)
workspace: ask         # ask | branch | worktree — where a new feature runs
worktree_setup: ""     # worktree only: command run in a new worktree, e.g. npm ci (empty = none)
---
Notes for every agent: conventions, folders not to touch, how to log in on the dev server, ...

## Commit rules
Optional. Overrides the committer's defaults (e.g. subject in Italian, scope = ticket id).
```

## 3. Playbook draft

Read `CLAUDE.md`, the notes in `factory/config.md` and the codebase (structure, a few
representative modules, tests). Draft `factory/playbook.md`, one rule per line, with a reference
path when there is one. Keep it short: only rules an agent would otherwise have to rediscover.

```markdown
# Project playbook

## Conventions
- Services in `src/services/`, always behind an `I<Name>Service` interface.
## Patterns
- New REST endpoint: follow `src/api/orders/OrdersController.cs`.
## Reusable code
- Email validation: `src/shared/validation/email.ts` (do not rewrite it).
## Don'ts
- Do not touch `legacy/`.
## Definition of Done
- [gate] Build, lint and tests are green.
- [code] Every acceptance criterion has an automated test or a precise manual step.
- [security] No secrets in code or committed configuration.
```

Definition of Done items are `- [<owner>] <item>`, owner one of `gate`, `code`, `security`, `ux`,
`ui`; `DoD-<n>` is the item's position. Always include the two first items above; add stack-specific
ones. Show the draft, apply the user's edits, write the file. From then on it changes only through
rule proposals approved during `/devflow:factory`.

## 4. Board and .gitignore

If `factory/board.md` does not exist, create it:

```markdown
# Factory board

| id | feature | state | round | branch | PR |
|----|---------|-------|-------|--------|----|

## Log
```

After a stack interview, add the row `| 001-scaffold | Scaffold the <stack> project | queued | | | |`
and write `factory/features/001-scaffold/feature.md` with the chosen stack, its reason and "the
`build`, `lint`, `test` commands in `factory/config.md` must work". The first `/devflow:factory`
run builds it through the normal loop.

Append to `.gitignore` the lines that are missing:

```
factory/*
!factory/config.md
!factory/playbook.md
!factory/backlog.md
```

## 5. Hand-over

Ask the user to commit `factory/config.md`, `factory/playbook.md`, `.gitignore` and, with
`release: auto`, `.devflow/` plus the CI file (`.github/workflows/devflow-release.yml` or
`.gitlab-ci.yml`), then to run
`/devflow:factory <feature description>` (or `/devflow:factory` alone to start the scaffold
feature).
