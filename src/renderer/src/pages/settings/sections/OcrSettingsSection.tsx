/**
 * Renders OCR engine selection and the OCR.space API credential configuration.
 */

import { useSettingsActions } from '@renderer/hooks/useSettingsActions'
import { useAppSelector } from '@renderer/store'
import { OCR_ENGINES, type OcrEngine } from '@shared/types'
import { App as AntdApp, Button, Input, Select } from 'antd'
import { Info } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SettingLabel from '../components/SettingLabel'
import styles from '../SettingsPage.module.scss'

const OCR_SPACE_KEY_URL = 'https://ocr.space/ocrapi'

/** Renders the OCR engine preference and OCR.space API key management. */
const OcrSettingsSection = (): React.JSX.Element => {
  const settings = useAppSelector((state) => state.app.settings)
  const { saveSettings, saveOcrSpaceApiKey, deleteOcrSpaceApiKey } = useSettingsActions()
  const { t } = useTranslation()
  const { message } = AntdApp.useApp()

  const [apiKey, setApiKey] = useState('')
  const [storedKey, setStoredKey] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState(false)

  useEffect(() => {
    void window.app.getOcrSpaceApiKey().then((key) => {
      setStoredKey(key)
      setApiKey(key ?? '')
    })
  }, [])

  const handleSaveKey = async (): Promise<void> => {
    const trimmed = apiKey.trim()
    if (!trimmed) {
      void message.warning(t('notices.ocrSpaceKeyRequired'))
      return
    }
    setSavingKey(true)
    const saved = await saveOcrSpaceApiKey(trimmed)
    if (saved) setStoredKey(trimmed)
    setSavingKey(false)
  }

  const handleRemoveKey = async (): Promise<void> => {
    const removed = await deleteOcrSpaceApiKey()
    if (removed) {
      setStoredKey(null)
      setApiKey('')
    }
  }

  return (
    <div className={styles.settingContainer}>
      <h2 className={styles.groupTitle}>{t('settings.ocr')}</h2>
      <section className={styles.settingGroup}>
        <Row label={t('settings.ocrEngine')} desc={t('settings.ocrEngineDescription')}>
          <Select
            className={styles.selectW200 || ''}
            value={settings.ocrEngine}
            options={OCR_ENGINES.map((engine) => ({
              value: engine,
              label: t(`settings.ocrEngines.${engine}`),
            }))}
            onChange={(ocrEngine: OcrEngine) => void saveSettings({ ocrEngine })}
          />
        </Row>
      </section>

      {settings.ocrEngine === 'ocrspace' && (
        <>
          <h2 className={styles.groupTitle}>OCR.space</h2>
          <section className={styles.settingGroup}>
            <div className={styles.apiCreditNotice}>
              <Info size={16} />
              <span>{t('settings.ocrSpaceGetKeyDescription')}</span>
              <Button
                type="link"
                className={styles.apiCreditLink || ''}
                onClick={() => void window.app.openExternal(OCR_SPACE_KEY_URL)}
              >
                {t('settings.ocrSpaceGetKey')}
              </Button>
            </div>
            {!storedKey && (
              <div className={styles.apiCreditNotice}>
                <Info size={16} />
                <span>{t('notices.ocrSpaceKeyRequired')}</span>
              </div>
            )}
            <Row
              label={t('settings.ocrSpaceApiKey')}
              desc={t('settings.ocrSpaceApiKeyDescription')}
            >
              <Input.Password
                className={styles.inputW300 || ''}
                value={apiKey}
                placeholder={t('settings.ocrSpaceApiKeyPlaceholder')}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <Button type="primary" loading={savingKey} onClick={() => void handleSaveKey()}>
                {t('common.save')}
              </Button>
              {storedKey && (
                <Button danger onClick={() => void handleRemoveKey()}>
                  {t('common.delete')}
                </Button>
              )}
            </Row>
          </section>
        </>
      )}
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

export default OcrSettingsSection
