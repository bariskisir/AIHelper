/**
 * Renders session documents into portable text and lossless JSON formats.
 */

import type { ExportFormat, SessionDocument } from '@shared/types'

/** Renders one or all sessions in the requested export format. */
export const renderSessions = (sessions: SessionDocument[], format: ExportFormat): string => {
  if (format === 'json') {
    return `${JSON.stringify(sessions.length === 1 ? sessions[0] : sessions, null, 2)}\n`
  }
  return sessions
    .map((session) => {
      const header = `${session.title}\n${'='.repeat(session.title.length)}\n`
      if (!session.item) return `${header}\n(Empty session)\n`
      const item = session.item
      const mode = item.scanMode === 'image' ? 'Image Scan' : 'Text Scan'
      const meta = `${mode} · ${item.model} · ${new Date(item.createdAt).toLocaleString()}`
      return `${header}\n--- ${meta} ---\n\nInput:\n${item.input}\n\nOutput:\n${item.output}\n`
    })
    .join('\n---\n\n')
}
