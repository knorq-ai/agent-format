# Security Policy

## Threat model

`.agent` files are typically produced by an LLM and consumed by a client
(renderer, viewer, or MCP Apps UI) running in the user's browser or editor.
Anywhere a string from the file reaches the DOM or filesystem, the content
must be treated as **untrusted input**.

Primary surfaces:

| Surface | Risk | Mitigation |
|---|---|---|
| `url` fields (links, references) | `javascript:` / `data:` XSS | Protocol allowlist in `LinksSection`; sanitizer rejects the same schemes in SVG/print output |
| `color` fields (kanban labels, metrics) | CSS injection | Regex allowlist (hex / `rgb()` / `hsl()` numeric only) |
| `svgMarkup` param to `buildPrintableHtml` | SVG XSS via `<script>`, `on*`, `url(javascript:)`, `<use href>` | `sanitizeSvgForEmbed` — DOMParser allowlist walk in browser, hardened regex in bare Node |
| `.agent` file path (MCP `render_agent_file`) | Path traversal, symlink exfil, arbitrary file read | Extension gate + symlink refusal + size cap in `resolve.ts` |
| Inline `.agent` JSON (MCP `render_agent_inline`) | Garbage-renderer / payload injection | Full JSON-Schema validation via Ajv at tool entry |
| Viewer `#<encoded-json>` URL form | Cache poisoning, brand-impersonation | Document that the hash is never sent to server; parse client-side only |

## Reporting a vulnerability

Email **security@knorq.ai** with a reproducer. We aim to acknowledge within
72 hours and issue a patch release within 14 days for confirmed issues.

Do **not** open public GitHub issues for security reports.

## Known limitations

- The SVG sanitizer is defense-in-depth, not a substitute for a page-level
  Content-Security-Policy. Production embedders should also set a strict CSP.
- `references[].filePath` is displayed as text; renderers do not follow it
  by default. If you build an editor that does, require explicit user consent
  per path.
- `.agent` documents declaring a major version greater than the renderer's
  `SPEC_MAJOR` are rendered with a warning banner, not rejected outright.
  Callers that require strict major-rejection should pre-filter.
