/**
 * Composes the main scan workspace with text/image scanning and streaming output.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, Select, Tooltip, Typography } from 'antd'
import { Copy, FileText, Image, Send, StopCircle, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import { THINKING_LEVELS, type AppSettingsPatch, type ThinkingLevel } from '@shared/types'
import SessionsSidebar from '@renderer/components/sidebar/SessionsSidebar'
import { useScanActions } from '@renderer/hooks/useScanActions'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAppSelector } from '@renderer/store'
import styles from './HomePage.module.scss'

const { TextArea } = Input
const { Text } = Typography

/** Main workspace page handling text and image AI scans with streaming output. */
const HomePage = (): React.JSX.Element => {
  const { t } = useTranslation()
  const { scanText, scanWithOverlay, cancelCurrentScan, isScanning } = useScanActions()
  const { saveSettings } = useSettingsActions()
  const scanOutput = useAppSelector((state) => state.app.scanOutput)
  const scanState = useAppSelector((state) => state.app.scanState)
  const sessionsSidebarOpen = useAppSelector((state) => state.app.sessionsSidebarOpen)
  const compactMode = useAppSelector((state) => state.app.compactMode)
  const settings = useAppSelector((state) => state.app.settings)
  const chatGpt = useAppSelector((state) => state.app.chatGpt)
  const currentSession = useAppSelector((state) => state.app.currentSession)
  const pendingImage = useAppSelector((state) => state.app.pendingImage)
  const pendingInputText = useAppSelector((state) => state.app.pendingInputText)
  const pendingScanMode = useAppSelector((state) => state.app.pendingScanMode)

  const [inputText, setInputText] = useState('')
  const [hasManualInput, setHasManualInput] = useState(false)
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [lastSessionId, setLastSessionId] = useState<string | null>(null)

  // Sync input text when current session changes
  useEffect(() => {
    if (currentSession?.id !== lastSessionId) {
      const latest = currentSession?.item
      setInputText(latest?.input || '')
      setHasManualInput(false)
      setLastSessionId(currentSession?.id ?? null)
    }
  }, [currentSession, lastSessionId])

  // Keyboard shortcut listener
  useEffect(() => {
    const cleanup = window.aihelper.onShortcut((shortcut) => {
      if (shortcut === 'scan-text') {
        void scanWithOverlay('text', false)
      } else if (shortcut === 'scan-image') {
        void scanWithOverlay('image', false)
      } else if (shortcut === 'repeat-text') {
        void scanWithOverlay('text', true)
      } else if (shortcut === 'repeat-image') {
        void scanWithOverlay('image', true)
      }
    })
    return cleanup
  }, [scanWithOverlay])

  /** Select option shape for the model dropdown. */
  interface ModelOption {
    value: string
    label: string
  }

  const modelOptions = useMemo((): ModelOption[] => {
    return chatGpt.models.map((m) => ({
      value: m.id,
      label: m.displayName || m.id,
    }))
  }, [chatGpt.models])

  const textModelValue = settings.textModel || settings.chatGptModel
  const imageModelValue = settings.imageModel || settings.chatGptModel

  const textThinkingValue = settings.textThinkingLevel || 'low'
  const imageThinkingValue = settings.imageThinkingLevel || 'low'

  /** Persists a model selection for the given scan mode and auto-selects a compatible thinking variant. */
  const handleModeModelChange = async (mode: 'text' | 'image', modelId: string) => {
    if (!modelId) return
    const patch: AppSettingsPatch = {
      chatGptModel: modelId,
    }
    const selectedModel = chatGpt.models.find((m) => m.id === modelId)
    if (mode === 'text') {
      patch.textModel = modelId
      if (selectedModel?.thinkingVariants?.length) {
        const hasCurrent = selectedModel.thinkingVariants.some((v) => v.value === textThinkingValue)
        if (!hasCurrent && selectedModel.thinkingVariants[0]) {
          patch.textThinkingLevel = selectedModel.thinkingVariants[0].value as ThinkingLevel
        }
      }
    } else {
      patch.imageModel = modelId
      if (selectedModel?.thinkingVariants?.length) {
        const hasCurrent = selectedModel.thinkingVariants.some(
          (v) => v.value === imageThinkingValue,
        )
        if (!hasCurrent && selectedModel.thinkingVariants[0]) {
          patch.imageThinkingLevel = selectedModel.thinkingVariants[0].value as ThinkingLevel
        }
      }
    }
    await saveSettings(patch)
  }

  /** Persists a thinking level for the given scan mode. */
  const saveModeThinking = async (mode: 'text' | 'image', v: ThinkingLevel) => {
    if (mode === 'text') {
      await saveSettings({ textThinkingLevel: v })
    } else {
      await saveSettings({ imageThinkingLevel: v })
    }
  }

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    setHasManualInput(e.target.value.trim().length > 0)
  }, [])

  /** Initiates a manual text scan with the current input content. */
  const handleManualSend = useCallback(async () => {
    if (!inputText.trim()) return
    await scanText(inputText.trim())
  }, [inputText, scanText])

  const allPrompts = settings.systemPrompts || []
  const textPrompts = allPrompts.filter(
    (p) =>
      p.type === 'text' ||
      p.id === 'text-solver' ||
      p.id === 'solver' ||
      (!p.type && !p.isBuiltIn && p.id !== 'image-solver'),
  )
  const imagePrompts = allPrompts.filter(
    (p) =>
      p.type === 'image' ||
      p.id === 'image-solver' ||
      (!p.type && !p.isBuiltIn && p.id !== 'text-solver'),
  )
  const showPromptRow = textPrompts.length > 1 || imagePrompts.length > 1

  const isScanActive = scanState === 'scanning' || scanState === 'cancelling'
  const latestItem = currentSession?.item
  // Prefer live pending image; during scan show pending image only, fall back to session when idle.
  const displayImage = isScanActive
    ? pendingImage
    : pendingImage || latestItem?.imageDataUrl || null
  // pendingScanMode is set during a scan + after session lands for image sessions.
  const activeScanMode = pendingScanMode || latestItem?.scanMode || null
  const displayInputText = isScanActive
    ? hasManualInput
      ? inputText
      : (pendingInputText ?? '')
    : hasManualInput
      ? inputText
      : latestItem?.input || (displayImage ? '' : inputText)
  const outputText = isScanActive ? scanOutput : scanOutput || latestItem?.output || ''

  /** Copies the current output text to the system clipboard. */
  const handleCopy = useCallback(async () => {
    if (outputText) {
      await navigator.clipboard.writeText(outputText)
    }
  }, [outputText])

  /** Copies the current input text to the system clipboard. */
  const handleCopyInput = useCallback(async () => {
    if (displayInputText) {
      await navigator.clipboard.writeText(displayInputText)
    }
  }, [displayInputText])

  const hasModels = modelOptions.length > 0

  /** Renders the model and thinking-variant selector row for a given scan mode. */
  const renderModeControls = (mode: 'text' | 'image') => {
    const value = mode === 'text' ? textModelValue : imageModelValue
    const selectedModel = chatGpt.models.find((m) => m.id === value) ?? chatGpt.models[0]
    const thinkingOptions =
      selectedModel?.thinkingVariants && selectedModel.thinkingVariants.length > 0
        ? selectedModel.thinkingVariants.map((v) => ({
            value: v.value,
            label: v.value,
          }))
        : THINKING_LEVELS.map((l) => ({ value: l, label: l }))

    return (
      <div className={styles.modeOptions}>
        <Select
          size="small"
          className={styles.modeSelect ?? ''}
          value={hasModels ? value || undefined : undefined}
          options={modelOptions}
          onChange={(v) => void handleModeModelChange(mode, v ?? '')}
          disabled={isScanning || !hasModels}
          placeholder={hasModels ? 'Model' : 'No models'}
        />
        <Select
          size="small"
          value={mode === 'text' ? textThinkingValue : imageThinkingValue}
          options={thinkingOptions}
          onChange={(v) => {
            void saveModeThinking(mode, (v ?? 'low') as ThinkingLevel)
          }}
          disabled={isScanning}
          placeholder="Thinking"
          className={styles.modeSelect ?? ''}
        />
      </div>
    )
  }

  return (
    <main className={styles.container}>
      {!compactMode && sessionsSidebarOpen && <SessionsSidebar />}
      <section className={styles.workspace}>
        {!hasManualInput ? (
          <div className={styles.toolbar}>
            <div className={styles.modeColumn}>
              <Button
                type="primary"
                className={styles.scanBtn ?? ''}
                icon={<FileText size={18} />}
                onClick={() => void scanWithOverlay('text')}
                disabled={isScanning || (chatGpt.status === 'signed-in' && !hasModels)}
              >
                <span className={styles.scanLabel}>{t('home.scanText')}</span>
                <span className={styles.scanShortcut}>
                  Ctrl+Shift+T | {t('home.repeat')}: Ctrl+Shift+1
                </span>
              </Button>
              {renderModeControls('text')}
            </div>

            <div className={styles.modeColumn}>
              <Button
                className={styles.scanImgBtn ?? ''}
                icon={<Image size={16} />}
                onClick={() => void scanWithOverlay('image')}
                disabled={isScanning || (chatGpt.status === 'signed-in' && !hasModels)}
              >
                <span className={styles.scanLabel}>{t('home.scanImage')}</span>
                <span className={styles.scanShortcut}>
                  Ctrl+Shift+Y | {t('home.repeat')}: Ctrl+Shift+2
                </span>
              </Button>
              {renderModeControls('image')}
            </div>
          </div>
        ) : (
          <div className={styles.toolbar}>
            <div className={styles.sendRow}>
              <Button
                type="primary"
                block
                size="large"
                icon={<Send size={16} />}
                onClick={() => void handleManualSend()}
                disabled={isScanning || !inputText.trim()}
              >
                {t('home.send')}
              </Button>
              {isScanning && (
                <Button
                  block
                  danger
                  size="large"
                  icon={<StopCircle size={16} />}
                  onClick={() => void cancelCurrentScan()}
                >
                  {t('home.cancel')}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className={styles.ioArea}>
          <div className={styles.ioHalf}>
            {/* ── Input — Image ── */}
            <div className={styles.ioHeader}>
              <Text type="secondary" className={styles.ioHeaderLabel || ''}>
                {t('home.inputImage')}
              </Text>
            </div>
            <div className={styles.inputImagePane}>
              {displayImage ? (
                // biome-ignore lint/a11y/useSemanticElements: clickable container wrapping preview image
                <div
                  className={
                    activeScanMode === 'image' ? styles.imageOnlyWrap : styles.imageTopWrap
                  }
                  role="button"
                  tabIndex={0}
                  onClick={() => setZoomedImage(displayImage)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setZoomedImage(displayImage)
                  }}
                >
                  <img
                    src={displayImage}
                    alt="Scan preview"
                    className={
                      activeScanMode === 'image' ? styles.imageOnlyImg : styles.imageTopImg
                    }
                  />
                </div>
              ) : (
                <div className={styles.imagePlaceholder}>
                  <Text type="secondary">{t('home.noImage')}</Text>
                </div>
              )}
            </div>

            {/* ── Input — OCR ── */}
            <div className={styles.ioHeader}>
              <Text type="secondary" className={styles.ioHeaderLabel || ''}>
                {t('home.inputOcr')}
              </Text>
              <Tooltip title={t('home.copyInput')}>
                <Button
                  size="small"
                  type="text"
                  icon={<Copy size={14} />}
                  onClick={() => void handleCopyInput()}
                  disabled={!displayInputText}
                />
              </Tooltip>
            </div>
            <div className={styles.inputTextPane}>
              {activeScanMode !== 'image' && displayImage ? (
                /* Text scan — OCR output read-only */
                <div className={styles.ocrTextReadonly}>
                  <Text type="secondary">{displayInputText || t('home.inputPlaceholder')}</Text>
                </div>
              ) : activeScanMode !== 'image' ? (
                /* Pure text — editable */
                <TextArea
                  value={displayInputText}
                  onChange={handleInputChange}
                  placeholder={t('home.inputPlaceholder')}
                  disabled={isScanning}
                  className={styles.inputTextArea || ''}
                />
              ) : (
                /* Image scan — text input not applicable */
                <div className={styles.ocrTextReadonly}>
                  <Text type="secondary">—</Text>
                </div>
              )}
            </div>
          </div>
          <div className={styles.ioHalf}>
            <div className={styles.ioHeader}>
              <Text type="secondary" className={styles.ioHeaderLabel || ''}>
                {t('home.output')}
              </Text>
              <Tooltip title={t('home.copy')}>
                <Button
                  size="small"
                  type="text"
                  icon={<Copy size={14} />}
                  onClick={() => void handleCopy()}
                  disabled={!outputText}
                />
              </Tooltip>
            </div>
            <div className={styles.outputPane}>
              {outputText ? (
                <div className={styles.outputContent}>
                  <ReactMarkdown>{outputText}</ReactMarkdown>
                </div>
              ) : (
                <div className={styles.outputContent}>
                  <Text type="secondary" className={styles.outputPlaceholder || ''}>
                    {scanState === 'scanning' ? '...' : t('home.outputPlaceholder')}
                  </Text>
                </div>
              )}
            </div>
          </div>
        </div>

        {showPromptRow && (
          <div className={styles.promptRow}>
            <div className={styles.promptCol}>
              <Text type="secondary" className={styles.promptColLabel || ''}>
                {t('home.systemPrompt')}
              </Text>
              <Select
                size="small"
                className={styles.promptColSelect || ''}
                value={settings.textSystemPromptPreset || 'text-solver'}
                options={textPrompts.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(v) => {
                  void saveSettings({ textSystemPromptPreset: v })
                }}
              />
            </div>
            <div className={styles.promptCol}>
              <Text type="secondary" className={styles.promptColLabel || ''}>
                {t('home.systemPrompt')}
              </Text>
              <Select
                size="small"
                className={styles.promptColSelect || ''}
                value={settings.imageSystemPromptPreset || 'image-solver'}
                options={imagePrompts.map((p) => ({ value: p.id, label: p.name }))}
                onChange={(v) => {
                  void saveSettings({ imageSystemPromptPreset: v })
                }}
              />
            </div>
          </div>
        )}
      </section>

      {/* Image zoom overlay */}
      {zoomedImage ? (
        // biome-ignore lint/a11y/useSemanticElements: backdrop overlay container
        <div
          className={styles.zoomOverlay}
          role="button"
          tabIndex={0}
          onClick={() => setZoomedImage(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') setZoomedImage(null)
          }}
        >
          <Button
            type="text"
            icon={<X size={24} />}
            onClick={(e) => {
              e.stopPropagation()
              setZoomedImage(null)
            }}
            className={styles.zoomCloseBtn || ''}
          />
          <img
            src={zoomedImage}
            alt="Zoomed scan preview"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className={styles.zoomImg}
          />
        </div>
      ) : null}
    </main>
  )
}

export default HomePage
