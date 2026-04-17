# Contributing

This is a draft spec. Contributions are welcome at this stage — the goal is to refine v0.1 before declaring v1.0 stable.

## What we're looking for

- **Second renderers.** The strongest way to help: build a reader for `.agent.json` in a different host (Obsidian plugin, VS Code extension, Raycast, CLI, static site). Interop is what turns a format into a standard.
- **Section type proposals.** If you have a real use case a current section type can't express, open an issue describing (a) the use case, (b) the proposed schema, (c) how an LLM would edit it reliably.
- **Schema fixes.** Mismatches between `SPEC.md` and `schemas/agent.schema.json`, or ambiguous wording.
- **Example files.** Real `.agent.json` files covering use cases we don't have examples for.

## How to propose a change

1. Open an issue first. Describe the change and why. Tag it `spec`, `schema`, `example`, or `docs`.
2. For spec or schema changes: wait for editor ack before opening a PR.
3. For examples and docs: PR directly is fine.

## What NOT to do

- Don't add section types without an issue first.
- Don't rename existing fields — backwards compatibility matters even in v0.x.
- Don't add fields that require the LLM to manage layout (x/y coordinates, sizes). This format is deliberately not a canvas.

## Review principles

Changes are evaluated against:

1. **LLM-editability.** Can a model reliably write valid JSON for this schema with a short description of the change?
2. **Human-renderability.** Does this render clearly without the renderer having to make major product decisions?
3. **Portability.** Does the file stay self-contained, or does it introduce external dependencies?
4. **Simplicity over flexibility.** When in doubt, keep schemas narrow.

## Questions

Open a discussion or issue on GitHub.
