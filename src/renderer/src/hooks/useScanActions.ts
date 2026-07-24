/**
 * Provides scan text and scan image commands with streaming output management and auth enforcement.
 */

import { useCallback } from 'react'
import { App as AntdApp } from 'antd'
import { useTranslation } from 'react-i18next'
import { createLogger } from '@renderer/services/LoggerService'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import {
  completeScan,
  setPage,
  setPendingImage,
  setSettingsSection,
  startScan,
} from '@renderer/store/appSlice'

const logger = createLogger('ScanActions')

export const useScanActions = () => {
  const dispatch = useAppDispatch()
  const settings = useAppSelector((state) => state.app.settings)
  const scanState = useAppSelector((state) => state.app.scanState)
  const chatGpt = useAppSelector((state) => state.app.chatGpt)
  const { message } = AntdApp.useApp()
  const { t } = useTranslation()

  const ensureSignedIn = useCallback((): boolean => {
    if (chatGpt.status !== 'signed-in') {
      void message.warning(t('errors.chatGptRequired'))
      dispatch(setPage('settings'))
      dispatch(setSettingsSection('provider'))
      return false
    }
    return true
  }, [chatGpt.status, dispatch, message, t])

  const scanWithOverlay = useCallback(
    async (mode: 'text' | 'image', repeat = false) => {
      if (scanState !== 'idle') return
      if (!ensureSignedIn()) return
      dispatch(startScan({ mode }))
      dispatch(setPendingImage(null))
      try {
        const dataUrl = await window.app.requestScreenSelection(mode, repeat)
        if (!dataUrl) {
          dispatch(completeScan())
          return
        }
        dispatch(setPendingImage(dataUrl))
        if (mode === 'text') {
          await window.app.scanText({ text: '', imageDataUrl: dataUrl, settings })
        } else {
          await window.app.scanImage({ imageDataUrl: dataUrl, settings })
        }
      } catch (error) {
        logger.error(`${mode} scan failed.`, error)
        void message.error(t('errors.generic'))
      } finally {
        dispatch(completeScan())
      }
    },
    [scanState, ensureSignedIn, settings, dispatch, message, t],
  )

  const scanText = useCallback(
    async (text: string): Promise<void> => {
      if (scanState !== 'idle') return
      if (!ensureSignedIn()) return
      dispatch(startScan({ mode: 'text' }))
      try {
        await window.app.scanText({ text, settings })
      } catch (error) {
        logger.error('Text scan failed.', error)
        void message.error(t('errors.generic'))
      } finally {
        dispatch(completeScan())
      }
    },
    [scanState, ensureSignedIn, settings, dispatch, message, t],
  )

  const scanImage = useCallback(
    async (imageDataUrl: string, text?: string): Promise<void> => {
      if (scanState !== 'idle') return
      if (!ensureSignedIn()) return
      dispatch(startScan({ mode: 'image' }))
      try {
        await window.app.scanImage({ imageDataUrl, text, settings })
      } catch (error) {
        logger.error('Image scan failed.', error)
        void message.error(t('errors.generic'))
      } finally {
        dispatch(completeScan())
      }
    },
    [scanState, ensureSignedIn, settings, dispatch, message, t],
  )

  const cancelCurrentScan = useCallback(async (): Promise<void> => {
    if (scanState !== 'scanning') return
    try {
      await window.app.cancelScan()
    } catch {
      /* ignore */
    }
  }, [scanState])

  return {
    scanText,
    scanImage,
    scanWithOverlay,
    cancelCurrentScan,
    isScanning: scanState === 'scanning',
  }
}
