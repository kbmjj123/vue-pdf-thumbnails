import { describe, it, expect } from 'vitest'
import { parsePageRange, formatPageRange, parsePageSelection, isValidPageRange } from '../../src/core/page-range'

describe('page-range', () => {
  it('parsePageRange: all / empty / undefined → 1..total', () => {
    expect(parsePageRange('all', 5)).toEqual([1, 2, 3, 4, 5])
    expect(parsePageRange('', 5)).toEqual([1, 2, 3, 4, 5])
    expect(parsePageRange(undefined, 3)).toEqual([1, 2, 3])
  })

  it('parsePageRange: parses ranges, clamps and dedupes', () => {
    expect(parsePageRange('1-3,5', 10)).toEqual([1, 2, 3, 5])
    expect(parsePageRange('2-8', 5)).toEqual([2, 3, 4, 5]) // hi clamped to total; lo respected
    expect(parsePageRange('1-1', 5)).toEqual([1])
    expect(parsePageRange('1,1,2', 5)).toEqual([1, 2]) // dedupe
    expect(parsePageRange('0-2', 5)).toEqual([1, 2]) // lo clamped to 1
    expect(parsePageRange('9-12', 5)).toEqual([]) // fully out of range
  })

  it('formatPageRange: compresses consecutive runs', () => {
    expect(formatPageRange([1, 2, 3])).toBe('1-3')
    expect(formatPageRange([1, 2, 3, 5, 7, 8, 9])).toBe('1-3,5,7-9')
    expect(formatPageRange([5])).toBe('5')
    expect(formatPageRange([])).toBe('')
  })

  it('parsePageRange ∘ formatPageRange is an identity on sorted, deduped input', () => {
    expect(formatPageRange(parsePageRange('1-3,5,7-9', 20))).toBe('1-3,5,7-9')
    expect(formatPageRange(parsePageRange('1,2,3,5', 10))).toBe('1-3,5')
  })

  it('parsePageSelection: preserves order and duplicates (for rebuild)', () => {
    expect(parsePageSelection('3,1,2', 5)).toEqual([3, 1, 2])
    expect(parsePageSelection('2,2,5', 5)).toEqual([2, 2, 5])
    expect(parsePageSelection('all', 3)).toEqual([1, 2, 3])
  })

  it('isValidPageRange', () => {
    expect(isValidPageRange('')).toBe(true)
    expect(isValidPageRange('all')).toBe(true)
    expect(isValidPageRange('5')).toBe(true)
    expect(isValidPageRange('2-8')).toBe(true)
    expect(isValidPageRange('2-')).toBe(true)
    expect(isValidPageRange('-5')).toBe(true)
    expect(isValidPageRange('8-2')).toBe(false) // reversed interval
    expect(isValidPageRange('abc')).toBe(false)
    expect(isValidPageRange('1-3,abc')).toBe(false)
  })
})
