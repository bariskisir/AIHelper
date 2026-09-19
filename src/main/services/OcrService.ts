/**
 * Extracts text from captured images using either the built-in Tesseract engine
 * or the online OCR.space API.
 */

import type { AppSettings } from '@shared/types'
import { createWorker } from 'tesseract.js'
import { z } from 'zod'
import { httpFetch } from '../http/http.fetch'

const OCR_SPACE_ENDPOINT = 'https://api.ocr.space/parse/image'

/** Validates the subset of the OCR.space response consumed by the application. */
const ocrSpaceResponseSchema = z.object({
  ParsedResults: z
    .array(
      z.object({
        ParsedText: z.string().nullable().optional(),
        ErrorMessage: z.string().nullable().optional(),
        ErrorDetails: z.string().nullable().optional(),
      }),
    )
    .optional(),
  OCRExitCode: z.union([z.string(), z.number()]).optional(),
  IsErroredOnProcessing: z.boolean().optional(),
  ErrorMessage: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional(),
  ErrorDetails: z
    .union([z.string(), z.array(z.string())])
    .nullable()
    .optional(),
})

/** Fetch-compatible function signature so tests can inject a stub network client. */
export type OcrFetcher = typeof fetch

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>

/** Provides OCR text extraction backed by Tesseract or OCR.space. */
export default class OcrService {
  private workerPromise: Promise<TesseractWorker> | null = null

  public constructor(private readonly fetcher: OcrFetcher = httpFetch) {}

  /** Recognizes text using the engine configured in settings. */
  public async recognize(
    imageDataUrl: string,
    settings: AppSettings,
    ocrSpaceApiKey: string | null,
  ): Promise<string> {
    if (settings.ocrEngine === 'ocrspace') {
      if (!ocrSpaceApiKey) throw new Error('An OCR.space API key is required.')
      return this.recognizeWithOcrSpace(imageDataUrl, ocrSpaceApiKey)
    }
    return this.recognizeWithTesseract(imageDataUrl)
  }

  /** Runs the shared Tesseract worker and returns the recognized text. */
  private async recognizeWithTesseract(imageDataUrl: string): Promise<string> {
    const worker = await this.getWorker()
    const result = await worker.recognize(imageDataUrl)
    return result.data.text.trim()
  }

  /** Returns a lazily created Tesseract worker shared across scans. */
  private async getWorker(): Promise<TesseractWorker> {
    if (!this.workerPromise) this.workerPromise = createWorker('eng')
    return this.workerPromise
  }

  /** Sends the image to OCR.space and returns the concatenated page text. */
  private async recognizeWithOcrSpace(imageDataUrl: string, apiKey: string): Promise<string> {
    const form = new FormData()
    form.append('base64Image', imageDataUrl)
    form.append('language', 'eng')
    form.append('isOverlayRequired', 'false')
    form.append('OCREngine', '2')

    const response = await this.fetcher(OCR_SPACE_ENDPOINT, {
      method: 'POST',
      headers: { apikey: apiKey },
      body: form,
    })
    if (!response.ok) {
      throw new Error(`OCR.space request failed with HTTP ${response.status}.`)
    }

    const parsed = ocrSpaceResponseSchema.parse(await response.json())
    if (parsed.IsErroredOnProcessing) {
      const detail = this.readError(parsed.ErrorMessage ?? parsed.ErrorDetails)
      throw new Error(detail ?? 'OCR.space could not process the image.')
    }

    return (parsed.ParsedResults ?? [])
      .map((result) => result.ParsedText ?? '')
      .join('\n')
      .trim()
  }

  /** Normalizes OCR.space error payloads that may be a string or a string array. */
  private readError(value: string | string[] | null | undefined): string | null {
    if (!value) return null
    return Array.isArray(value) ? value.join(' ') : value
  }
}
