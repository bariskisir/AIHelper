/**
 * Tests IPC channel enumeration consistency and value uniqueness.
 */

import { describe, expect, it } from 'vitest'
import { IpcChannel } from '../src/shared/IpcChannel'

describe('IpcChannel', () => {
  it('has no duplicate values', () => {
    const values = Object.values(IpcChannel)
    const uniqueValues = new Set(values)
    expect(uniqueValues.size).toBe(values.length)
  })

  it('has no duplicate keys', () => {
    const keys = Object.keys(IpcChannel)
    const uniqueKeys = new Set(keys)
    expect(uniqueKeys.size).toBe(keys.length)
  })

  it('all channel strings use wire format (lowercase with colon separator)', () => {
    for (const value of Object.values(IpcChannel)) {
      expect(value).toMatch(/^[a-z][a-z-]*:[a-z][a-z-]*$/)
    }
  })

  it('contains expected event channels', () => {
    const values = Object.values(IpcChannel)
    expect(values).toContain('event:ai-result')
    expect(values).toContain('event:session-updated')
    expect(values).toContain('event:chatgpt-state')
    expect(values).toContain('event:error')
    expect(values).toContain('event:update-state')
  })

  it('contains expected AI scan channels', () => {
    const values = Object.values(IpcChannel)
    expect(values).toContain('ai:scan-text')
    expect(values).toContain('ai:scan-image')
    expect(values).toContain('ai:cancel')
  })

  it('contains expected session channels', () => {
    const values = Object.values(IpcChannel)
    expect(values).toContain('session:list')
    expect(values).toContain('session:create')
    expect(values).toContain('session:rename')
    expect(values).toContain('session:delete')
  })

  it('contains expected settings channels', () => {
    const values = Object.values(IpcChannel)
    expect(values).toContain('app:bootstrap')
    expect(values).toContain('settings:save')
  })

  it('contains expected update channels', () => {
    const values = Object.values(IpcChannel)
    expect(values).toContain('updates:check')
    expect(values).toContain('updates:install')
  })
})
