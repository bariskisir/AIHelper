/**
 * Tests helper functions used across the application.
 */

import { describe, expect, it } from 'vitest'

/** Replicates parseVersion from GitHubReleaseClient. */
const parseVersion = (version: string): readonly [number, number, number] => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim())
  if (!match) throw new Error(`Unsupported release version: ${version}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** Replicates isNewerVersion logic. */
const isNewerVersion = (candidate: string, installed: string): boolean => {
  const c = parseVersion(candidate)
  const i = parseVersion(installed)
  for (let idx = 0; idx < c.length; idx += 1) {
    if ((c[idx] ?? 0) !== (i[idx] ?? 0)) return (c[idx] ?? 0) > (i[idx] ?? 0)
  }
  return false
}

describe('parseVersion', () => {
  it('parses a plain semver string', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
  })

  it('parses a version with v prefix', () => {
    expect(parseVersion('v2.0.0')).toEqual([2, 0, 0])
  })

  it('parses a version with pre-release suffix', () => {
    expect(parseVersion('1.0.0-beta')).toEqual([1, 0, 0])
  })

  it('rejects invalid versions', () => {
    expect(() => parseVersion('invalid')).toThrow()
  })

  it('rejects two-part versions', () => {
    expect(() => parseVersion('1.0')).toThrow()
  })
})

describe('isNewerVersion', () => {
  it('returns true when candidate is newer', () => {
    expect(isNewerVersion('2.0.0', '1.0.0')).toBe(true)
  })

  it('returns false when installed is newer', () => {
    expect(isNewerVersion('1.0.0', '2.0.0')).toBe(false)
  })

  it('returns false for same version', () => {
    expect(isNewerVersion('1.5.0', '1.5.0')).toBe(false)
  })

  it('returns true for patch bump', () => {
    expect(isNewerVersion('1.1.1', '1.1.0')).toBe(true)
  })

  it('returns true for minor bump', () => {
    expect(isNewerVersion('1.2.0', '1.1.9')).toBe(true)
  })
})
