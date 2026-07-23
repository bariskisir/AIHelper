/**
 * Exposes renderer commands for persisted settings and provider credentials.
 */

import { useCallback } from 'react'
import { App as AntdApp } from 'antd'
import { useTranslation } from 'react-i18next'
import type { AppSettingsPatch } from '@shared/types'
import i18n from '@renderer/i18n'
import { createLogger } from '@renderer/services/LoggerService'
import SettingsPersistenceQueue from '@renderer/services/SettingsPersistenceQueue'
import { useAppDispatch } from '@renderer/store'
import { setSettings } from '@renderer/store/appSlice'

const logger = createLogger('SettingsActions')
const settingsPersistenceQueue = new SettingsPersistenceQueue()

/** Returns stable settings and credential commands backed by the preload API. */
export const useSettingsActions = () => {
  const dispatch = useAppDispatch()
  const { message } = AntdApp.useApp()
  const { t } = useTranslation()

  /** Serializes a partial settings update so rapid controls cannot overwrite each other. */
  const saveSettings = useCallback(
    async (patch: AppSettingsPatch): Promise<void> => {
      try {
        const saved = await settingsPersistenceQueue.enqueue(patch, window.aihelper.saveSettings)
        dispatch(setSettings(saved))
        document.documentElement.lang = saved.uiLanguage
        await i18n.changeLanguage(saved.uiLanguage)
      } catch (error) {
        logger.error('Settings could not be saved.', error)
        void message.error(t('errors.generic'))
      }
    },
    [dispatch, message, t],
  )

  /** Saves the custom provider API key. */
  const saveApiKey = useCallback(
    async (apiKey: string): Promise<boolean> => {
      try {
        await window.aihelper.saveApiKey(apiKey)
        void message.success(t('notices.apiKeySaved'))
        return true
      } catch (error) {
        logger.error('API key validation failed.', error)
        void message.error(t('errors.generic'))
        return false
      }
    },
    [message, t],
  )

  /** Removes the encrypted API key. */
  const deleteApiKey = useCallback(async (): Promise<boolean> => {
    try {
      await window.aihelper.deleteApiKey()
      void message.success(t('notices.apiKeyRemoved'))
      return true
    } catch (error) {
      logger.error('API key could not be removed.', error)
      void message.error(t('errors.generic'))
      return false
    }
  }, [message, t])

  return { deleteApiKey, saveApiKey, saveSettings }
}
