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
- Drafts the **project playbook**: conventions, patterns, reusable code and the Definition of
  Done. You review it before it is written.
- Run it again to redo the config or the playbook; it asks first and never touches the board.

Then commit what it created:

```bash
git add factory/config.md factory/playbook.md .gitignore
git commit -m "chore: set up devflow factory"
```

### 2. Build a feature: `/devflow:factory <feature description>`

1. **Interview**: questions one at a time until nothing has to be guessed. New logic that comes up
   (here or at spec approval) is either integrated, if it fits the feature, or deferred: an issue on
   the forge (labels `devflow`, `deferred`, `enhancement`; tags on Azure DevOps) when the repo
   accepts issues, otherwise a
   queued feature on the board, recorded in `factory/backlog.md`.
2. **Spec**: you approve the spec, the done checklist (acceptance criteria + Definition of Done)
   and whether it is a `feature/` or a `hotfix/` branch.
3. **Build**: independent tasks are implemented in parallel (sonnet for simple tasks, opus for
   complex ones), then build, lint and tests must pass.
4. **Reviews**: code, security, UX and UI reviewers run in parallel; blocking findings go back to
   the implementers.
5. **Approval**: the approver checks evidence for every checklist item.
6. **Rule proposals**: conventions the agents discovered are shown to you one at a time; approved
   ones are added to the project playbook.
7. **Pull request** on the configured forge (merge request on GitLab).

`/devflow:factory` with no argument resumes the current feature, or starts the oldest queued one.
When something needs a human, it stops and tells you which files to look at.

## Files in your repo

```
factory/
├── config.md          commands, ui_review mode, max review rounds      (committed)
├── playbook.md        project rules + Definition of Done                (committed)
├── backlog.md         deferred logic queued on the board                (committed)
├── board.md           one row per feature + log                         (gitignored)
└── features/<id>/     playbook, spec, gate output, reviews, decision    (gitignored)
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
  CI/CD variable `DEVFLOW_RELEASE_IMAGE` to an image with bash, git and curl.
- After a plugin update, re-run `/devflow:init` → **Release** to refresh the files.

## More

How the loop, the agents and their contracts work: [`vault/Software factory.md`](vault/Software%20factory.md).
