/**
 * Manages AI scan sessions in the collapsible workspace sidebar.
 */

import { useState } from 'react'
import { Button, Dropdown, Empty, Input, Modal, Tooltip, type MenuProps } from 'antd'
import { Download, FileDown, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTheme } from '@renderer/context/ThemeProvider'
import type { SessionSummary } from '@shared/types'
import { useAppDispatch, useAppSelector } from '@renderer/store'
import { setCurrentSession, setSessions } from '@renderer/store/appSlice'
import { formatDate } from '@renderer/utils/formatters'
import styles from './SessionsSidebar.module.scss'

/** Collapsible sidebar component for browsing, renaming, exporting, and deleting sessions. */
const SessionsSidebar = (): React.JSX.Element => {
  const sessions = useAppSelector((state) => state.app.sessions)
  const currentSession = useAppSelector((state) => state.app.currentSession)
  const scanState = useAppSelector((state) => state.app.scanState)
  const timeFormat = useAppSelector((state) => state.app.settings.timeFormat)
  const dispatch = useAppDispatch()
  const { t } = useTranslation()
  const { theme } = useTheme()
  const light = theme === 'light'
  const scanning = scanState === 'scanning'
  const [renameTarget, setRenameTarget] = useState<SessionSummary | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)

  /** Returns the display title for a session, falling back to the default new-session label. */
  const displayTitle = (session: SessionSummary): string =>
    session.isDefaultTitle ? t('sessions.newSession') : session.title

  /** Opens the rename modal pre-filled with the session's current display title. */
  const beginRename = (session: SessionSummary): void => {
    setRenameTarget(session)
    setRenameValue(displayTitle(session))
  }

  /** Loads the full session document and sets it as the current session. */
  const openSession = async (id: string): Promise<void> => {
    try {
      const doc = await window.aihelper.getSession(id)
      dispatch(setCurrentSession(doc))
    } catch {
      /* ignore */
    }
  }

  /** Deletes a single session and opens the first remaining session. */
  const deleteSession = async (id: string): Promise<void> => {
    const updatedSessions = await window.aihelper.deleteSession(id)
    dispatch(setSessions(updatedSessions))
    if (updatedSessions[0]) await openSession(updatedSessions[0].id)
  }

  /** Deletes all sessions and creates a fresh empty one. */
  const deleteAllSessions = async (): Promise<void> => {
    if (deletingAll) return
    setDeletingAll(true)
    try {
      const updatedSessions = await window.aihelper.deleteAllSessions()
      dispatch(setSessions(updatedSessions))
      if (updatedSessions[0]) {
        const doc = await window.aihelper.getSession(updatedSessions[0].id)
        dispatch(setCurrentSession(doc))
      }
    } catch {
      /* ignore */
    }
    setDeletingAll(false)
  }

  /** Persists the new title and refreshes the session list from the main process. */
  const commitRename = async (): Promise<void> => {
    if (!renameTarget || !renameValue.trim()) return
    setRenaming(true)
    try {
      const doc = await window.aihelper.renameSession(renameTarget.id, renameValue.trim())
      const updatedSessions = await window.aihelper.listSessions()
      dispatch(setSessions(updatedSessions))
      if (currentSession?.id === doc.id) {
        dispatch(setCurrentSession(doc))
      }
    } catch {
      /* ignore */
    }
    setRenaming(false)
    setRenameTarget(null)
  }

  /** Triggers a native save dialog to export one or all sessions in the requested format. */
  const exportSession = async (id: string | null, format: 'txt' | 'json'): Promise<void> => {
    try {
      await window.aihelper.exportSession(id, format)
    } catch {
      /* ignore */
    }
  }

  /** Determines whether a session may be deleted (at least one non-empty session must remain). */
  const canDelete = (item: SessionSummary): boolean => {
    if (sessions.length <= 1 && !item.hasItem) return false
    return true
  }

  const isSingleEmptySession = sessions.length === 1 && !sessions[0]?.hasItem
  const isDeleteAllDisabled =
    scanning || deletingAll || sessions.length === 0 || isSingleEmptySession
  const isExportAllDisabled = scanning || sessions.length === 0 || isSingleEmptySession

  /** Builds the right-click context menu for a single session row. */
  const sessionMenu = (session: SessionSummary): MenuProps => ({
    items: [
      { key: 'rename', icon: <Pencil size={14} />, label: t('common.rename') },
      { type: 'divider' },
      {
        key: 'export-txt',
        icon: <FileDown size={14} />,
        label: t('sessions.exportTxt'),
        disabled: !session.hasItem,
      },
      {
        key: 'export-json',
        icon: <FileDown size={14} />,
        label: t('sessions.exportJson'),
        disabled: !session.hasItem,
      },
      {
        key: 'export-all-txt',
        icon: <Download size={14} />,
        label: t('sessions.exportTxtAll'),
        disabled: isSingleEmptySession,
      },
      {
        key: 'export-all-json',
        icon: <Download size={14} />,
        label: t('sessions.exportJsonAll'),
        disabled: isSingleEmptySession,
      },
      { type: 'divider' },
      {
        key: 'delete',
        danger: true,
        icon: <Trash2 size={14} />,
        label: t('common.delete'),
        disabled: !canDelete(session),
      },
    ],
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation()
      if (key === 'rename') beginRename(session)
      if (key === 'export-txt') void exportSession(session.id, 'txt')
      if (key === 'export-json') void exportSession(session.id, 'json')
      if (key === 'export-all-txt') void exportSession(null, 'txt')
      if (key === 'export-all-json') void exportSession(null, 'json')
      if (key === 'delete') void deleteSession(session.id)
    },
  })

  /** Creates a new empty session and immediately switches to it. */
  const createNewSession = async (): Promise<void> => {
    try {
      const doc = await window.aihelper.createSession()
      const list = await window.aihelper.listSessions()
      dispatch(setSessions(list))
      dispatch(setCurrentSession(doc))
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <aside className={styles.container}>
        <header className={styles.header}>
          <span>{t('nav.sessions')}</span>
          <div className={styles.headerActions}>
            <Tooltip title={t('sessions.deleteAll')}>
              <Button
                type="text"
                danger
                size="small"
                icon={<Trash2 size={15} />}
                disabled={isDeleteAllDisabled}
                onClick={() => void deleteAllSessions()}
              />
            </Tooltip>
            <Dropdown
              disabled={isExportAllDisabled}
              menu={{
                items: [
                  {
                    key: 'export-all-txt',
                    icon: <Download size={14} />,
                    label: t('sessions.exportTxtAll'),
                  },
                  {
                    key: 'export-all-json',
                    icon: <Download size={14} />,
                    label: t('sessions.exportJsonAll'),
                  },
                ],
                onClick: ({ key }) => {
                  if (key === 'export-all-txt') void exportSession(null, 'txt')
                  if (key === 'export-all-json') void exportSession(null, 'json')
                },
              }}
              trigger={['click']}
            >
              <Tooltip title={t('sessions.exportAll')}>
                <Button
                  type="text"
                  size="small"
                  icon={<Download size={15} />}
                  disabled={isExportAllDisabled}
                />
              </Tooltip>
            </Dropdown>
            <Tooltip title={t('sessions.newSession')}>
              <Button
                type="text"
                size="small"
                icon={<Plus size={15} />}
                disabled={scanning}
                onClick={() => void createNewSession()}
              />
            </Tooltip>
          </div>
        </header>
        <div className={styles.scrollArea}>
          {sessions.length === 0 ? (
            <div className={styles.emptyWrap}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('sessions.emptyTitle')} />
            </div>
          ) : (
            <div className={styles.list}>
              {sessions.map((item) => (
                <Dropdown
                  key={item.id}
                  menu={sessionMenu(item)}
                  trigger={['contextMenu']}
                  disabled={scanning}
                >
                  <div
                    className={`${styles.item} ${currentSession?.id === item.id ? styles.active : ''}`}
                  >
                    <button
                      type="button"
                      className={styles.openButton}
                      disabled={scanning}
                      onClick={() => void openSession(item.id)}
                    >
                      <span className={styles.fileIcon}>
                        <FileText size={14} />
                      </span>
                      <span className={styles.itemBody}>
                        <span className={styles.itemTitle}>{displayTitle(item)}</span>
                        <span className={styles.itemMeta}>
                          {formatDate(item.createdAt, timeFormat)}
                        </span>
                      </span>
                    </button>
                    <Tooltip title={t('common.delete')}>
                      <Button
                        className={styles.deleteButton ?? ''}
                        type="text"
                        danger
                        size="small"
                        disabled={scanning || !canDelete(item)}
                        icon={<Trash2 size={13} />}
                        onClick={() => void deleteSession(item.id)}
                      />
                    </Tooltip>
                  </div>
                </Dropdown>
              ))}
            </div>
          )}
        </div>
      </aside>
      <Modal
        title={t('sessions.renameSession')}
        open={renameTarget !== null}
        okText={t('common.rename')}
        cancelText={t('common.cancel')}
        confirmLoading={renaming}
        okButtonProps={{
          disabled: !renameValue.trim(),
          ...(light ? { ghost: true as const } : {}),
        }}
        onOk={() => void commitRename()}
        onCancel={() => setRenameTarget(null)}
        destroyOnHidden
      >
        <Input
          className={styles.renameInput}
          value={renameValue}
          maxLength={200}
          autoFocus
          placeholder={t('sessions.renameSession')}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={() => void commitRename()}
        />
      </Modal>
    </>
  )
}

export default SessionsSidebar
