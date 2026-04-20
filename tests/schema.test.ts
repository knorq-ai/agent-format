// Validates that the committed example .agent files round-trip against the
// public JSON Schema. Catches drift between spec, schema, and examples before
// it lands in a release.
import { describe, expect, it } from 'vitest'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(__dirname, '..')
const schema = JSON.parse(readFileSync(join(ROOT, 'schemas/agent.schema.json'), 'utf8'))
const examples = readdirSync(join(ROOT, 'examples'))
    .filter((f) => f.endsWith('.agent'))
    .map((f) => ({
        name: f,
        data: JSON.parse(readFileSync(join(ROOT, 'examples', f), 'utf8')),
    }))

describe('JSON Schema', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false })
    addFormats(ajv)
    const validate = ajv.compile(schema)

    it('schema itself is a valid JSON Schema 2020-12 document', () => {
        expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    })

    for (const { name, data } of examples) {
        it(`examples/${name} validates against schemas/agent.schema.json`, () => {
            const ok = validate(data)
            if (!ok) {
                throw new Error(
                    `${name} failed validation:\n` +
                        JSON.stringify(validate.errors, null, 2)
                )
            }
            expect(ok).toBe(true)
        })
    }

    // Negative cases: prove the closed-schema claim holds.
    const base = {
        version: '0.1',
        name: 't',
        createdAt: '2026-04-18T00:00:00Z',
        updatedAt: '2026-04-18T00:00:00Z',
        config: { proactive: false },
        sections: [],
        memory: { observations: [], preferences: {} },
    }

    it('rejects unknown top-level property', () => {
        const bad = { ...base, bogusTopLevel: 123 }
        expect(validate(bad)).toBe(false)
    })

    it('accepts top-level x-* extension fields (§ 7.1)', () => {
        const ok = { ...base, 'x-acme-snapshot-id': 'abc' }
        expect(validate(ok)).toBe(true)
    })

    it('accepts an x-<vendor>:<name> extension section type (§ 7.2)', () => {
        const ok = {
            ...base,
            sections: [
                {
                    id: 's1',
                    type: 'x-acme:burndown-chart',
                    label: 'Burndown',
                    order: 0,
                    data: { whatever: 42 },
                },
            ],
        }
        expect(validate(ok)).toBe(true)
    })

    it('rejects a bare unknown section type (must use x-<vendor>:<name>)', () => {
        const bad = {
            ...base,
            sections: [
                {
                    id: 's1',
                    type: 'custom-widget',
                    label: 'X',
                    order: 0,
                    data: {},
                },
            ],
        }
        expect(validate(bad)).toBe(false)
    })

    it('rejects extra property inside a closed nested object', () => {
        const bad = {
            ...base,
            sections: [
                {
                    id: 's1',
                    type: 'notes',
                    label: 'N',
                    order: 0,
                    data: {
                        blocks: [{ id: 'b1', content: 'hi', extra: 'nope' }],
                    },
                },
            ],
        }
        expect(validate(bad)).toBe(false)
    })

    it('rejects a section missing its required `data`', () => {
        const bad = {
            ...base,
            sections: [
                { id: 's1', type: 'notes', label: 'N', order: 0 },
            ],
        }
        expect(validate(bad)).toBe(false)
    })
})
