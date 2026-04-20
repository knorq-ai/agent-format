# Changelog

All notable changes to the `.agent` format spec and reference implementations.
The format follows semver; see `SPEC.md` § 5 for what counts as breaking.

## [Unreleased] — spec v0.1 hardening

### Spec / schema

- Root documents now MAY carry a `$schema` string for editor integration.
- Removed legacy `inheritance-diagram` section type from the schema; writers
  MUST emit `family-graph`. Renderers SHOULD continue to accept the old
  `type` at runtime as a backward-compatible alias (§ 4.13 note).
- Closed nested object schemas with `additionalProperties: false` across all
  section types and root containers. Section wrappers use
  `unevaluatedProperties: false` so the combined `SectionBase + data`
  contract rejects arbitrary extras.

### Renderer

- Added `sanitizeSvgForEmbed` — DOMParser-based allowlist walk with a
  hardened regex fallback for Node. Used by `buildPrintableHtml` before
  embedding user-supplied SVG.
- Added `SPEC_MAJOR` export + unsupported-major warning banner
  (spec § 3.1).
- `notes` and `report` section content is plain text; newlines preserved.
  (README corrected.)

### MCP

- `render_agent_inline` now validates the full document against the JSON
  Schema via Ajv and returns a structured error on failure instead of
  shallow "is `sections` an array?" check.
- MCP UI App version is injected from `package.json` at build time
  (`__APP_VERSION__`), replacing the previously hardcoded string.
- `tsconfig.ui.json` added so `ui-client.tsx` is now typechecked in CI.
- README wording corrected to reflect the inlined-renderer architecture
  (no iframe, default CSP sufficient).

### CI / OSS

- New `.github/workflows/ci.yml` — build + typecheck + test + `npm pack
  --dry-run` on every push/PR.
- Added `SECURITY.md`, `CHANGELOG.md`, `CODEOWNERS`.
