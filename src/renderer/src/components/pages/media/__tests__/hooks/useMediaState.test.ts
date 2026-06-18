import { act, renderHook } from '@testing-library/react'
import type { Mock } from 'vitest'
import { useMediaState } from '../../hooks'
import { clamp, mergePayload, payloadFromLiveEvent } from '../../utils'

vi.mock('../../utils/clamp', () => ({
  clamp: vi.fn((n: number, min: number, max: number) => Math.max(min, Math.min(max, n)))
}))
vi.mock('../../utils/mergePayload', () => ({
  mergePayload: vi.fn()
}))
vi.mock('../../utils/payloadFromLiveEvent', () => ({
  payloadFromLiveEvent: vi.fn()
}))

const mockReadMedia = vi.fn()
const mockOnEvent = vi.fn()
const mockRemoveListener = vi.fn()

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    setTimeout(() => cb(performance.now()), 16)
    return 1
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  ;(window as never).projection = {
    ipc: {
      readMedia: mockReadMedia,
      onEvent: mockOnEvent
    }
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  ;(window as never).electron = {
    ipcRenderer: {
      removeListener: mockRemoveListener
    }
  }

  mockReadMedia.mockReset()
  mockOnEvent.mockReset()
  mockRemoveListener.mockReset()
  ;(clamp as Mock).mockClear()
  ;(mergePayload as Mock).mockClear()
  ;(payloadFromLiveEvent as Mock).mockClear()
})

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useMediaState', () => {
  it('returns initial state', async () => {
    const { result } = renderHook(() => useMediaState(false))
    expect(result.current.snap).toBeNull()
    expect(result.current.livePlayMs).toBe(0)
  })

  it('hydrates initial state if allowed', async () => {
    const mockPayload = {
      payload: {
        type: 1,
        media: { MediaSongPlayTime: 123 }
      }
    }
    mockReadMedia.mockResolvedValueOnce(mockPayload)

    const { result } = renderHook(() => useMediaState(true))

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockReadMedia).toHaveBeenCalled()
    expect(result.current.snap).toEqual(mockPayload)
    expect(result.current.livePlayMs).toBe(123)
  })

  it('subscribes to projection events and unsubscribes on unmount', async () => {
    const unsubscribe = vi.fn()
    mockOnEvent.mockReturnValueOnce(unsubscribe)

    const { unmount } = renderHook(() => useMediaState(false))

    expect(mockOnEvent).toHaveBeenCalled()
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('falls back to electron.removeListener when unsubscribe not provided', async () => {
    mockOnEvent.mockReturnValueOnce(undefined)

    const { unmount } = renderHook(() => useMediaState(false))
    unmount()

    expect(mockRemoveListener).toHaveBeenCalledWith('projection-event', expect.any(Function))
  })

  it('handles unplugged event correctly', async () => {
    let handler: (ev: unknown, ...args: unknown[]) => void = () => {}
    mockOnEvent.mockImplementationOnce((cb) => {
      handler = cb
      return vi.fn()
    })

    const { result } = renderHook(() => useMediaState(false))

    act(() => {
      handler({}, { type: 'unplugged' })
    })

    expect(result.current.snap).toBeNull()
    expect(result.current.livePlayMs).toBe(0)
  })

  it('handles valid live event and updates state', async () => {
    let handler: (ev: unknown, ...args: unknown[]) => void = () => {}
    mockOnEvent.mockImplementationOnce((cb) => {
      handler = cb
      return vi.fn()
    })

    const inc = {
      type: 1,
      media: { MediaSongPlayTime: 50 }
    }
    const merged = {
      type: 1,
      media: { MediaSongPlayTime: 50 }
    }

    ;(payloadFromLiveEvent as Mock).mockReturnValue(inc)
    ;(mergePayload as Mock).mockReturnValue(merged)

    const { result } = renderHook(() => useMediaState(false))

    act(() => {
      handler({}, { type: 'media', payload: { payload: inc } })
    })

    expect(payloadFromLiveEvent).toHaveBeenCalled()
    expect(mergePayload).toHaveBeenCalled()
    expect(result.current.livePlayMs).toBe(50)
    expect(result.current.snap?.payload.media?.MediaSongPlayTime).toBe(50)
  })

  it('does not call mergePayload when payloadFromLiveEvent returns null', async () => {
    let handler: (ev: unknown, ...args: unknown[]) => void = () => {}
    mockOnEvent.mockImplementationOnce((cb) => {
      handler = cb
      return vi.fn()
    })
    ;(payloadFromLiveEvent as Mock).mockReturnValue(null)

    renderHook(() => useMediaState(false))

    act(() => {
      handler({}, { type: 'media', payload: { payload: null } })
    })

    expect(payloadFromLiveEvent).toHaveBeenCalled()
    expect(mergePayload).not.toHaveBeenCalled()
  })

  it('updates playback time in animation loop when playing', async () => {
    const payload = {
      timestamp: '2025-01-01T00:00:00Z',
      payload: {
        type: 1,
        media: { MediaPlayStatus: 1, MediaSongDuration: 1000, MediaSongPlayTime: 10 }
      }
    }
    mockReadMedia.mockResolvedValueOnce(payload)
    const { result } = renderHook(() => useMediaState(true))

    // wait for hydration
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.snap).toEqual(payload)
    expect(result.current.livePlayMs).toBe(10)

    // advance multiple frames — await act each iteration to avoid warning
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        vi.advanceTimersByTime(50)
        await Promise.resolve()
      })
    }

    expect(clamp).toHaveBeenCalled()
  })

  it('does not update playback time when paused', async () => {
    const payloadPaused = {
      timestamp: '2025-01-01T00:00:00Z',
      payload: {
        type: 1,
        media: { MediaPlayStatus: 2, MediaSongDuration: 1000, MediaSongPlayTime: 10 }
      }
    }
    mockReadMedia.mockResolvedValueOnce(payloadPaused)
    const { result } = renderHook(() => useMediaState(true))

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.snap).toEqual(payloadPaused)
    expect(result.current.livePlayMs).toBe(10)

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        vi.advanceTimersByTime(50)
        await Promise.resolve()
      })
    }

    expect(clamp).not.toHaveBeenCalled()
  })

  it('reuses previous play time when incoming media event has no MediaSongPlayTime', async () => {
    let handler: (ev: unknown, ...args: unknown[]) => void = () => {}
    mockOnEvent.mockImplementationOnce((cb) => {
      handler = cb
      return vi.fn()
    })
    ;(payloadFromLiveEvent as Mock)
      .mockReturnValueOnce({
        type: 1,
        media: { MediaSongPlayTime: 123 }
      })
      .mockReturnValueOnce({
        type: 1,
        media: {}
      })
    ;(mergePayload as Mock)
      .mockReturnValueOnce({
        type: 1,
        media: { MediaSongPlayTime: 123 }
      })
      .mockReturnValueOnce({
        type: 1,
        media: {}
      })

    const { result } = renderHook(() => useMediaState(false))

    act(() => {
      handler({}, { type: 'media', payload: { payload: { media: { MediaSongPlayTime: 123 } } } })
    })

    expect(result.current.livePlayMs).toBe(123)
    expect(result.current.snap?.payload.media?.MediaSongPlayTime).toBe(123)

    act(() => {
      handler({}, { type: 'media', payload: { payload: { media: {} } } })
    })

    expect(result.current.livePlayMs).toBe(123)
    expect(result.current.snap?.payload.media?.MediaSongPlayTime).toBeUndefined()
  })

  it('falls back to 0 when incoming media event has no MediaSongPlayTime and previous play time is not a number', async () => {
    let handler: (ev: unknown, ...args: unknown[]) => void = () => {}
    mockOnEvent.mockImplementationOnce((cb) => {
      handler = cb
      return vi.fn()
    })
    ;(payloadFromLiveEvent as Mock).mockReturnValue({
      type: 1,
      media: {}
    })
    ;(mergePayload as Mock).mockReturnValue({
      type: 1,
      media: {}
    })

    const { result } = renderHook(() => useMediaState(false))

    act(() => {
      handler({}, { type: 'media', payload: { payload: { media: {} } } })
    })

    expect(result.current.livePlayMs).toBe(0)
  })
})
