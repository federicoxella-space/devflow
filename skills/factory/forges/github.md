# Forge: github

GitHub cloud, or GitHub Enterprise when `forge_host` is set: prefix every `gh` command with
`GH_HOST=<forge_host>`. The board's PR column holds the PR URL.

## auth
`gh auth status`. Fails → tell the user to run `gh auth login` (`--hostname <forge_host>` for
Enterprise).

## open-pr
```
git push -u origin <head>
gh pr create --base <base> --head <head> --title "<title>" --body-file <body file>
```
Reference = the URL printed by `gh pr create`.

## update-pr
Input: reference, head, title, body file, comment file.
```
git push origin "<head>"
gh pr edit "<reference>" --title "<title>" --body-file "<body file>"
gh pr comment "<reference>" --body-file "<comment file>"
```
Push or `gh pr edit` fails → `needs-human` with the output. `gh pr comment` fails → tell the user in
one line and go on.

## pr-state
`gh pr view <reference> --json state -q .state` → `MERGED`, `CLOSED` or `OPEN`, as is. Command
fails → `UNKNOWN`.

## issues-enabled
`gh repo view --json hasIssuesEnabled -q .hasIssuesEnabled` prints `true` → `true`; anything else,
or a failure → `false`.

## create-issue
```
gh label create devflow --color 5319E7 --description "Created by devflow factory"
gh label create deferred --color FBCA04 --description "Logic deferred from a devflow interview"
gh issue create --title "<title>" --body-file <body file> --label devflow,deferred,enhancement
```
Ignore "already exists" from `gh label create`; if a label still cannot be used, create the issue
without it. Result = the issue URL printed by `gh issue create`.
