# Forge: gitlab

gitlab.com, or a self-managed instance when `forge_host` is set: prefix every `glab` command with
`GITLAB_HOST=<forge_host>`. "PR" means merge request (MR). The board's PR column holds the MR URL;
its IID is the number after `/-/merge_requests/`.

## auth
`glab auth status --hostname <forge_host or gitlab.com>`. Fails → tell the user to run
`glab auth login --hostname <forge_host or gitlab.com>`.

## open-pr
```
git push -u origin <head>
glab mr create --source-branch <head> --target-branch <base> --title "<title>" --description "$(cat <body file>)" --yes
```
Reference = the MR URL in the output (the line containing `/-/merge_requests/`).

## update-pr
Input: reference, head, title, body file, comment file.
```
git push origin "<head>"
glab mr update <IID> --title "<title>" --description "$(cat "<body file>")"
glab mr note <IID> --message "$(cat "<comment file>")"
```
Push or `glab mr update` fails → `needs-human` with the output. `glab mr note` fails → tell the user
in one line and go on.

## pr-state
`glab mr view <IID> -F json`, field `state`: `merged` → `MERGED`, `closed` → `CLOSED`, `opened` or
`locked` → `OPEN`. Command fails → `UNKNOWN`.

## issues-enabled
`glab api projects/:id`, field `issues_enabled`: `true` → `true`; anything else, or a failure →
`false`.

## create-issue
```
glab label create --name devflow --color "#5319E7" --description "Created by devflow factory"
glab label create --name deferred --color "#FBCA04" --description "Logic deferred from a devflow interview"
glab issue create --title "<title>" --description "$(cat <body file>)" --label devflow,deferred,enhancement --yes
```
Ignore "already exists" from `glab label create`; if a label still cannot be used, create the issue
without it. Result = the issue URL in the output.
