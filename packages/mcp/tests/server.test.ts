// Tests for resolveAgentFile — the MCP server's single entry point for
// reading a user-supplied path. Because an LLM controls the path, every gate
// in this function is a security boundary.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { resolveAgentFile, saveAgentFile } from '../src/resolve'

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

describe('saveAgentFile', () => {
    let tmp: string

    beforeEach(async () => {
        tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'af-mcp-save-'))
    })
    afterEach(async () => {
        await fs.rm(tmp, { recursive: true, force: true })
    })

    it('creates a new .agent file when none exists', async () => {
        const p = path.join(tmp, 'new.agent')
        const r = await saveAgentFile(p, VALID_AGENT)
        expect(r.ok).toBe(true)
        expect(r.bytesWritten).toBeGreaterThan(0)
        const roundtrip = JSON.parse(await fs.readFile(p, 'utf8'))
        expect(roundtrip.sections).toEqual([])
    })

    it('overwrites an existing .agent file atomically', async () => {
        const p = path.join(tmp, 'existing.agent')
        await fs.writeFile(p, JSON.stringify({ old: true }))
        const r = await saveAgentFile(p, VALID_AGENT)
        expect(r.ok).toBe(true)
        const roundtrip = JSON.parse(await fs.readFile(p, 'utf8'))
        expect(roundtrip.name).toBe('t')
    })

    it('leaves no leftover .tmp-* sibling files after a successful write', async () => {
        const p = path.join(tmp, 'clean.agent')
        await saveAgentFile(p, VALID_AGENT)
        const entries = await fs.readdir(tmp)
        expect(entries.filter((e) => e.includes('.tmp-'))).toEqual([])
    })

    it('rejects relative paths before touching the filesystem', async () => {
        const r = await saveAgentFile('relative.agent', VALID_AGENT)
        expect(r.ok).toBe(false)
        expect(r.message).toBe('filePath must be an absolute path')
    })

    it('rejects a non-.agent extension', async () => {
        const p = path.join(tmp, 'x.json')
        const r = await saveAgentFile(p, VALID_AGENT)
        expect(r.ok).toBe(false)
        expect(r.message).toContain('.agent extension')
    })

    it('refuses to overwrite a symlink', async () => {
        const target = path.join(tmp, 'target')
        await fs.writeFile(target, 'original')
        const link = path.join(tmp, 'link.agent')
        await fs.symlink(target, link)
        const r = await saveAgentFile(link, VALID_AGENT)
        expect(r.ok).toBe(false)
        expect(r.message.toLowerCase()).toContain('symlink')
        // Target must be untouched — this is the exfil-prevention claim.
        expect(await fs.readFile(target, 'utf8')).toBe('original')
    })

    it('refuses to overwrite a directory', async () => {
        const p = path.join(tmp, 'dir.agent')
        await fs.mkdir(p)
        const r = await saveAgentFile(p, VALID_AGENT)
        expect(r.ok).toBe(false)
        expect(r.message).toContain('not a regular file')
    })

    it('rejects data that is not shape-like (no sections array)', async () => {
        const p = path.join(tmp, 'bad.agent')
        const r = await saveAgentFile(p, { version: '0.1' })
        expect(r.ok).toBe(false)
        expect(r.message).toContain('not a valid .agent')
        // Must not have created a file when the shape check failed.
        await expect(fs.stat(p)).rejects.toThrow()
    })

    it('rejects payloads larger than MAX_AGENT_FILE_BYTES', async () => {
        const p = path.join(tmp, 'big.agent')
        // Build a .agent document whose serialized form exceeds 5 MB by
        // packing a giant string into `description`.
        const big = {
            ...VALID_AGENT,
            description: 'x'.repeat(5 * 1024 * 1024 + 10),
        }
        const r = await saveAgentFile(p, big)
        expect(r.ok).toBe(false)
        expect(r.message).toContain('limit')
        await expect(fs.stat(p)).rejects.toThrow()
    })

    it('pretty-prints with 2-space indent and trailing newline', async () => {
        const p = path.join(tmp, 'pretty.agent')
        await saveAgentFile(p, VALID_AGENT)
        const text = await fs.readFile(p, 'utf8')
        expect(text.endsWith('\n')).toBe(true)
        expect(text).toContain('\n  "version"')
    })
})
