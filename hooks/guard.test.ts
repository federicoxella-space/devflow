import { expect, test } from 'claude-code/testing'

import { checkShell, checkWrite, normPath, worktreeRoots } from './guard'
import { STRINGS } from './i18n'

const en = STRINGS.en
const it = STRINGS.it
const ROOTS = ['F:/devflow', '/home/u/wt/feature-016']

const w = (type: string, path: string) => checkWrite(type, path, ROOTS, en)
const sh = (type: string, command: string) => checkShell(type, command, en)

test('normPath: barre, doppi slash, . e .., minuscolo', () => {
  expect(normPath('F:\\DevFlow\\src\\..\\factory\\Board.md')).toBe('f:/devflow/factory/board.md')
  expect(normPath('a//b/./c')).toBe('a/b/c')
  expect(normPath('./factory/x.md')).toBe('factory/x.md')
  expect(normPath('src/../factory/board.md')).toBe('factory/board.md')
  expect(normPath('../x')).toBe('../x')
  expect(normPath('/a/../../b')).toBe('/b')
})

test('worktreeRoots: path dalle righe worktree del formato porcelain', () => {
  const porcelain = [
    'worktree F:/devflow',
    'HEAD 35d2bbf',
    'branch refs/heads/main',
    '',
    'worktree /home/u/wt/feature 016',
    'HEAD 1234567',
    'branch refs/heads/feature/016',
    '',
  ].join('\r\n')
  expect(worktreeRoots(porcelain)).toEqual(['F:/devflow', '/home/u/wt/feature 016'])
  expect(worktreeRoots('')).toEqual([])
})

test('AC1: review-<x> scrive solo la propria review', () => {
  expect(w('review-code', 'factory/features/016-a/reviews/r1-code.md')).toBeUndefined()
  expect(w('review-code', 'F:\\devflow\\factory\\features\\016-a\\reviews\\r12-code.md')).toBeUndefined()
  expect(w('review-code', '/home/u/wt/feature-016/factory/features/016-a/reviews/r2-code.md')).toBeUndefined()
  expect(w('review-code', 'src/app.ts')).toBe('devflow guard: review-code can only write reviews/r<N>-code.md')
  expect(w('review-code', 'factory/features/016-a/reviews/r1-security.md')).toBe('devflow guard: review-code can only write reviews/r<N>-code.md')
  expect(w('review-code', 'factory/features/016-a/reviews/r1-code.md.bak')).toBeDefined()
  expect(w('review-code', 'factory/features/016-a/reviews/../spec.md')).toBeDefined()
  expect(w('devflow:review-ux', 'factory/features/016-a/reviews/r1-ux.md')).toBeUndefined()
  expect(checkWrite('review-code', 'src/app.ts', ROOTS, it)).toBe('devflow guard: review-code può scrivere solo reviews/r<N>-code.md')
})

test('AC2: approver, spec-checker e spec-writer scrivono solo i propri file', () => {
  expect(w('approver', 'factory/features/016-a/decision.md')).toBeUndefined()
  expect(w('approver', 'factory/features/016-a/spec.md')).toBe('devflow guard: approver can only write decision.md')
  expect(w('spec-checker', 'F:/devflow/factory/features/016-a/spec-check.md')).toBeUndefined()
  expect(w('spec-checker', 'factory/features/016-a/decision.md')).toBe('devflow guard: spec-checker can only write spec-check.md')
  expect(w('spec-writer', 'factory/features/016-a/spec.md')).toBeUndefined()
  expect(w('spec-writer', 'factory/features/016-a/playbook.md')).toBeUndefined()
  expect(w('spec-writer', 'factory/features/016-a/reviews/r1-code.md')).toBe('devflow guard: spec-writer can only write spec.md or playbook.md')
  expect(w('spec-writer', 'src/x.ts')).toBe('devflow guard: spec-writer can only write spec.md or playbook.md')
  expect(checkWrite('spec-writer', 'src/x.ts', ROOTS, it)).toBe('devflow guard: spec-writer può scrivere solo spec.md o playbook.md')
})

