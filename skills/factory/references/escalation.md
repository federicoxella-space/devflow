# Escalation and rework

## Escalation
- `ESCALATE design: <reason>` → log it, resume the spec-writer with the reason, then run the spec
  check. Tell the user the spec-writer's summary line, and ask the new open questions (as in step
  2). State `build`, then resume the same implementer. A second `ESCALATE design` on the same task
  in the same round → `needs-human`.
- **Escalation to `escalation_model`.** Triggers: `ESCALATE stuck`; the gate failing for the second
  time in the same round (also for a commit hook); a blocking item prefixed `repeat:` on a file of
  the task (items with no path go to the implementer chosen for them, see Rework). If the task's
  current implementer runs on `implementer_model`: write
  `<feature dir>/handover-<task>-r<round>.md` with the reason (or the `ESCALATE` reply), the paths
  of the round's `gate-r<N>.md` and `reviews/r<N>-*.md`, and the output of `git diff HEAD -- <owned
  files>` redirected into the file with the paths quoted (`git -C "<dir>"`).
  Spawn a new implementer on `escalation_model` with the same inputs plus `handover: <path>`; from
  then on it is the task's **current implementer**.
- With the implementer already on `escalation_model`: `ESCALATE stuck` → `needs-human` with the
  reason; gate failing twice → `needs-human` ("gate keeps failing"); `repeat:` → normal rework,
  limited by `max_rounds`. The round number never triggers an escalation.
- An implementer that stops because it needs a file it does not own: if another task owns the
  file, send that change to the other task's implementer once both are idle; if no task owns it,
  resume the spec-writer to add the file to a task in `## Tasks`, then resume the implementer.

## Rework
Resume implementers with SendMessage (if you no longer have an agent id, new session,
spawn a fresh `devflow:implementer` with the task's current model (`implementer_model` if unknown)
and the same inputs, and the instruction "rework").
- Review items: group the `## Blocking` items of the reviews with `verdict: CHANGES` by `path` and
  send each group to the current implementer of the task that owns that file; several
  implementers at once → in one message with `parallel: true`. Items with no path (a page, a flow)
  or on a file no task owns go, **after** that group has finished, to one implementer with
  `parallel: false` (chosen as in the gate rule below), listed explicitly, not as "whole rework".
- Gate or commit-hook failure: send the gate file to one implementer, with the instruction that it
  owns the whole rework and `parallel: false`: the task that owns a path named in the failing output,
  else the current implementer of a `complex` task if any, else the current implementer of `T1`.
