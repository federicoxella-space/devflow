Build a simple, visual "software factory" using Claude Code skills, subagents, and markdown files. Keep it small: a viewer should understand the whole thing in a few minutes.

Packaged as the Claude Code plugin `devflow` (this folder). Install once, use in any repo.

## The orchestrator

The factory is one skill, `/devflow:factory`. Whichever Claude Code session runs it becomes the orchestrator: it runs the loop below, spawns every agent, runs the gate, and is the only writer of `factory/board.md`.

- One feature at a time, on branch `factory/<id>`.
- The human approves every spec before the build.
- Output is a pull request, never a direct merge to main.
- Re-running `/devflow:factory` resumes from the state in the board.

## The loop

```mermaid
%%{init: {'theme': 'neutral','flowchart': {'curve': 'step'}}}%%
flowchart TD
    feature[feature] --> specWriter["spec-writer<br>[opus]"]
    specWriter --> human_spec{"human approves spec"}
    human_spec --> |changes| specWriter
    human_spec --> |approve| builder["builder<br>[opus]"]
    builder --> gate{"gate<br>build · lint · test"}
    gate --> |"FAIL (max 2 per round)"| builder
    gate --> |PASS| committer["committer<br>[haiku]"]
    committer --> |"hook FAIL"| builder
    committer --> |OK| security["security<br>[opus]"]
    committer --> |OK| code["code<br>[sonnet]"]
    committer --> |"OK, if UI"| ux["ux<br>[sonnet]"]
    committer --> |"OK, if UI"| ui_design["ui design<br>[sonnet]"]
    security --> wait{"WAIT FOR ALL<br>reviews in"}
    code --> wait
    ux --> wait
    ui_design --> wait
    wait --> |"any CHANGES<br>round ≤ 2"| builder
    wait --> |"any CHANGES<br>round > 2"| need[needs-human]
    wait --> |"all PASS"| approver["approver<br>[opus]"]
    approver --> |APPROVE| pr[pull request]
    approver --> |ESCALATE| need
```

## Contracts

| Step | Reads | Writes | Decides with |
|---|---|---|---|
| spec-writer | `feature.md`, codebase | `spec.md` | acceptance criteria + `reviewers` list |
| builder | `spec.md`, reviews | code + tests (no commits) | — |
| gate (orchestrator) | `config.md` commands | `gate-rN.md` | exit codes |
| committer | working tree, commit rules | Conventional Commits on `factory/<id>` | forbidden files / hook fail → stop |
| reviewers | diff + `spec.md` | `reviews/rN-<name>.md` | `verdict: PASS \| CHANGES` (CHANGES only for blocking items) |
| approver | everything above | `decision.md` | every criterion has evidence → `APPROVE`, else `ESCALATE` |

UX/UI review mode is set per project in `factory/config.md`: `none` (backend), `static` (read the diff, also for CLIs), `browser` (Playwright on the dev server).

## Files

```
plugin (this folder)                     target project
.claude-plugin/plugin.json               factory/config.md   commands, ui_review, max_rounds (committed)
.claude-plugin/marketplace.json          factory/board.md    one row per feature + log
.mcp.json            (Playwright)        factory/features/<id>/
skills/factory/SKILL.md (orchestrator)       feature.md, spec.md, gate-rN.md,
agents/*.md          (8 agents)              reviews/rN-*.md, decision.md
```
