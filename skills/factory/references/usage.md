# Token usage and budget

You are the only writer of `features/<id>/usage.md` (gitignored like the rest of the feature dir).
Exact format:

```markdown
# Token usage · <id>

## Budget
- run 0 · limit 1000000

## Agents
| run | agent | task | model | tokens | tool uses | seconds |
|-----|-------|------|-------|--------|-----------|---------|
| 0 | spec-writer | - | opus | 38210 | 14 | 92 |
```

## Values
- `agent` = agent type without `devflow:`; `task` = task id for implementers, otherwise `-`;
  `model` = the model passed to the spawn, `-` if none; `seconds` = `duration_ms / 1000`, rounded.
- Take the values from the usage block the platform adds to every agent result
  (`<usage><subagent_tokens>N</subagent_tokens><tool_uses>N</tool_uses><duration_ms>N</duration_ms></usage>`;
  `tokens` = `subagent_tokens`), with no recomputing. A missing value is written `?` and counts 0.

## Run
`run` = `<n>` of the change `in progress`, otherwise `0`. A line `- run <r> · limit <L>` under
`## Budget` opens a run:
- run 0 at the first spawn of the feature: create the file if it is missing (also for a feature
  started before this version, with `run` computed as above);
- run `<n>` at step 2 of **Start of a change** in `references/change.md`.

`<L>` = `budget_tokens` read at that moment, `none` if there is no limit. Editing the config during
a run does not change that run's limit; it applies from the next `limit` line.

## Recording
After every reply of a devflow agent (spawn or resume with SendMessage, rework and escalation
included) append one row to `## Agents`; for a parallel group, one row per agent. The
orchestrator's own tokens are not counted.

## Check
After every finished agent, or after the whole group for agents spawned in the same message
(implementers, reviewers), before any other step: run total = sum of `tokens` of the rows of the
current run; limit = last `limit` line of the run. If the limit is a number and the total is strictly
greater → state `needs-human`, note `budget exceeded: <total> / <limit> tokens · resume from
<previous state>`. Tell the user: one line per agent of the run (agent, task, tokens), the total,
the path of `usage.md`, and how to resume (put the state back in the board cell and re-run
`/devflow:factory <id>`). A running agent is never interrupted.

## Resume
When resuming a feature in an active state, if the current run has a numeric limit and the total
exceeds it, append `- run <r> · limit <total + budget_tokens>` (`none` if `budget_tokens` is now
absent) and log `budget: new limit <L>`.

## `budget_tokens`
Positive integer, digits only. Absent, `""` or `0` = no limit. Any other value: say so to the user
in one line, log `budget_tokens invalid, ignored` and go on with no limit.

## PR body
Step 6 of `SKILL.md` and update-pr of a change: before the footer, one line
`Tokens: <run> (feature: <feature total>) · agent time: <duration>`. The `(feature: ...)` part only
if it differs from the run. Numbers use `,` as thousands separator. Duration = sum of the `seconds`
of the run, as `<h>h <m>m`, `<m>m` under an hour, `<s>s` under a minute.
