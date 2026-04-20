// Tests for resolveAgentFile — the MCP server's single entry point for
// reading a user-supplied path. Because an LLM controls the path, every gate
// in this function is a security boundary.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { resolveAgentFile } from '../src/resolve'

const VALID_AGENT = {
    version: '0.1',
    name: 't',
    createdAt: '2026-04-18T00:00:00Z',
    updatedAt: '2026-04-18T00:00:00Z',
    config: { proactive: false },
    sections: [],
    memory: { observations: [], preferences: {} },
}

describe('resolveAgentFile', () => {
    let tmp: string

    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'af-mcp-'))
    })
    afterEach(async () => {
        await fs.rm(tmp, { recursive: true, force: true })
    })

    it('accepts a valid .agent file', async () => {
        const p = path.join(tmp, 'ok.agent')
        await fs.writeFile(p, JSON.stringify(VALID_AGENT))
        const r = await resolveAgentFile(p)
        expect(r.ok).toBe(true)
        expect(r.sectionCount).toBe(0)
    })

    it('rejects a relative path before touching the filesystem', async () => {
        const r = await resolveAgentFile('relative.agent')
        expect(r.ok).toBe(false)
        expect(r.message).toBe('filePath must be an absolute path')
    })

    it('rejects a non-.agent extension (XYZ.txt, .json)', async () => {
        const p = path.join(tmp, 'x.json')
        await fs.writeFile(p, JSON.stringify(VALID_AGENT))
        const r = await resolveAgentFile(p)
        expect(r.ok).toBe(false)
        expect(r.message).toContain('.agent extension')
    })

    it('rejects case-insensitive .AGENT.TXT trailing-dot tricks', async () => {
        const p = path.join(tmp, 'x.agent.txt')
        await fs.writeFile(p, JSON.stringify(VALID_AGENT))
        const r = await resolveAgentFile(p)
        expect(r.ok).toBe(false)
    })

    it('accepts .AGENT (uppercase extension)', async () => {
        const p = path.join(tmp, 'ok.AGENT')
        await fs.writeFile(p, JSON.stringify(VALID_AGENT))
        const r = await resolveAgentFile(p)
        expect(r.ok).toBe(true)
    })

    it('rejects a symlink ending in .agent (symlink-to-sensitive-file exfil)', async () => {
        const target = path.join(tmp, 'secret')
        await fs.writeFile(target, 'sensitive bytes')
        const link = path.join(tmp, 'looks-safe.agent')
        await fs.symlink(target, link)
        const r = await resolveAgentFile(link)
        expect(r.ok).toBe(false)
        expect(r.message.toLowerCase()).toContain('symlink')
    })

    it('rejects a symlink even when its target is itself a valid .agent', async () => {
        const realAgent = path.join(tmp, 'real.agent')
        await fs.writeFile(realAgent, JSON.stringify(VALID_AGENT))
        const link = path.join(tmp, 'other.agent')
        await fs.symlink(realAgent, link)
        const r = await resolveAgentFile(link)
        // Refusing symlinks outright is stricter than strictly necessary here,
        // but it's the right default: it closes the symlink-to-outside-scope
        // class of bugs without needing realpath policy decisions.
        expect(r.ok).toBe(false)
        expect(r.message.toLowerCase()).toContain('symlink')
    })

    it('rejects directories ending in .agent', async () => {
        const p = path.join(tmp, 'dir.agent')
        await fs.mkdir(p)
        const r = await resolveAgentFile(p)
        expect(r.ok).toBe(false)
    })

    it('rejects files larger than MAX_AGENT_FILE_BYTES', async () => {
        const p = path.join(tmp, 'big.agent')
        // Write slightly over 5 MB.
        await fs.writeFile(p, 'a'.repeat(5 * 1024 * 1024 + 1))
        const r = await resolveAgentFile(p)
        expect(r.ok).toBe(false)
        expect(r.message).toContain('limit')
    })

    it('rejects malformed JSON', async () => {
        const p = path.join(tmp, 'bad.agent')
        await fs.writeFile(p, '{not json')
        await expect(resolveAgentFile(p)).rejects.toThrow()
    })

    it('rejects valid JSON that is not an agent document', async () => {
        const p = path.join(tmp, 'shape.agent')
        await fs.writeFile(p, JSON.stringify({ version: '0.1' })) // no sections array
        const r = await resolveAgentFile(p)
        expect(r.ok).toBe(false)
        expect(r.message).toContain('not a valid .agent')
    })
})
