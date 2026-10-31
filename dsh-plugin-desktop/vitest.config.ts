import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    // `tests/ui` drives the real Electron app through Playwright (`yarn test:ui`).
    // It needs a built `lib/` and takes about a minute and a half, so it stays out
    // of the unit suite rather than doubling every `check`.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/ui/**'],
    globalSetup: process.platform === 'win32' ? ['../scripts/prepare-test-electron.mjs'] : [],
    // Keep patched packages in Vitest's module graph so mocks reach their
    // fs/promises and undici imports instead of using the live filesystem/network.
    server: {
      deps: {
        inline: ['@deepseek-ai/dsh-host-directory-picker-browse', '@deepseek-ai/dsh-native-command'],
      },
    },
    // Profile integration tests create a full package-junction closure; higher
    // Windows file concurrency makes their latency depend on NTFS/Defender load.
    maxWorkers: process.platform === 'win32' ? 2 : undefined,
    // Spawn-heavy specs start the packaged Electron binary. A cold Windows run
    // pays a one-off Defender scan of it (measured 22 s); the 5 s default turns
    // that machine cost into a failure. Warm runs finish in about 1 s.
    testTimeout: process.platform === 'win32' ? 60_000 : 5_000,
  },
})
