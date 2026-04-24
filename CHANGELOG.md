# Changelog

All notable changes to the `.agent` format spec and reference implementations.
The format follows semver; see `SPEC.md` § 5 for what counts as breaking.

## [Unreleased] — spec v0.1 hardening

### Renderer

- `buildViewerUrl` / `encodeViewerHashPayload` now emit a new `c1:` prefix
  (raw DEFLATE + base64url via `fflate`) so "Open in browser" share links
  are dramatically shorter for realistic Japanese documents — the
  `examples/inheritance-jp-3gen.agent` demo shrinks from ~6.7 KB to
  ~1.5 KB. `decodeViewerHashPayload` still accepts the legacy `b64:` and
  percent-encoded formats; tiny payloads fall back to `b64:` when deflate
  would add overhead.

### Renderer / jp-court / viewer

- `@agent-format/renderer` is now editable for host-driven section updates via
  `onChange`, `useSectionChange`, and optional document-header suppression for
  embedded hosts.
- `@agent-format/jp-court` now supports interactive family-graph editing:
  node hitboxes, localized Japanese editor popover, add/remove person flows,
  outside-click dismissal, and explicit `isLastAddress` address labeling.
- The standalone viewer now exposes a dedicated edit mode for `jp-court`
  family graphs, JSON download, and cleaner host chrome without duplicate
  document headers.

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

- `@agent-format/mcp` continues this release line as `0.2.1` so npm can
  publish it as `latest` above the already-published `0.2.0`.
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
