// Minimal stand-in for 'electron' when bundling the offline checks with esbuild
// (--alias:electron=./src/main/__checks__/electron-stub.ts). Only what config.ts uses.
const root = (): string => process.env.AICW_CHECK_ROOT ?? process.cwd()

export const app = {
  isPackaged: false,
  getAppPath: root,
  getPath: (_name: string): string => root()
}
