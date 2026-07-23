import { describe, expect, it } from 'vitest'
import { formatDate, formatDuration } from '../src/renderer/src/utils/formatters'

describe('Formatters', () => {
  it('formats duration in mm:ss', () => {
    expect(formatDuration(65000)).toBe('01:05')
  })

  it('formats display dates accurately in 12-hour and 24-hour modes', () => {
    const iso = '2026-07-23T14:30:00.000Z'
    expect(formatDate(iso, '12-hour')).toContain('PM')
    expect(formatDate(iso, '24-hour')).not.toContain('PM')
  })
})
