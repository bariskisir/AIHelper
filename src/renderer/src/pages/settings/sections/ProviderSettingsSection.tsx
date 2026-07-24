/**
 * Renders ChatGPT account and model configuration.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Select, Tag } from 'antd'
import { CircleCheck, LogIn, LogOut, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@renderer/context/ThemeProvider'
import { selectPreferredModelId } from '@shared/providers'
import {
  SERVICE_TIERS,
  THINKING_LEVELS,
  VERBOSITY_LEVELS,
  type ServiceTier,
  type ThinkingLevel,
  type VerbosityLevel,
} from '@shared/types'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setChatGptState } from '@renderer/store/appSlice'
import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import SettingLabel from '../components/SettingLabel'
import styles from '../SettingsPage.module.scss'

const usageColor = (percent: number): string => {
  if (percent >= 95) return '#F44336'
  if (percent >= 80) return '#FF9800'
  if (percent >= 50) return '#FFC107'
  return '#4CAF50'
}

const formatRemaining = (resetAt: number): string => {
  const diff = Math.max(0, resetAt - Date.now())
  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  const minutes = Math.floor((diff % 3_600_000) / 60_000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const ProviderSettingsSection = (): React.JSX.Element => {
  const dispatch = useAppDispatch()
  const settings = useAppSelector((state) => state.app.settings)
  const chatGpt = useAppSelector((state) => state.app.chatGpt)
  const { saveSettings } = useSettingsActions()
  const { t } = useTranslation()
  const { theme } = useTheme()
  const light = theme === 'light'

  const [refreshingChatGpt, setRefreshingChatGpt] = useState(false)

  const save = useCallback(
    async (patch: Partial<typeof settings>) => {
      await saveSettings(patch as never)
    },
    [saveSettings],
  )

  const refreshChatGpt = useCallback(async () => {
    setRefreshingChatGpt(true)
    try {
      const state = await window.app.refreshChatGpt()
      dispatch(setChatGptState(state))
      if (state.models && state.models.length > 0) {
        const preferredId = selectPreferredModelId(state.models)
        if (preferredId) {
          void save({ chatGptModel: preferredId })
        }
      }
    } catch {
      /* ignore */
    }
    setRefreshingChatGpt(false)
  }, [dispatch, save])

  const signedIn = chatGpt.status === 'signed-in'

  useEffect(() => {
    if (signedIn && chatGpt.models.length > 0 && !settings.chatGptModel) {
      const preferredId = selectPreferredModelId(chatGpt.models)
      if (preferredId) void save({ chatGptModel: preferredId })
    }
  }, [signedIn, chatGpt.models, settings.chatGptModel, save])

  const selectedModel = useMemo(() => {
    return chatGpt.models.find((m) => m.id === settings.chatGptModel) ?? chatGpt.models[0]
  }, [chatGpt.models, settings.chatGptModel])

  const modelOptions = useMemo(() => {
    return chatGpt.models.map((m) => ({
      value: m.id,
      label: m.displayName || m.id,
    }))
  }, [chatGpt.models])

  const thinkingOptions = useMemo(() => {
    if (selectedModel?.thinkingVariants && selectedModel.thinkingVariants.length > 0) {
      return selectedModel.thinkingVariants.map((v) => ({
        value: v.value,
        label: v.value,
      }))
    }
    return THINKING_LEVELS.map((l) => ({
      value: l,
      label: t(`settings.thinkingLevels.${l}`),
    }))
  }, [selectedModel, t])

  const verbosityOptions = useMemo(() => {
    return VERBOSITY_LEVELS.map((l) => ({
      value: l,
      label: t(`settings.verbosities.${l}`),
    }))
  }, [t])

  const serviceTierOptions = useMemo(() => {
    return SERVICE_TIERS.map((l) => ({
      value: l,
      label: t(`settings.serviceTiers.${l}`),
    }))
  }, [t])

  const handleModelChange = (modelId: string) => {
    const nextModel = chatGpt.models.find((m) => m.id === modelId)
    const patch: Partial<typeof settings> = { chatGptModel: modelId }
    if (nextModel?.thinkingVariants?.length) {
      const hasCurrent = nextModel.thinkingVariants.some(
        (v) => v.value === settings.chatGptThinkingLevel,
      )
      if (!hasCurrent && nextModel.thinkingVariants[0]) {
        patch.chatGptThinkingLevel = nextModel.thinkingVariants[0].value as ThinkingLevel
      }
    }
    void save(patch)
  }

  return (
    <div className={styles.settingContainer}>
      <h1 className={styles.settingPageTitle}>{t('settings.provider')}</h1>

      <h2 className={styles.groupTitle}>ChatGPT</h2>
      <section className={styles.settingGroup}>
        <div className={styles.settingRow}>
          <SettingLabel
            title={signedIn ? chatGpt.accountEmail || 'ChatGPT' : t('settings.chatGptNotSignedIn')}
            description={
              signedIn && chatGpt.limitLabel ? chatGpt.limitLabel.split(' · ')[0] || '' : ''
            }
          />
          <div className={styles.settingControl}>
            {signedIn ? (
              <>
                <Button
                  {...(!light
                    ? { type: 'primary' as const }
                    : { className: styles.refreshButton ?? '' })}
                  loading={refreshingChatGpt}
                  icon={<RefreshCw size={14} />}
                  onClick={() => void refreshChatGpt()}
                >
                  {t('settings.refresh')}
                </Button>
                <Button
                  {...(light
                    ? { danger: true as const }
                    : { type: 'primary' as const, danger: true as const })}
                  icon={<LogOut size={14} />}
                  onClick={() =>
                    void window.app.signOutChatGpt().then((s) => dispatch(setChatGptState(s)))
                  }
                >
                  {t('settings.signOut')}
                </Button>
              </>
            ) : (
              <Button
                type="primary"
                {...(light ? { ghost: true as const } : {})}
                loading={chatGpt.status === 'signing-in'}
                icon={<LogIn size={14} />}
                onClick={() => void window.app.signInChatGpt()}
              >
                {t('settings.signIn')}
              </Button>
            )}
          </div>
        </div>

        {signedIn &&
          chatGpt.usageWindows.length > 0 &&
          chatGpt.usageWindows.map((w) => (
            <div className={styles.settingRow} key={w.label}>
              <SettingLabel
                title={
                  w.label === 'Session'
                    ? t('usage.session')
                    : w.label === 'Weekly'
                      ? t('usage.weekly')
                      : w.label
                }
                description=""
              />
              <div className={`${styles.settingControl} ${styles.rowControl}`}>
                <div style={{ width: 200 }}>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 3,
                      background: 'var(--color-border)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${w.percent}%`,
                        borderRadius: 3,
                        background: usageColor(w.percent),
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 2 }}>
                    <span>
                      {w.percent}% {t('usage.used')}
                    </span>
                    {w.resetAt > 0 && (
                      <span style={{ float: 'right' }}>
                        {t('usage.resetsIn')} {formatRemaining(w.resetAt)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

        {signedIn && (
          <>
            <Row label={t('settings.model')} desc={t('settings.modelDescription')}>
              <Select
                className={styles.selectW200 || ''}
                value={settings.chatGptModel || undefined}
                loading={refreshingChatGpt}
                options={modelOptions}
                onChange={(v) => handleModelChange(v ?? '')}
              />
            </Row>
            <Row label={t('settings.thinkingLevel')} desc={t('settings.thinkingLevelDescription')}>
              <Select
                className={styles.selectW200 || ''}
                value={settings.chatGptThinkingLevel}
                options={thinkingOptions}
                onChange={(v: ThinkingLevel) => {
                  void save({ chatGptThinkingLevel: v })
                }}
              />
            </Row>
            <Row label={t('settings.verbosity')} desc={t('settings.verbosityDescription')}>
              <Select
                className={styles.selectW200 || ''}
                value={settings.chatGptVerbosity}
                options={verbosityOptions}
                onChange={(v: VerbosityLevel) => {
                  void save({ chatGptVerbosity: v })
                }}
              />
            </Row>
            <Row label={t('settings.serviceTier')} desc={t('settings.serviceTierDescription')}>
              <Select
                className={styles.selectW200 || ''}
                value={settings.chatGptServiceTier}
                options={serviceTierOptions}
                onChange={(v: ServiceTier) => {
                  void save({ chatGptServiceTier: v })
                }}
              />
            </Row>
          </>
        )}
      </section>
    </div>
  )
}

/** Reusable setting row with label and control. */
const Row = ({
  label,
  desc,
  children,
}: {
  label: string
  desc: string
  children: React.ReactNode
}) => (
  <div className={styles.settingRow}>
    <SettingLabel title={label} description={desc} />
    <div className={`${styles.settingControl} ${styles.rowControl}`}>{children}</div>
  </div>
)

export default ProviderSettingsSection
