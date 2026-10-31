import { defineConfig } from 'vitest/config'

/**
 * The end-to-end layer: every spec here launches the built desktop app with
 * Playwright and drives the client the way a learner would. A cold launch boots a
 * whole Host, so the timeout is minutes rather than seconds, and one worker keeps
 * two Electron instances from fighting over the single-instance lock.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/ui/**/*.spec.ts'],
    globalSetup: process.platform === 'win32' ? ['../scripts/prepare-test-electron.mjs'] : [],
    maxWorkers: 1,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
})
