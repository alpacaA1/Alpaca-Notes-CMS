import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { workspaceRoot } from '../build-paths'

const deployWorkflowPath = resolve(workspaceRoot, '.github', 'workflows', 'deploy-pages.yml')

describe('deploy workflow', () => {
  it('runs admin-app tests before building the site', () => {
    const workflow = readFileSync(deployWorkflowPath, 'utf8')
    const testCommandIndex = workflow.indexOf('npm test --workspace admin-app')
    const buildCommandIndex = workflow.indexOf('npm run build')

    expect(testCommandIndex).toBeGreaterThan(-1)
    expect(buildCommandIndex).toBeGreaterThan(-1)
    expect(testCommandIndex).toBeLessThan(buildCommandIndex)
  })
})
