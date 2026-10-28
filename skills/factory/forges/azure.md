# Forge: azure

Azure DevOps Services (cloud). **Azure DevOps Server: prepared, not verified** — `az devops` supports
Server only partly; tell the user once per run when `azure_org` is set.

Scope flags, used by the commands below:
- `<scope flags>`: `azure_org` and `azure_project` set (Server, or an explicit cloud org) →
  `--org <azure_org> --project <azure_project>`; otherwise → `--detect true` (organization and
  project from the `origin` remote).
- `<org flag>` (commands without a project, like `az repos pr show`): `--org <azure_org>` if set,
  otherwise `--detect true`.

"PR" means pull request; the board's PR column holds its web URL; its id is the number after
`/pullrequest/`.

## auth
`az account show` succeeds and `az extension show --name azure-devops` succeeds and
`az repos pr list --top 1 <scope flags>` succeeds. Fails → tell the user to run `az login` and
`az extension add --name azure-devops` (for Server: `az devops login --org <azure_org>` with a PAT).

## open-pr
```
git push -u origin <head>
az repos pr create --source-branch <head> --target-branch <base> --title "<title>" --description "$(cat <body file>)" --output json <scope flags>
```
Reference = `<repository.webUrl>/pullrequest/<pullRequestId>` from the JSON output.

## update-pr
Input: reference, head, title, body file, comment file.
```
git push origin "<head>"
az repos pr update --id <id> --title "<title>" --description "$(cat "<body file>")" --output json <org flag>
```
Push or `az repos pr update` fails → `needs-human` with the output.

Comment: `az repos pr show --id <id> --output json <org flag>` gives `repository.id` and
`repository.project.name`. Write the JSON file in the scratch area, with the comment file content
escaped as a JSON string:
```
{"comments":[{"parentCommentId":0,"content":"<comment, JSON-escaped>","commentType":1}],"status":1}
```
```
az devops invoke --area git --resource pullRequestThreads --route-parameters project="<project>" repositoryId="<repo id>" pullRequestId=<id> --http-method POST --in-file "<json file>" --api-version 7.1 <org flag>
```
Any comment step fails → tell the user in one line and go on.

## pr-state
`az repos pr show --id <id> --output json <org flag>`, field `status`: `completed` → `MERGED`,
`abandoned` → `CLOSED`, `active` → `OPEN`. Command fails → `UNKNOWN`.

## issues-enabled
`az boards query --wiql "SELECT [System.Id] FROM WorkItems WHERE [System.Id] < 0" <scope flags>`
succeeds → `true`; fails → `false` (Boards disabled or no access).

## create-issue
Azure Boards has no labels: use tags. Try the work item types in order until one is accepted
(they depend on the process template): `Issue`, `User Story`, `Product Backlog Item`.
```
az boards work-item create --type "<type>" --title "<title>" --description "$(sed 's/$/<br>/' <body file>)" --fields "System.Tags=devflow; deferred" --output json <scope flags>
```
(`--description` is HTML, hence the `<br>`.) Result = `_links.html.href` from the JSON output.
