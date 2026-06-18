import { act, renderHook } from '@testing-library/react'
import { usePressFeedback } from '../../hooks'
import { MediaEventType } from '../../types'

vi.useFakeTimers({ shouldAdvanceTime: true })

describe('usePressFeedback', () => {
  beforeEach(async () => {
    vi.clearAllTimers()
    vi.clearAllMocks()
  })

  it('initially has all press states false', async () => {
    const { result } = renderHook(() => usePressFeedback())
    expect(result.current.press).toEqual({
      play: false,
      pause: false,
      playpause: false,
      stop: false,
      next: false,
      prev: false
    })
  })

  it('sets and resets press state after delay when bump is called', async () => {
    const { result } = renderHook(() => usePressFeedback())

    act(() => {
      result.current.bump(MediaEventType.PLAY)
    })

    expect(result.current.press.play).toBe(true)

    await act(async () => {
      vi.advanceTimersByTime(140)
    })

    expect(result.current.press.play).toBe(false)
  })

  it('resets all press states immediately when reset is called', async () => {
    const { result } = renderHook(() => usePressFeedback())

    act(() => {
      result.current.bump(MediaEventType.NEXT)
      result.current.bump(MediaEventType.PREV)
    })

    expect(result.current.press).toEqual({
      play: false,
      pause: false,
      playpause: false,
      stop: false,
      next: true,
      prev: true
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.press).toEqual({
      play: false,
      pause: false,
      playpause: false,
      stop: false,
      next: false,
      prev: false
    })
  })

  it('clears previous timer when bump is called again for the same key', async () => {
    const { result } = renderHook(() => usePressFeedback())
    const clearSpy = vi.spyOn(window, 'clearTimeout')

    act(() => {
      result.current.bump(MediaEventType.PLAY, 200)
      result.current.bump(MediaEventType.PLAY, 200)
    })

    expect(clearSpy).toHaveBeenCalled()
  })
})
