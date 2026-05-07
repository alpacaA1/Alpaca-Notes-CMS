import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { workspaceRoot } from '../build-paths'

const deployWorkflowPath = resolve(workspaceRoot, '.github', 'workflows', 'deploy-pages.yml')

describe('deploy workflow', () => {
  it('runs admin-app tests before building the site', () => {
    const workflow = readFileSync(deployWorkflowPath, 'utf8')
    const testCommandIndex = workflow.indexOf('npm test --workspace admin-app')
    const privateContentTestCommandIndex = workflow.indexOf('npm run test:sync-private-content')
    const buildCommandIndex = workflow.indexOf('npm run build')
    const privateContentCheckoutIndex = workflow.indexOf('repository: alpacaA1/Alpaca-Notes-Content')

    expect(testCommandIndex).toBeGreaterThan(-1)
    expect(privateContentTestCommandIndex).toBeGreaterThan(-1)
    expect(buildCommandIndex).toBeGreaterThan(-1)
    expect(privateContentCheckoutIndex).toBeGreaterThan(-1)
    expect(testCommandIndex).toBeLessThan(buildCommandIndex)
    expect(privateContentTestCommandIndex).toBeLessThan(buildCommandIndex)
  })

  it('checks out all public content source directories from the private content repo', () => {
    const workflow = readFileSync(deployWorkflowPath, 'utf8')

    expect(workflow).toContain('source/_posts')
    expect(workflow).toContain('source/read-later-items')
    expect(workflow).toContain('source/_knowledge')
    expect(workflow).toContain('source/images')
  })
})
