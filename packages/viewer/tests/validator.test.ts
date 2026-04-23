import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateAgentDoc } from '../src/validator'

describe('viewer validator', () => {
    it('validates a minimal document without throwing in the bundled environment', () => {
        const minimal = JSON.parse(
            readFileSync(resolve(process.cwd(), 'examples/minimal.agent'), 'utf8')
        )
        expect(() => validateAgentDoc(minimal)).not.toThrow()
        expect(validateAgentDoc(minimal)).toEqual({
            ok: true,
            doc: minimal,
        })
    })
})
