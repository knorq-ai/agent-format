# @agent-format/claude-plugin

Claude Code plugin that teaches Claude to produce [`.agent`](https://github.com/knorq-ai/agent-format) JSON artifacts instead of HTML when the user asks to visualize or structure content.

> Status: **Draft v0.1** — API and triggering behavior will tune over time.

## What it does

When you say things like:

- "Turn this email into a kanban"
- "Make a timeline from this changelog"
- "Build a dashboard of our Q2 metrics"
- "Summarize this PDF as a mindmap"

…Claude writes a `.agent` JSON file instead of a static HTML artifact. You open it at **https://knorq-ai.github.io/agent-format/** and get an interactive rendering — drag kanban cards, edit inline, navigate sections. Your edits persist in the file, so next time you ask Claude to update it, it re-reads the current state.

## Install

This plugin is part of the [agent-format monorepo](https://github.com/knorq-ai/agent-format) and lives at `packages/claude-plugin`.

### Option A — copy into your skills directory

```bash
mkdir -p ~/.claude/skills
cp -R path/to/agent-format/packages/claude-plugin/skills/agent-format ~/.claude/skills/
```

### Option B — install as a Claude Code plugin (once published to a marketplace)

```bash
claude plugin install github:knorq-ai/agent-format --path packages/claude-plugin
```

Exact command depends on your Claude Code version.

## What's inside

```
packages/claude-plugin/
├── .claude-plugin/plugin.json          # manifest
├── skills/agent-format/
│   ├── SKILL.md                        # triggering description + core instructions
│   └── references/
│       ├── section-types.md            # schema of each of the 12 section types
│       └── examples.md                 # worked multi-section examples
└── README.md
```

## How it triggers

Claude loads `SKILL.md`'s frontmatter `description` field into context as always-on hint text. When the user's request pattern-matches "visualize / structure / summarize / dashboard," Claude follows the instructions in `SKILL.md` and chooses a section type from the 12 available.

`references/section-types.md` and `references/examples.md` load progressively — only when Claude needs the specific schema.

## License

MIT.
