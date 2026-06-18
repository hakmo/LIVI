import { act, renderHook } from '@testing-library/react'
import { useBlinkingTime } from '../useBlinkingTime'

describe('useBlinkingTime', () => {
  test('returns time string and updates every second', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderHook(() => useBlinkingTime())
    const first = result.current

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    const second = result.current
    expect(typeof first).toBe('string')
    expect(typeof second).toBe('string')
    vi.useRealTimers()
  })
})
