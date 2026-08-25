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
    runInNewContext(serviceWorkerSource, { self, caches, fetch, URL, Promise, Set })

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

  it('serves fonts from font cache when available (Cache-First)', async () => {
    const listeners = new Map<string, (event: Record<string, unknown>) => void>()
    const cachedFontResponse = { source: 'font-cache' }
    const fontCache = {
      match: vi.fn(async () => cachedFontResponse),
      put: vi.fn(),
    }
    const caches = {
      open: vi.fn(async (cacheName: string) => {
        if (cacheName === 'alpaca-fonts-v1') return fontCache
        return { match: vi.fn(), put: vi.fn() }
      }),
      keys: vi.fn(async () => []),
      delete: vi.fn(),
      match: vi.fn(),
    }
    const fetch = vi.fn()
    const self = {
      location: { origin: 'https://example.com' },
      addEventListener: vi.fn((type: string, listener: (event: Record<string, unknown>) => void) => {
        listeners.set(type, listener)
      }),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    }

    const serviceWorkerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
    runInNewContext(serviceWorkerSource, { self, caches, fetch, URL, Promise, Set })

    let responsePromise: Promise<unknown> | undefined
    listeners.get('fetch')?.({
      request: {
        method: 'GET',
        url: 'https://gstatic.loli.net/s/notosanssc/v36/test.woff2',
      },
      respondWith: (response: Promise<unknown>) => {
        responsePromise = response
      },
    })

    await expect(responsePromise).resolves.toBe(cachedFontResponse)
    expect(caches.open).toHaveBeenCalledWith('alpaca-fonts-v1')
    expect(fontCache.match).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fetches and caches fonts when not present in font cache', async () => {
    const listeners = new Map<string, (event: Record<string, unknown>) => void>()
    const networkFontResponse = {
      source: 'network-font',
      status: 200,
      type: 'opaque',
      clone: vi.fn(() => ({ source: 'network-font-clone' })),
    }
    const fontCache = {
      match: vi.fn(async () => null),
      put: vi.fn(),
    }
    const caches = {
      open: vi.fn(async (cacheName: string) => {
        if (cacheName === 'alpaca-fonts-v1') return fontCache
        return { match: vi.fn(), put: vi.fn() }
      }),
      keys: vi.fn(async () => []),
      delete: vi.fn(),
      match: vi.fn(),
    }
    const fetch = vi.fn(async () => networkFontResponse)
    const self = {
      location: { origin: 'https://example.com' },
      addEventListener: vi.fn((type: string, listener: (event: Record<string, unknown>) => void) => {
        listeners.set(type, listener)
      }),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    }

    const serviceWorkerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
    runInNewContext(serviceWorkerSource, { self, caches, fetch, URL, Promise, Set })

    let responsePromise: Promise<unknown> | undefined
    const fontRequest = {
      method: 'GET',
      url: 'https://fonts.loli.net/css2?family=Noto+Sans+SC',
    }
    listeners.get('fetch')?.({
      request: fontRequest,
      respondWith: (response: Promise<unknown>) => {
        responsePromise = response
      },
    })

    await expect(responsePromise).resolves.toBe(networkFontResponse)
    expect(caches.open).toHaveBeenCalledWith('alpaca-fonts-v1')
    expect(fetch).toHaveBeenCalledOnce()
    expect(fontCache.put).toHaveBeenCalledWith(fontRequest, { source: 'network-font-clone' })
  })

  it('preserves alpaca-fonts-v1 cache during activate cleanup', async () => {
    const listeners = new Map<string, (event: Record<string, unknown>) => void>()
    const deleteSpy = vi.fn()
    const caches = {
      open: vi.fn(),
      keys: vi.fn(async () => ['alpaca-cms-v1', 'alpaca-cms-v2', 'alpaca-fonts-v1', 'random-cache']),
      delete: deleteSpy,
      match: vi.fn(),
    }
    const fetch = vi.fn()
    const self = {
      location: { origin: 'https://example.com' },
      addEventListener: vi.fn((type: string, listener: (event: Record<string, unknown>) => void) => {
        listeners.set(type, listener)
      }),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
    }

    const serviceWorkerSource = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
    runInNewContext(serviceWorkerSource, { self, caches, fetch, URL, Promise, Set })

    let waitUntilPromise: Promise<unknown> | undefined
    listeners.get('activate')?.({
      waitUntil: (promise: Promise<unknown>) => {
        waitUntilPromise = promise
      },
    })

    await waitUntilPromise
    expect(deleteSpy).toHaveBeenCalledWith('alpaca-cms-v1')
    expect(deleteSpy).toHaveBeenCalledWith('random-cache')
    expect(deleteSpy).not.toHaveBeenCalledWith('alpaca-cms-v2')
    expect(deleteSpy).not.toHaveBeenCalledWith('alpaca-fonts-v1')
  })

  it('ships a standalone recovery page that unregisters workers and clears caches', () => {
    const resetPage = readFileSync(resolve(process.cwd(), 'public/reset-cache.html'), 'utf8')

    expect(resetPage).toContain('navigator.serviceWorker.getRegistrations()')
    expect(resetPage).toContain('registration.unregister()')
    expect(resetPage).toContain('caches.delete(cacheName)')
    expect(resetPage).toContain('?debug-list=1&cache-reset=')
  })
})
