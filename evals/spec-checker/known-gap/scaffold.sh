#!/usr/bin/env bash
set -eu

mkdir -p factory/features/003-export src

cat > factory/config.md <<'EOT'
---
base_branch: main
forge: git
build: ""
lint: ""
test: ""
ui_review: none
release: "off"
workspace: branch
---
Small example repo used by an eval.
EOT

cat > factory/playbook.md <<'EOT'
# Project playbook

## Conventions

## Patterns

## Reusable code

## Don'ts

## Definition of Done
- [gate] Build, lint and tests are green.
- [code] Every acceptance criterion has an automated test or a precise manual step.
EOT

cat > src/orders.py <<'EOT'
from dataclasses import dataclass
from datetime import datetime


@dataclass
class Order:
    id: int
    customer: str
    total: float
    created_at: datetime
EOT

cat > factory/features/003-export/feature.md <<'EOT'
# 003-export

Export orders to CSV
EOT

cat > factory/features/003-export/playbook.md <<'EOT'
# 003-export - Export orders to CSV

## Request
Export orders to CSV

## Workspace
branch

## Interview

## Agent decisions

## Deferred

## Done checklist
| id | item | owner | verified by |
|----|------|-------|-------------|
| AC1 | The exported file contains the orders | code | test |
EOT

cat > factory/features/003-export/spec.md <<'EOT'
---
title: Export orders to CSV
kind: feature
reviewers: [code]
---
## Expected result
The user can export a list of orders to a CSV file.

## Goal
Let the user take orders out of the system as a CSV file.

## Context
- `src/orders.py`: the `Order` dataclass.

## Behaviour
A function writes the orders to a CSV file.

## Acceptance criteria
See `## Done checklist` in the feature playbook.

## Tasks
| id | what | files (owned) | depends on | complexity |
|----|------|---------------|------------|------------|
| T1 | Add `export_csv(orders, path)` in `src/export.py` that writes the orders to a CSV file | `src/export.py` | - | simple |

## Out of scope
- Other export formats.

## Open questions
EOT
