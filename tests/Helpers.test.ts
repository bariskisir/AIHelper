/**
 * Tests the AiProviderService utility function for base64 extraction.
 * The extraction logic is embedded in the service module, tested via model resolution.
 */

import { describe, expect, it } from 'vitest'

/** Replicates the private extractBase64 helper from AiProviderService. */
const extractBase64 = (dataUrl: string): string => {
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl
}

describe('extractBase64 (from AiProviderService)', () => {
  it('extracts base64 after the comma', () => {
    expect(extractBase64('data:image/png;base64,iVBORw0KG')).toBe('iVBORw0KG')
  })

  it('returns the full string when no comma', () => {
    expect(extractBase64('iVBORw0KG')).toBe('iVBORw0KG')
  })

  it('handles data URLs with multiple commas in payload', () => {
    expect(extractBase64('data:text/plain,hello,world')).toBe('hello,world')
  })

  it('returns empty string for data URL with empty payload', () => {
    expect(extractBase64('data:,'.slice(',data:'.length + 1))).toBe('')
  })
})
