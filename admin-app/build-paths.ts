import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const adminAppRoot = fileURLToPath(new URL('.', import.meta.url))
export const workspaceRoot = resolve(adminAppRoot, '..')
export const sourceAdminDir = resolve(workspaceRoot, 'source', 'admin')
export const sourceAdminAssetsDir = resolve(sourceAdminDir, 'assets')
export const legacyAdminDir = resolve(workspaceRoot, 'docs', 'legacy-admin')