test('AC3: implementer non scrive sotto factory/', () => {
  const msg = 'devflow guard: implementer cannot write under factory/'
  expect(w('implementer', 'factory/features/016-a/spec.md')).toBe(msg)
  expect(w('implementer', 'F:\\devflow\\factory\\config.md')).toBe(msg)
  expect(w('implementer', 'f:/DEVFLOW/Factory/features/x/gate-r1.md')).toBe(msg)
  expect(w('implementer', '/home/u/wt/feature-016/factory/features/016-a/decision.md')).toBe(msg)
  expect(w('implementer', 'F:/devflow/src/../factory/config.md')).toBe(msg)
  expect(w('implementer', 'src/../factory/x.md')).toBe(msg)
  expect(w('implementer', 'skills/factory/SKILL.md')).toBeUndefined()
  expect(w('implementer', 'F:/devflow/skills/factory/SKILL.md')).toBeUndefined()
  expect(w('implementer', 'src/x.ts')).toBeUndefined()
  expect(w('implementer', '/elsewhere/factory/x.md')).toBeUndefined()
  expect(checkWrite('implementer', 'F:/devflow/factory/x.md', [], en)).toBeUndefined()
  expect(checkWrite('implementer', 'factory/x.md', [], it)).toBe('devflow guard: implementer non può scrivere sotto factory/')
})

test('AC4: board e playbook del progetto solo per l’orchestratore', () => {
  for (const type of ['implementer', 'committer', 'review-code', 'approver', 'spec-checker', 'spec-writer', 'future-agent']) {
    expect(w(type, 'factory/board.md')).toBe('devflow guard: only the orchestrator writes factory/board.md')
    expect(w(type, 'F:\\devflow\\factory\\playbook.md')).toBe('devflow guard: only the orchestrator writes factory/playbook.md')
    expect(w(type, '/home/u/wt/feature-016/factory/Board.md')).toBe('devflow guard: only the orchestrator writes factory/board.md')
  }
  expect(w('committer', 'src/x.ts')).toBeUndefined()
  expect(w('committer', 'factory/features/016-a/spec.md')).toBeUndefined()
  expect(w('spec-writer', 'factory/features/016-a/playbook.md')).toBeUndefined()
  expect(checkWrite('committer', 'factory/board.md', ROOTS, it)).toBe('devflow guard: solo l’orchestratore scrive factory/board.md')
})

test('AC5: push, force, no-verify e reset --hard vietati a tutti', () => {
  for (const type of ['implementer', 'committer', 'review-code', 'future-agent']) {
    expect(sh(type, 'git push')).toBe('devflow guard: subagents cannot run git push')
    expect(sh(type, 'git -C "F:/devflow" push origin feature/x')).toBe('devflow guard: subagents cannot run git push')
    expect(sh(type, 'git -C "F:/my repo" push')).toBe('devflow guard: subagents cannot run git push')
    expect(sh(type, "git -C 'C:/Users/John Doe/repo' push")).toBe('devflow guard: subagents cannot run git push')
    expect(sh(type, '"C:/Program Files/Git/bin/git.exe" push')).toBe('devflow guard: subagents cannot run git push')
    expect(sh(type, 'echo "$(git push)"')).toBe('devflow guard: subagents cannot run git push')
    expect(sh(type, 'bash -c "cd x && git push"')).toBe('devflow guard: subagents cannot run git push')
    expect(sh(type, 'bash -c "git push"')).toBe('devflow guard: subagents cannot run git push')
    expect(sh(type, 'git status && git push')).toBe('devflow guard: subagents cannot run git push')
    expect(sh(type, 'echo $(git push)')).toBe('devflow guard: subagents cannot run git push')
    expect(sh(type, '/usr/bin/git push')).toBe('devflow guard: subagents cannot run git push')
    expect(sh(type, 'git.exe -c core.x=1 --git-dir x push')).toBe('devflow guard: subagents cannot run git push')
    expect(sh(type, 'git checkout --force main')).toBe('devflow guard: subagents cannot run --force')
    expect(sh(type, 'git rebase --force-with-lease=x')).toBe('devflow guard: subagents cannot run --force')
    expect(sh(type, 'git x --force-with-lease')).toBe('devflow guard: subagents cannot run --force')
    expect(sh(type, 'git x --force-if-includes')).toBe('devflow guard: subagents cannot run --force')
    expect(sh(type, 'git commit --no-verify -m x')).toBe('devflow guard: subagents cannot run --no-verify')
    expect(sh(type, 'git reset --hard HEAD~1')).toBe('devflow guard: subagents cannot run git reset --hard')
  }
  expect(sh('implementer', 'git status')).toBeUndefined()
  expect(sh('implementer', 'git -C x diff main...HEAD')).toBeUndefined()
  expect(sh('implementer', 'git reset HEAD~1')).toBeUndefined()
  expect(sh('implementer', 'git log --oneline | head -5')).toBeUndefined()
  expect(sh('review-code', 'git status')).toBeUndefined()
  expect(sh('review-code', 'git -C x diff main...HEAD')).toBeUndefined()
  expect(checkShell('committer', 'git push', it)).toBe('devflow guard: i subagent non possono eseguire git push')
})

test('AC5: solo la prima violazione, regola 1 prima della 3', () => {
  expect(sh('review-code', 'git --no-verify push')).toBe('devflow guard: subagents cannot run --no-verify')
  expect(sh('review-code', 'git stash; git push')).toBe('devflow guard: subagents cannot run git push')
})

