import { describe, expect, it } from 'vitest'
import {
  MAX_IMAGE_UPLOAD_BYTES,
  buildImageMarkdown,
  buildImageUploadDescriptor,
  validateImageFile,
} from './image-upload'

describe('image upload helpers', () => {
  it('returns repo path, public URL, and default alt for unnamed clipboard png files', () => {
    const fixedDate = new Date('2026-04-15T08:09:10.123Z')
    const file = new File([Uint8Array.of(0x89, 0x50, 0x4e, 0x47)], '', { type: 'image/png' })

    expect(buildImageUploadDescriptor(file, fixedDate)).toEqual({
      repoPath: `source/images/2026/04/${fixedDate.getTime()}-pasted-image.png`,
      publicUrl: `/images/2026/04/${fixedDate.getTime()}-pasted-image.png`,
      defaultAlt: 'pasted-image',
    })
  })

  it('persists the validated MIME extension when filename and MIME type differ', () => {
    const fixedDate = new Date('2026-04-15T08:09:10.123Z')
    const file = new File([Uint8Array.of(0x89, 0x50, 0x4e, 0x47)], 'renamed.gif', {
      type: 'image/png',
    })

    expect(buildImageUploadDescriptor(file, fixedDate)).toEqual({
      repoPath: `source/images/2026/04/${fixedDate.getTime()}-renamed.png`,
      publicUrl: `/images/2026/04/${fixedDate.getTime()}-renamed.png`,
      defaultAlt: 'renamed',
    })
  })

  it('rejects unsupported svg files', () => {
    const file = new File(['<svg />'], 'diagram.svg', { type: 'image/svg+xml' })

    expect(() => validateImageFile(file)).toThrow('仅支持 PNG、JPG、WEBP 或 GIF 图片。')
  })

  it('rejects files larger than 10 MB', () => {
    const file = new File([new Uint8Array(MAX_IMAGE_UPLOAD_BYTES + 1)], 'large.png', {
      type: 'image/png',
    })

    expect(() => validateImageFile(file)).toThrow('图片大小不能超过 10 MB。')
  })

  it('builds markdown image syntax from alt text and public URL', () => {
    expect(buildImageMarkdown('pasted-image', '/images/2026/04/example.png')).toBe(
      '![pasted-image](/images/2026/04/example.png)',
    )
  })
})
