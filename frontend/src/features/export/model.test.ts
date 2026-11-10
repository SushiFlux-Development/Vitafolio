import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import { chosenIds, overLimit, PARTIAL_FAILURE_CODE, partialFailure, selectAllState } from './model'

describe('chosenIds', () => {
  it('keeps the order of the list and drops ids that are no longer in it', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(chosenIds(items, new Set(['c', 'a', 'deleted']))).toEqual(['a', 'c'])
    expect(chosenIds(items, new Set())).toEqual([])
  })
})

describe('selectAllState', () => {
  it.each([
    [0, 0, 'none'],
    [3, 0, 'none'],
    [3, 1, 'some'],
    [3, 3, 'all'],
  ] as const)('%i listed, %i chosen is "%s"', (total, chosen, expected) => {
    expect(selectAllState(total, chosen)).toBe(expected)
  })
})

describe('overLimit', () => {
  it('allows 100 and refuses 101', () => {
    expect(overLimit(100)).toBe(false)
    expect(overLimit(101)).toBe(true)
  })
})

describe('partialFailure', () => {
  it('is a client-made error with its own code and the numbers, so the usual notice shows and copies it', () => {
    const error = partialFailure(2, 5)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe(PARTIAL_FAILURE_CODE)
    expect(error.params).toEqual({ failed: 2, total: 5 })
    expect(error.status).toBe(0)
  })
})
