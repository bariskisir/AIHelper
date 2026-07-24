/**
 * Bootstraps renderer state and binds all main-to-renderer lifecycle events.
 */

import { useEffect, useRef } from 'react'
import { App as AntdApp } from 'antd'
import i18n from '@renderer/i18n'
import { createLogger } from '@renderer/services/LoggerService'
import {
  hydrate,
  setChatGptState,
  setCurrentSession,
  setSessions,
  setUpdateState,
  appendScanOutput,
  completeScan,
  setPendingInputText,
} from '@renderer/store/appSlice'
import { useAppDispatch } from '@renderer/store'

const logger = createLogger('AppInit')

/** Loads persisted state and maintains typed IPC subscriptions for the app lifetime. */
export const useAppInit = (): void => {
  const dispatch = useAppDispatch()
  const { message } = AntdApp.useApp()
  const messageRef = useRef(message)

  useEffect(() => {
    messageRef.current = message
  }, [message])

  useEffect(() => {
    let active = true
    const cleanups = [
      window.app.onAiResult((event) => {
        if (event.inputText !== undefined) {
          dispatch(setPendingInputText(event.inputText))
        }
        if (event.isComplete) {
          dispatch(completeScan())
        } else if (event.delta) {
          dispatch(appendScanOutput(event.delta))
        }
      }),
      window.app.onSessionUpdated((event) => {
        dispatch(setSessions(event.sessions))
        if (event.currentSession) {
          dispatch(setCurrentSession(event.currentSession))
        }
      }),
      window.app.onChatGptState((state) => {
        dispatch(setChatGptState(state))
      }),
      window.app.onUpdateState((event) => dispatch(setUpdateState(event))),
      window.app.onError((event) => {
        logger.error('Main process reported an application error.', event.message)
        void messageRef.current.error(event.message, 8)
      }),
    ]

    void window.app
      .bootstrap()
      .then(async (payload) => {
        if (!active) return
        dispatch(hydrate(payload))
        document.documentElement.lang = payload.settings.uiLanguage
        await i18n.changeLanguage(payload.settings.uiLanguage)
      })
      .catch((error) => {
        logger.error('Renderer bootstrap failed.', error)
        void messageRef.current.error('Application failed to initialize.')
      })

    return () => {
      active = false
      cleanups.forEach((unsubscribe) => {
        unsubscribe()
      })
    }
  }, [dispatch])
}
