---
name: commit
description: Generate a Conventional Commit message based on staged files
disable-model-invocation: true
---

Output only a Conventional Commits v1.0.0 message. Do not run `git commit` or change any files. Base the message on staged changes only (`git diff --cached`).

Rules:

- Use one of: feat, fix, refactor, perf, docs, test, chore, build, ci
- **Scope:** If the user provides a number (e.g. `/commit 123` or "123"), use that number as the scope: `fix(123): Subject`. Otherwise infer scope from the staged files.
- Imperative mood, present tense
- Subject: first character uppercase
- Max 72 characters for the subject
- No emojis
- Add BREAKING CHANGE footer only if applicable
- Return the message text only; the user will commit manually