test('AC6: gli agenti read-only non cambiano git né file da shell', () => {
  for (const type of ['review-code', 'approver', 'spec-checker']) {
    const ro = (what: string) => `devflow guard: ${type} is read-only and cannot run ${what}`
    for (const sub of ['commit', 'add', 'checkout', 'switch', 'stash', 'restore', 'rebase', 'merge'])
      expect(sh(type, `git -C "x" ${sub} y`)).toBe(ro(`git ${sub}`))
    expect(sh(type, 'git -C "F:/my repo" stash')).toBe(ro('git stash'))
    expect(sh(type, 'bash -c "git commit -m x"')).toBe(ro('git commit'))
    expect(sh(type, 'git -C "F:/my repo" log --format="%h %s"')).toBeUndefined()
    expect(sh(type, 'grep -n "a; rm b" f')).toBeUndefined()
    expect(sh(type, 'git log --grep "x | tee"')).toBeUndefined()
    for (const cmd of ['rm', 'mv', 'cp', 'tee', 'touch']) expect(sh(type, `${cmd} a b`)).toBe(ro(cmd))
    expect(sh(type, 'cat x | tee out')).toBe(ro('tee'))
    expect(sh(type, 'FOO=1 rm -rf x')).toBe(ro('rm'))
    expect(sh(type, '/bin/RM x')).toBe(ro('rm'))
    expect(sh(type, 'sed -i s/a/b/ f')).toBe(ro('sed -i'))
    expect(sh(type, "sed -i.bak 's/a/b/' f")).toBe(ro('sed -i'))
    expect(sh(type, 'sed --in-place s/a/b/ f')).toBe(ro('sed -i'))
    for (const c of ['Set-Content', 'Add-Content', 'Out-File', 'Remove-Item', 'Move-Item', 'Copy-Item', 'New-Item', 'Tee-Object']) {
      expect(sh(type, `${c} -Path x`)).toBe(ro(c))
      expect(sh(type, `Get-Date | ${c.toLowerCase()} x`)).toBe(ro(c))
    }
    expect(sh(type, 'echo x > f')).toBe(ro('> f'))
    expect(sh(type, 'echo x>out.txt')).toBe(ro('> out.txt'))
    expect(sh(type, 'cmd 2> err.log')).toBe(ro('2> err.log'))
    expect(sh(type, 'echo x >> f')).toBe(ro('>> f'))
    expect(sh(type, 'cmd &> all.log')).toBe(ro('&> all.log'))
    expect(sh(type, 'cmd *> all.log')).toBe(ro('*> all.log'))
    expect(sh(type, 'cmd 1> o.txt')).toBe(ro('1> o.txt'))
    expect(sh(type, 'git diff 2>/dev/null')).toBeUndefined()
    expect(sh(type, 'cmd 2>&1')).toBeUndefined()
    expect(sh(type, 'cmd >&2')).toBeUndefined()
    expect(sh(type, 'cmd 2>$null')).toBeUndefined()
    expect(sh(type, 'cmd > NUL')).toBeUndefined()
    expect(sh(type, 'grep "a > b" f')).toBeUndefined()
    expect(sh(type, "grep 'a >> b' f")).toBeUndefined()
    expect(sh(type, 'sed -n 1p f')).toBeUndefined()
    expect(sh(type, 'node -e "x => 1" ; a->b')).toBeUndefined()
    expect(sh(type, 'git log --format=%h | grep rm')).toBeUndefined()
    expect(sh(type, 'cmd 2>&1 & wait')).toBeUndefined()
  }
  expect(sh('review-code', 'echo a > x; rm y')).toBe('devflow guard: review-code is read-only and cannot run > x')
  expect(sh('review-code', 'rm y; echo a > x')).toBe('devflow guard: review-code is read-only and cannot run rm')
  expect(checkShell('approver', 'set-content x', it)).toBe('devflow guard: approver è read-only e non può eseguire Set-Content')
  expect(sh('implementer', 'rm f')).toBeUndefined()
  expect(sh('implementer', 'echo x > f')).toBeUndefined()
  expect(sh('implementer', 'git add -A && git commit -m x')).toBeUndefined()
  expect(sh('committer', 'git stash')).toBeUndefined()
})

