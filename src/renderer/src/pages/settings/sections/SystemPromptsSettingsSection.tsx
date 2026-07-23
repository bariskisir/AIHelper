/**
 * Renders the System Prompts management page for text and image scan prompts.
 */

import { useState } from 'react'
import { Button, Input, Modal, Select } from 'antd'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AppSettings, SystemPrompt } from '@shared/types'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useTheme } from '@renderer/context/ThemeProvider'
import { useAppSelector } from '@renderer/store'
import SettingLabel from '../components/SettingLabel'
import styles from '../SettingsPage.module.scss'

/** Generates a short unique identifier for custom prompts. */
const uid = () => Math.random().toString(36).slice(2, 10)

/** Settings section for creating, editing, deleting, and selecting text and image system prompts. */
const SystemPromptsSettingsSection = (): React.JSX.Element => {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const light = theme === 'light'
  const okButtonProps = light ? { ghost: true as const } : {}
  const settings = useAppSelector((state) => state.app.settings)
  const { saveSettings } = useSettingsActions()
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)

  /** Persists a partial settings update locally and to the main process. */
  const save = async (patch: Partial<AppSettings>) => {
    const updated = { ...localSettings, ...patch }
    setLocalSettings(updated)
    await saveSettings(patch)
  }

  const allPrompts = localSettings.systemPrompts || []
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

  const currentTextPrompt =
    textPrompts.find((p) => p.id === localSettings.textSystemPromptPreset) || textPrompts[0]
  const currentImagePrompt =
    imagePrompts.find((p) => p.id === localSettings.imageSystemPromptPreset) || imagePrompts[0]

  // Prompt modals state
  const [showAddTextPrompt, setShowAddTextPrompt] = useState(false)
  const [showAddImagePrompt, setShowAddImagePrompt] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState<SystemPrompt | null>(null)
  const [ntpName, setNtpName] = useState('')
  const [ntpText, setNtpText] = useState('')
  const [nipName, setNipName] = useState('')
  const [nipText, setNipText] = useState('')
  const [epName, setEpName] = useState('')
  const [epText, setEpText] = useState('')

  /** Creates a new text system prompt and sets it as the active preset. */
  const addTextPrompt = async () => {
    if (!ntpName.trim() || !ntpText.trim()) return
    const prompt: SystemPrompt = {
      id: uid(),
      name: ntpName.trim(),
      text: ntpText.trim(),
      isBuiltIn: false,
      type: 'text',
    }
    const up = [...allPrompts, prompt]
    await save({ systemPrompts: up, textSystemPromptPreset: prompt.id })
    setShowAddTextPrompt(false)
    setNtpName('')
    setNtpText('')
  }

  /** Deletes a custom text system prompt, reverting to the built-in solver if it was selected. */
  const delTextPrompt = async (id: string) => {
    const p = allPrompts.find((x) => x.id === id)
    if (!p || p.isBuiltIn) return
    const up = allPrompts.filter((x) => x.id !== id)
    await save({
      systemPrompts: up,
      textSystemPromptPreset:
        localSettings.textSystemPromptPreset === id
          ? 'text-solver'
          : localSettings.textSystemPromptPreset,
    })
  }

  /** Creates a new image system prompt and sets it as the active preset. */
  const addImagePrompt = async () => {
    if (!nipName.trim() || !nipText.trim()) return
    const prompt: SystemPrompt = {
      id: uid(),
      name: nipName.trim(),
      text: nipText.trim(),
      isBuiltIn: false,
      type: 'image',
    }
    const up = [...allPrompts, prompt]
    await save({ systemPrompts: up, imageSystemPromptPreset: prompt.id })
    setShowAddImagePrompt(false)
    setNipName('')
    setNipText('')
  }

  /** Deletes a custom image system prompt, reverting to the built-in solver if it was selected. */
  const delImagePrompt = async (id: string) => {
    const p = allPrompts.find((x) => x.id === id)
    if (!p || p.isBuiltIn) return
    const up = allPrompts.filter((x) => x.id !== id)
    await save({
      systemPrompts: up,
      imageSystemPromptPreset:
        localSettings.imageSystemPromptPreset === id
          ? 'image-solver'
          : localSettings.imageSystemPromptPreset,
    })
  }

  /** Persists the edited name and text for the currently selected custom prompt. */
  const editPrompt = async () => {
    if (!editingPrompt || !epName.trim() || !epText.trim()) return
    const up = allPrompts.map((p) =>
      p.id === editingPrompt.id ? { ...p, name: epName.trim(), text: epText.trim() } : p,
    )
    await save({ systemPrompts: up })
    setEditingPrompt(null)
  }

  return (
    <div className={styles.settingContainer}>
      <h1 className={styles.settingPageTitle}>{t('settings.prompts')}</h1>

      {/* Text System Prompts */}
      <h2 className={styles.groupTitle}>Text</h2>
      <section className={styles.settingGroup}>
        <div className={styles.settingRow}>
          <SettingLabel title={t('home.systemPrompt')} description="" />
          <div className={styles.settingControl}>
            <Select
              className={styles.promptSelect || ''}
              value={localSettings.textSystemPromptPreset}
              options={textPrompts.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => {
                void save({ textSystemPromptPreset: v })
              }}
            />
            <Button
              size="small"
              icon={<Plus size={14} />}
              onClick={() => setShowAddTextPrompt(true)}
            >
              {t('settings.addSystemPrompt')}
            </Button>
            {currentTextPrompt && !currentTextPrompt.isBuiltIn && (
              <Button
                className={styles.editButton ?? ''}
                size="small"
                icon={<Pencil size={14} />}
                onClick={() => {
                  setEditingPrompt(currentTextPrompt)
                  setEpName(currentTextPrompt.name)
                  setEpText(currentTextPrompt.text)
                }}
              >
                {t('common.edit')}
              </Button>
            )}
            {currentTextPrompt && !currentTextPrompt.isBuiltIn && (
              <Button
                size="small"
                danger
                icon={<Trash2 size={14} />}
                onClick={() => void delTextPrompt(currentTextPrompt.id)}
              >
                {t('common.delete')}
              </Button>
            )}
          </div>
        </div>
        {currentTextPrompt && (
          <div className={styles.settingRow}>
            <div className={styles.promptTextArea}>
              <Input.TextArea rows={3} value={currentTextPrompt.text} readOnly />
            </div>
          </div>
        )}
      </section>

      {/* Image System Prompts */}
      <h2 className={styles.groupTitle}>      <h2 className={styles.groupTitle}>Image</h2></h2>
      <section className={styles.settingGroup}>
        <div className={styles.settingRow}>
          <SettingLabel title={t('home.systemPrompt')} description="" />
          <div className={styles.settingControl}>
            <Select
              className={styles.promptSelect || ''}
              value={localSettings.imageSystemPromptPreset}
              options={imagePrompts.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => {
                void save({ imageSystemPromptPreset: v })
              }}
            />
            <Button
              size="small"
              icon={<Plus size={14} />}
              onClick={() => setShowAddImagePrompt(true)}
            >
              {t('settings.addSystemPrompt')}
            </Button>
            {currentImagePrompt && !currentImagePrompt.isBuiltIn && (
              <Button
                className={styles.editButton ?? ''}
                size="small"
                icon={<Pencil size={14} />}
                onClick={() => {
                  setEditingPrompt(currentImagePrompt)
                  setEpName(currentImagePrompt.name)
                  setEpText(currentImagePrompt.text)
                }}
              >
                {t('common.edit')}
              </Button>
            )}
            {currentImagePrompt && !currentImagePrompt.isBuiltIn && (
              <Button
                size="small"
                danger
                icon={<Trash2 size={14} />}
                onClick={() => void delImagePrompt(currentImagePrompt.id)}
              >
                {t('common.delete')}
              </Button>
            )}
          </div>
        </div>
        {currentImagePrompt && (
          <div className={styles.settingRow}>
            <div className={styles.promptTextArea}>
              <Input.TextArea rows={3} value={currentImagePrompt.text} readOnly />
            </div>
          </div>
        )}
      </section>

      {/* Modals */}
      <Modal
        title="Add Text System Prompt"
        open={showAddTextPrompt}
        onOk={() => void addTextPrompt()}
        onCancel={() => setShowAddTextPrompt(false)}
        okButtonProps={okButtonProps}
      >
        <Input
          placeholder="Name"
          value={ntpName}
          onChange={(e) => setNtpName(e.target.value)}
          className={styles.modalInputMb}
        />
        <Input.TextArea
          placeholder="Prompt text"
          rows={4}
          value={ntpText}
          onChange={(e) => setNtpText(e.target.value)}
        />
      </Modal>

      <Modal
        title="Add Image System Prompt"
        open={showAddImagePrompt}
        onOk={() => void addImagePrompt()}
        onCancel={() => setShowAddImagePrompt(false)}
        okButtonProps={okButtonProps}
      >
        <Input
          placeholder="Name"
          value={nipName}
          onChange={(e) => setNipName(e.target.value)}
          className={styles.modalInputMb}
        />
        <Input.TextArea
          placeholder="Prompt text"
          rows={4}
          value={nipText}
          onChange={(e) => setNipText(e.target.value)}
        />
      </Modal>

      <Modal
        title="Edit System Prompt"
        open={Boolean(editingPrompt)}
        onOk={() => void editPrompt()}
        onCancel={() => setEditingPrompt(null)}
        okButtonProps={okButtonProps}
      >
        <Input
          placeholder="Name"
          value={epName}
          onChange={(e) => setEpName(e.target.value)}
          className={styles.modalInputMb}
        />
        <Input.TextArea
          placeholder="Prompt text"
          rows={4}
          value={epText}
          onChange={(e) => setEpText(e.target.value)}
        />
      </Modal>
    </div>
  )
}

export default SystemPromptsSettingsSection
