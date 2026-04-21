import * as fs from 'node:fs'
import * as path from 'node:path'

// The authoring skill is vendored into `dist/skill/` at build time (see the
// `build` script in package.json) from packages/claude-plugin/skills/agent-format/.
// Single source of truth — if you edit the skill, edit it in claude-plugin and
// rebuild; don't edit the vendored copy.

export type SkillSection = 'main' | 'section-types' | 'examples'

export interface SkillBundle {
    main: string
    sectionTypes: string
    examples: string
}

export function loadSkill(skillDir: string): SkillBundle {
    return {
        main: fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'),
        sectionTypes: fs.readFileSync(path.join(skillDir, 'references', 'section-types.md'), 'utf8'),
        examples: fs.readFileSync(path.join(skillDir, 'references', 'examples.md'), 'utf8'),
    }
}

export function skillText(bundle: SkillBundle, section: SkillSection): string {
    switch (section) {
        case 'section-types':
            return bundle.sectionTypes
        case 'examples':
            return bundle.examples
        case 'main':
        default:
            return bundle.main
    }
}

// URI scheme for skill resources. Namespaced under the server so clients can
// filter / group; the `main` entry is the one to surface first in listings.
export const SKILL_URIS: Record<SkillSection, string> = {
    main: 'agent-format://skill/main',
    'section-types': 'agent-format://skill/section-types',
    examples: 'agent-format://skill/examples',
}
