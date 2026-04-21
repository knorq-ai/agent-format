import { describe, expect, it } from 'vitest'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSkill, SKILL_URIS, skillText } from '../src/skill'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Tests read the source-of-truth skill dir (packages/claude-plugin/skills/...)
// rather than the build artifact, so they pass before `npm run build`.
const SKILL_DIR = path.resolve(__dirname, '..', '..', 'claude-plugin', 'skills', 'agent-format')

describe('loadSkill', () => {
    const bundle = loadSkill(SKILL_DIR)

    it('loads all three skill files with non-empty content', () => {
        expect(bundle.main.length).toBeGreaterThan(0)
        expect(bundle.sectionTypes.length).toBeGreaterThan(0)
        expect(bundle.examples.length).toBeGreaterThan(0)
    })

    it('main guide leads with frontmatter and the skill body', () => {
        expect(bundle.main.startsWith('---')).toBe(true)
        expect(bundle.main).toContain('agent-format-visualize')
    })

    it('skillText routes each section to the right file', () => {
        expect(skillText(bundle, 'main')).toBe(bundle.main)
        expect(skillText(bundle, 'section-types')).toBe(bundle.sectionTypes)
        expect(skillText(bundle, 'examples')).toBe(bundle.examples)
    })

    it('SKILL_URIS are namespaced and stable', () => {
        expect(SKILL_URIS.main).toBe('agent-format://skill/main')
        expect(SKILL_URIS['section-types']).toBe('agent-format://skill/section-types')
        expect(SKILL_URIS.examples).toBe('agent-format://skill/examples')
    })
})
