import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

describe('admin service worker', () => {
  it('uses the network response for navigations even when an old page is cached', async () => {
    const listeners = new Map<string, (event: Record<string, unknown>) => void>()
    const cachedResponse = { source: 'cache' }
    const networkResponse = {
      source: 'network',
      status: 200,
      type: 'basic',
      clone: vi.fn(() => ({ source: 'network-clone' })),
    }
    const cache = { addAll: vi.fn(), put: vi.fn() }
    const caches = {
      open: vi.fn(async () => cache),
      keys: vi.fn(async () => []),
      delete: vi.fn(),
      match: vi.fn(async () => cachedResponse),
    }
    const fetch = vi.fn(async () => networkResponse)
    const self = {
      location: { origin: 'https://example.com' },
      addEventListener: vi.fn((type: string, listener: (event: Record<string, unknown>) => void) => {
        listeners.set(type, listener)
      }),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    }

    const serviceWorkerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
    runInNewContext(serviceWorkerSource, { self, caches, fetch, URL, Promise })

    let responsePromise: Promise<unknown> | undefined
    listeners.get('fetch')?.({
      request: {
        method: 'GET',
        mode: 'navigate',
        url: 'https://example.com/Alpaca-Notes-CMS/admin/',
      },
      respondWith: (response: Promise<unknown>) => {
        responsePromise = response
      },
    })

    await expect(responsePromise).resolves.toBe(networkResponse)
    expect(fetch).toHaveBeenCalledOnce()
    expect(caches.match).not.toHaveBeenCalled()
  })
})
