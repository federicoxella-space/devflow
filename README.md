# devflow

A small software factory for Claude Code, built from one orchestrator skill, nine subagents and
markdown files. You describe a feature; devflow interviews you, writes a spec, builds it (in
parallel when it can), runs build/lint/test, reviews it and opens a pull request. It never merges
to your base branch on its own.

```
interview → spec → parallel build → gate → parallel reviews → approve → PR
```

## Requirements

- Claude Code
- `git` and a remote `origin`
- The CLI of your forge, authenticated (`/devflow:init` detects the forge from the remote):
  - GitHub: `gh` (`gh auth status`)
  - GitLab, also self-managed: `glab` (`glab auth status --hostname <host>`)
  - Azure DevOps: `az` with the `azure-devops` extension (`az login`); Azure DevOps Server is
    prepared but not verified
  - any other platform: nothing, in **git only** mode the factory pushes the branch and you open
    the pull request by hand
- Node.js (`npx`), only for browser UI reviews (Playwright MCP, bundled in `.mcp.json`)

## Install

```
/plugin marketplace add federicoxella-space/devflow
/plugin install devflow@devflow
```

## Usage

### 1. Set up a repo: `/devflow:init`

Run once in each repo you want to use the factory in.

- **Existing project**: detects the stack (React, Angular, .NET, Maven, Gradle, Python) and
  proposes the `build`, `lint` and `test` commands for you to confirm.
- **Empty repo**: interviews you one question at a time (what you are building, constraints,
  preferences), recommends a stack for you to approve, and queues a feature that scaffolds the
  project.
- Detects the **forge** from the `origin` remote (GitHub, GitLab, Azure DevOps); for a company
  instance it asks the platform and its host. Any other platform works in **git only** mode.
- Optionally enables **automatic releases** (GitHub and GitLab, see below).
- Drafts the **project playbook**: conventions, patterns, reusable code and the Definition of
  Done. You review it before it is written.
- Run it again to redo any of **Config**, **Forge**, **Release**, **Playbook** (you pick which);
  it never touches the board. Projects set up before forges existed keep working as GitHub.

Init never commits. Then commit what it created:

```bash
git add factory/config.md factory/playbook.md .gitignore
git add .devflow .github/workflows/devflow-release.yml   # GitHub, with automatic releases
git add .devflow .gitlab-ci.yml                          # GitLab, with automatic releases
git commit -m "chore: set up devflow factory"
```

### 2. Build a feature: `/devflow:factory <feature description>`

1. **Interview**: questions one at a time until nothing has to be guessed. New logic that comes up
   (here or at spec approval) is either integrated, if it fits the feature, or deferred: an issue on
   the forge (labels `devflow`, `deferred`, `enhancement`; tags on Azure DevOps) when the repo
   accepts issues, otherwise a queued feature on the board, recorded in `factory/backlog.md`.
2. **Spec**: you approve the spec, the done checklist (acceptance criteria + Definition of Done)
   and whether it is a `feature/` or a `hotfix/` branch.
3. **Build**: independent tasks are implemented in parallel (sonnet for simple tasks, opus for
   complex ones), then build, lint and tests must pass. The factory refuses to commit secrets,
   `.env` files, build output or large unowned binaries; the changes are committed as
   Conventional Commits, one commit per task.
4. **Reviews**: code, security, UX and UI reviewers run in parallel; blocking findings go back to
   the implementers.
5. **Approval**: the approver checks evidence for every checklist item.
6. **Rule proposals**: conventions the agents discovered are shown to you one at a time; approved
   ones are added to the project playbook.
7. **Pull request** on the configured forge (merge request on GitLab), titled in Conventional
   Commits format (`feat(scope): ...`), so a squash merge leaves a conventional commit on the base
   branch. In git only mode the branch is pushed and the title and description are in
   `factory/features/<id>/pr.md` for you to open the PR by hand.

