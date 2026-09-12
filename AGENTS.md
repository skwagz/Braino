# Agent Instructions — Braino

This file follows the `agents.md` convention: Codex and other AI coding tools that support it load it automatically as project instructions, the way Claude Code loads `CLAUDE.md`. It's the one file every agent working here should read first, regardless of which tool — or which person's tool — is driving.

## Guidelines

Full engineering guidelines — planning, verification, communication, error handling, review checklist — live in [GUIDELINES.md](GUIDELINES.md). Read it before any non-trivial change.

For the project itself — the idea, ICP, product shape, end-to-end flow, and scope cuts — see [HANDOFF.md](HANDOFF.md).

## Commit convention

Create well-formatted, atomic commits using conventional commit messages with emojis.

**Types:**
- ✨ `feat` — new features
- 🐛 `fix` — bug fixes
- 📝 `docs` — documentation changes
- ♻️ `refactor` — code restructuring without changing functionality
- 🎨 `style` — formatting, missing semicolons, etc.
- ⚡️ `perf` — performance improvements
- ✅ `test` — adding or correcting tests
- 🧑‍💻 `chore` — tooling, configuration, maintenance
- 🚧 `wip` — work in progress
- 🔥 `remove` — removing code or files
- 🚑 `hotfix` — critical fixes
- 🔒 `security` — security improvements

**Process:**
1. Check for staged changes (`git status`).
2. If nothing is staged, review and stage the appropriate files.
3. Run any pre-commit checks the repo defines (lint/build/tests) unless the person at the keyboard says to skip them.
4. Determine the commit type from the change.
5. Write a descriptive message: `type(scope): description`, imperative mood ("Add feature", not "Added feature").
6. Add a body for non-trivial changes explaining *why*, not just what.
7. Do not add an AI-attribution or co-authorship footer unless the person at the keyboard explicitly asks for one — this repo's default is a clean commit history that reads the same regardless of which tool made it.
8. Keep commits atomic — split unrelated changes into separate commits.

## Notes for humans

- **Claude Code users:** `.claude/commands/commit.md` runs this same convention as a `/commit` slash command.
- **Codex and other AGENTS.md-aware tools:** this file is your entry point — no extra setup needed.
