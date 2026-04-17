import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
    plugins: [react()],
    // For GitHub Pages at https://knorq-ai.github.io/agent-format/,
    // dev uses root so localhost:5180 keeps working.
    base: mode === 'production' ? '/agent-format/' : '/',
    server: {
        port: 5180,
    },
}))