You review and merge the PR. On the next run the factory checks the open PRs: merged ones become
`merged`, their local branch is deleted and the base branch is updated; PRs closed without merge
become `closed` and keep their branch. In git only mode merges are detected from git (merge
commit, fast-forward, rebase, squash); a squash merge with resolved conflicts is not detected, so
you set that row to `merged` on the board by hand.

`/devflow:factory` with no argument resumes the current feature, or starts the oldest queued one.
When something needs a human, it stops and tells you which files to look at.

### 3. Follow the run: the flow pane

devflow ships a Claude Code mod (`hooks/`) that draws a side pane while the factory runs. It only
observes the session and the files in `factory/`; it never writes the board. It is active in repos
with a `factory/config.md`.

- **Phases**: a vertical line of the factory phases, each with its state and time. Hover a phase
  for its contract (what it reads, writes and decides with).
- **Agents**: a live card for each devflow agent, coloured by model family, with its task,
  model · effort, the tool it is using and its elapsed time.
- **Reentry**: an arrow back to the build phase, with the reason: a failing gate (also in round 1,
  e.g. a red test or a commit hook) or a blocking review of the previous round. An escalated task
  shows on its builder card as `builder ← coder`.
- **Header**: current phase, active agents, round (of `max_rounds`) and total time.
- **Board summary**: with no feature running, the pane shows a summary of the board instead.
- **Your turn**: a toast and a system notification when the factory needs you: each interview
  question (as a choice or in plain text), a spec to approve, rule proposals, needs-human, and when
  the PR is opened.

The pane opens by itself on the first `/devflow:factory` of a session; `/devflow-panel` opens and
closes it at any time. It follows only the current session. The desktop app draws it as an animated
SVG, the terminal gets a text version. Colours follow the light or dark theme.

The pane language is the plugin option `language`: `auto` (default, follows the Claude Code
`language` setting, then `LANG`; English otherwise), `it` or `en`.

## Files in your repo

```
factory/
├── config.md          commands, forge, release, ui_review, max rounds   (committed)
├── playbook.md        project rules + Definition of Done                (committed)
├── backlog.md         deferred logic queued on the board                (committed)
├── board.md           one row per feature + log                         (gitignored)
└── features/<id>/     playbook, spec, gate output, reviews, PR text     (gitignored)
.devflow/              release scripts, only with automatic releases      (committed)
```

## Automatic releases

On GitHub and GitLab, `/devflow:init` can install a CI job (step **Release**) that turns every pull
request merged into the base branch into a release: tag `vX.Y.Z` and an entry on the Releases page
with the PR title. The version comes from the title: `feat` → minor, `!` or `BREAKING CHANGE` →
major (minor while `0.x`), anything else → patch. The job only calls the API (no commits), so a
protected base branch is fine; on GitLab the job token is enough.

- GitHub: `.github/workflows/devflow-release.yml`, needs `contents: write` (granted in the file).
- GitLab: `.devflow/gitlab-release.yml`, included from `.gitlab-ci.yml`. MRs must be merged with a
  merge commit (title and number are read from it). If the runner cannot pull `alpine`, set the
  CI/CD variable `DEVFLOW_RELEASE_IMAGE` to an image with bash, git and curl. The job runs even
  when another job of the pipeline fails. After the first release job, run the
  `process_mode=oldest_first` command init shows you, so queued releases follow merge order.
- Two merges close together get two releases in commit order; re-running a job does nothing.
- After a plugin update, re-run `/devflow:init` → **Release** to refresh the files.

## devflow's own versions

Every pull request merged into this repo is released automatically: the version in
`.claude-plugin/plugin.json` is bumped from the PR title, an entry is added to
[`CHANGELOG.md`](CHANGELOG.md), and a tag and GitHub Release are created. PR titles must follow
Conventional Commits. `/plugin` updates the installed plugin when the version changes.

## More

How the loop, the agents and their contracts work: [`vault/Software factory.md`](vault/Software%20factory.md).