test('AC7: nessuna scrittura da shell su board e playbook del progetto', () => {
  for (const type of ['implementer', 'committer', 'review-code', 'spec-writer']) {
    expect(sh(type, 'echo x >> factory/board.md')).toBe('devflow guard: only the orchestrator writes factory/board.md')
    expect(sh(type, 'sed -i s/a/b/ factory/board.md')).toBe('devflow guard: only the orchestrator writes factory/board.md')
    expect(sh(type, 'Set-Content factory\\playbook.md x')).toBe('devflow guard: only the orchestrator writes factory/playbook.md')
    expect(sh(type, 'cp factory/playbook.md factory/board.md')).toBe('devflow guard: only the orchestrator writes factory/playbook.md')
    expect(sh(type, 'cat factory/board.md')).toBeUndefined()
    expect(sh(type, 'grep x factory\\playbook.md 2>/dev/null')).toBeUndefined()
  }
  expect(checkShell('implementer', 'rm factory/board.md', it)).toBe('devflow guard: solo l’orchestratore scrive factory/board.md')
})

test('AC15: il testo quotato fuori dai comandi annidati non è un comando', () => {
  expect(sh('committer', 'git commit -m "docs: explain git push"')).toBeUndefined()
  expect(sh('committer', 'git commit -m "fix --force flag"')).toBeUndefined()
  expect(sh('committer', "git commit -m 'skip --no-verify'")).toBeUndefined()
  expect(sh('review-code', 'grep "git push" f')).toBeUndefined()
  expect(sh('review-code', 'grep -n "rm -rf" f')).toBeUndefined()
  expect(sh('review-code', "echo '$(git push)'")).toBeUndefined()
  for (const type of ['implementer', 'committer', 'review-code', 'future-agent']) {
    expect(sh(type, 'echo "$(git push)"')).toBe(en.guard.command('git push'))
    expect(sh(type, 'echo "`git push`"')).toBe(en.guard.command('git push'))
    expect(sh(type, 'echo $(git push)')).toBe(en.guard.command('git push'))
  }
})

test('AC16: un comando annidato passa a tutti i controlli', () => {
  const ro = (what: string) => en.guard.readOnly('review-code', what)
  expect(sh('review-code', 'bash -c "x; rm -rf src"')).toBe(ro('rm'))
  expect(sh('review-code', "sh -c 'echo x > out.txt'")).toBe(ro('> out.txt'))
  expect(sh('review-code', 'pwsh -Command "Remove-Item x"')).toBe(ro('Remove-Item'))
  expect(sh('review-code', 'bash -c "git commit -m \\"x\\""')).toBe(ro('git commit'))
  for (const type of ['implementer', 'committer', 'review-code', 'future-agent']) {
    expect(sh(type, 'bash -lc "git push"')).toBe(en.guard.command('git push'))
    expect(sh(type, 'powershell.exe -c "git push"')).toBe(en.guard.command('git push'))
    expect(sh(type, 'cmd /c "git push"')).toBe(en.guard.command('git push'))
    expect(sh(type, `bash -c "sh -c 'git push'"`)).toBe(en.guard.command('git push'))
  }
  expect(sh('implementer', 'bash -c "rm f"')).toBeUndefined()
})

test('AC17: la regola 2 guarda solo i path, non le frasi quotate', () => {
  const board = en.guard.orchestrator('factory/board.md')
  expect(sh('committer', 'git commit -m "update factory/board.md"')).toBeUndefined()
  expect(sh('committer', 'git add factory/board.md')).toBe(board)
  expect(sh('committer', 'echo x > "factory/board.md"')).toBe(board)
  expect(sh('committer', 'bash -c "echo x >> factory/playbook.md"')).toBe(en.guard.orchestrator('factory/playbook.md'))
  expect(sh('committer', 'Set-Content -Path "F:/my repo/factory/board.md" x')).toBe(board)
  expect(sh('committer', 'tool --out=factory/board.md > log.txt')).toBe(board)
})

test('input non validi: fail open', () => {
  expect(checkWrite('implementer', undefined as unknown as string, ROOTS, en)).toBeUndefined()
  expect(checkWrite('implementer', 'factory/x', undefined as unknown as string[], en)).toBe('devflow guard: implementer cannot write under factory/')
  expect(checkShell('review-code', undefined as unknown as string, en)).toBeUndefined()
  expect(sh('review-code', '')).toBeUndefined()
})

test('AC13: testi guard e blocked in en e it con le stesse chiavi', () => {
  expect(Object.keys(STRINGS.it.guard).sort()).toEqual(Object.keys(STRINGS.en.guard).sort())
  expect(STRINGS.en.blocked(1)).toBe('⊘ 1 blocked')
  expect(STRINGS.en.blocked(3)).toBe('⊘ 3 blocked')
  expect(STRINGS.it.blocked(1)).toBe('⊘ 1 bloccata')
  expect(STRINGS.it.blocked(2)).toBe('⊘ 2 bloccate')
  expect(en.guard.only('x', ['a', 'b', 'c'])).toBe('devflow guard: x can only write a, b or c')
})
