/**
 * Adds the typed preload bridge to the renderer Window interface.
 */

import type { AiHelperApi } from '@shared/types'

declare global {
  interface Window {
    app: AiHelperApi
  }
}
