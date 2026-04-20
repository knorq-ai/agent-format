<!-- Thanks for contributing! Please keep the title short (<70 chars); detail goes in this body. -->

## Summary

<!-- What does this PR change and why? 1–3 bullets. -->

## Type of change

- [ ] Spec / schema change (touches `SPEC.md` or `schemas/agent.schema.json`)
- [ ] Renderer / viewer behavior
- [ ] MCP server behavior
- [ ] CLI validator behavior
- [ ] Docs / examples only
- [ ] Build / CI / tooling

## Breaking change?

- [ ] No
- [ ] Yes — CHANGELOG.md updated and migration notes below

<!-- If yes, describe who breaks and how they migrate. -->

## Test plan

<!-- What did you run locally? Check off what applies. -->

- [ ] `npm test` (all 74+ vitest cases green)
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Manually exercised the affected path (describe below)
- [ ] Adversarial XSS / schema payload attempted against `sanitize.ts` or `agent.schema.json`

## Security considerations

<!-- If this PR touches renderer HTML/SVG embedding, MCP path handling, URL
attrs, or the sanitizer: what's the new trust boundary? -->

- [ ] No security-relevant surface changed
- [ ] `SECURITY.md` threat-model table updated

## Related issues / PRs

<!-- Link with `Fixes #nnn` / `Refs #nnn` -->
