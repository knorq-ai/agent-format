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
})
