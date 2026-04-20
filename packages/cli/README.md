# @agent-format/cli

Command-line validator for [`.agent` files](https://github.com/knorq-ai/agent-format).

Validates one or more files against the v0.1 JSON Schema. Independent of
the React renderer — useful in CI, pre-commit hooks, and scripts.

## Install

```bash
npm install -g @agent-format/cli
```

## Usage

```bash
agent-format path/to/file.agent
agent-format examples/*.agent
agent-format --quiet ci-fixtures/*.agent    # silent on success
agent-format --first-error-only broken.agent
agent-format --version
```

Exit codes:

| Code | Meaning |
|---|---|
| 0 | All files validated |
| 1 | At least one file failed validation |
| 2 | Usage error (bad flag, missing files) |

## Why this package exists

Format specs tend to get written as "whatever the reference implementation
does." That's brittle: the schema becomes advisory, not normative.

`@agent-format/cli` is a second, independent implementation that consumes
the same `schemas/agent.schema.json` without importing the TS renderer. If
a writer's output validates here and breaks in the renderer (or vice
versa), one of the two is wrong — and the schema is the tiebreaker.

## License

MIT.
