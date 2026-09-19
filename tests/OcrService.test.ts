/**
 * Verifies OCR.space integration: API key enforcement, response parsing, and error handling.
 */

import { describe, expect, it, vi } from 'vitest'
import OcrService, { type OcrFetcher } from '../src/main/services/OcrService'
import { DEFAULT_SETTINGS } from '../src/shared/types'

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

describe('OcrService', () => {
  it('requires an API key when the OCR.space engine is selected', async () => {
    const service = new OcrService(vi.fn() as unknown as OcrFetcher)

    await expect(
      service.recognize(
        'data:image/png;base64,abc',
        { ...DEFAULT_SETTINGS, ocrEngine: 'ocrspace' },
        null,
      ),
    ).rejects.toThrow(/API key/)
  })

  it('parses and joins OCR.space page results', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ParsedResults: [{ ParsedText: 'First page' }, { ParsedText: 'Second page' }],
        IsErroredOnProcessing: false,
      }),
    )
    const service = new OcrService(fetcher as unknown as OcrFetcher)

    const text = await service.recognize(
      'data:image/png;base64,abc',
      { ...DEFAULT_SETTINGS, ocrEngine: 'ocrspace' },
      'test-key',
    )

    expect(text).toBe('First page\nSecond page')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('throws the OCR.space error message when processing fails', async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        IsErroredOnProcessing: true,
        ErrorMessage: 'Not a valid base64 image.',
      }),
    )
    const service = new OcrService(fetcher as unknown as OcrFetcher)

    await expect(
      service.recognize(
        'data:image/png;base64,abc',
        { ...DEFAULT_SETTINGS, ocrEngine: 'ocrspace' },
        'test-key',
      ),
    ).rejects.toThrow('Not a valid base64 image.')
  })

  it('throws when the OCR.space endpoint returns a non-OK status', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 429 }))
    const service = new OcrService(fetcher as unknown as OcrFetcher)

    await expect(
      service.recognize(
        'data:image/png;base64,abc',
        { ...DEFAULT_SETTINGS, ocrEngine: 'ocrspace' },
        'test-key',
      ),
    ).rejects.toThrow(/HTTP 429/)
  })
})
