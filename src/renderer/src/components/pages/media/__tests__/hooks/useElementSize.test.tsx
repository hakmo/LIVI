import { act, render, screen } from '@testing-library/react'
import type { Mock } from 'vitest'
import { useElementSize } from '../../hooks/useElementSize'

describe('useElementSize', () => {
  let resizeObserverCallback:
    | ((entries: Array<{ contentRect?: { width: number; height: number } }>) => void)
    | undefined

  let observeMock: Mock
  let disconnectMock: Mock
  let requestAnimationFrameMock: Mock
  let cancelAnimationFrameMock: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    resizeObserverCallback = undefined

    observeMock = vi.fn()
    disconnectMock = vi.fn()

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1280
    })

    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 720
    })

    requestAnimationFrameMock = vi.fn((cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })

    cancelAnimationFrameMock = vi.fn()
    ;(global as any).requestAnimationFrame = requestAnimationFrameMock
    ;(global as any).cancelAnimationFrame = cancelAnimationFrameMock
    ;(global as any).ResizeObserver = class {
      constructor(
        cb: (entries: Array<{ contentRect?: { width: number; height: number } }>) => void
      ) {
        resizeObserverCallback = cb
      }

      observe = observeMock
      disconnect = disconnectMock
    }
  })

  function TestComponent() {
    const [ref, size] = useElementSize<HTMLDivElement>()

    return (
      <div>
        <div ref={ref} data-testid="observed" />
        <div data-testid="size">
          {size.w}x{size.h}
        </div>
      </div>
    )
  }

  test('returns window size as initial fallback', () => {
    render(<TestComponent />)

    expect(screen.getByTestId('size')).toHaveTextContent('1280x720')
  })

  test('observes attached element and updates rounded size', () => {
    render(<TestComponent />)

    expect(observeMock).toHaveBeenCalledWith(screen.getByTestId('observed'))

    act(() => {
      resizeObserverCallback?.([{ contentRect: { width: 123.4, height: 456.6 } }])
    })

    expect(screen.getByTestId('size')).toHaveTextContent('123x457')
  })

  test('does not update size when rounded values stay the same', () => {
    render(<TestComponent />)

    act(() => {
      resizeObserverCallback?.([{ contentRect: { width: 200.2, height: 300.2 } }])
    })

    expect(screen.getByTestId('size')).toHaveTextContent('200x300')

    act(() => {
      resizeObserverCallback?.([{ contentRect: { width: 200.4, height: 300.4 } }])
    })

    expect(screen.getByTestId('size')).toHaveTextContent('200x300')
  })

  test('ignores resize entries without contentRect', () => {
    render(<TestComponent />)

    act(() => {
      resizeObserverCallback?.([{}])
    })

    expect(screen.getByTestId('size')).toHaveTextContent('1280x720')
  })

  test('disconnects observer on unmount', () => {
    const { unmount } = render(<TestComponent />)

    unmount()

    expect(disconnectMock).toHaveBeenCalledTimes(1)
  })

  test('cancels scheduled animation frame on unmount when one is pending', () => {
    requestAnimationFrameMock = vi.fn(() => 42)
    ;(global as any).requestAnimationFrame = requestAnimationFrameMock

    const { unmount } = render(<TestComponent />)

    act(() => {
      resizeObserverCallback?.([{ contentRect: { width: 500, height: 250 } }])
    })

    expect(requestAnimationFrameMock).toHaveBeenCalled()

    unmount()

    expect(cancelAnimationFrameMock).toHaveBeenCalledWith(42)
  })

  test('does nothing when observed ref is not attached', () => {
    function DetachedComponent() {
      const [, size] = useElementSize<HTMLDivElement>()
      return (
        <div data-testid="size">
          {size.w}x{size.h}
        </div>
      )
    }

    render(<DetachedComponent />)

    expect(observeMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('size')).toHaveTextContent('1280x720')
  })

  test('schedules only one animation frame while multiple resize events arrive before flush', () => {
    let queuedFrame: FrameRequestCallback | undefined

    requestAnimationFrameMock = vi.fn((cb: FrameRequestCallback) => {
      queuedFrame = cb
      return 7
    })
    ;(global as any).requestAnimationFrame = requestAnimationFrameMock

    render(<TestComponent />)

    act(() => {
      resizeObserverCallback?.([{ contentRect: { width: 100, height: 200 } }])
      resizeObserverCallback?.([{ contentRect: { width: 300, height: 400 } }])
      resizeObserverCallback?.([{ contentRect: { width: 500, height: 600 } }])
    })

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('size')).toHaveTextContent('1280x720')

    act(() => {
      queuedFrame?.(0)
    })

    expect(screen.getByTestId('size')).toHaveTextContent('500x600')
  })

  test('flush returns early when no pending size exists', () => {
    let queuedFrame: FrameRequestCallback | undefined

    requestAnimationFrameMock = vi.fn((cb: FrameRequestCallback) => {
      queuedFrame = cb
      return 9
    })
    ;(global as any).requestAnimationFrame = requestAnimationFrameMock

    render(<TestComponent />)

    act(() => {
      resizeObserverCallback?.([{ contentRect: { width: 111, height: 222 } }])
    })

    expect(screen.getByTestId('size')).toHaveTextContent('1280x720')

    act(() => {
      queuedFrame?.(0)
    })

    expect(screen.getByTestId('size')).toHaveTextContent('111x222')

    act(() => {
      queuedFrame?.(0)
    })

    expect(screen.getByTestId('size')).toHaveTextContent('111x222')
  })

  test('keeps previous state when flushed size matches current size exactly', () => {
    let queuedFrame: FrameRequestCallback | undefined

    requestAnimationFrameMock = vi.fn((cb: FrameRequestCallback) => {
      queuedFrame = cb
      return 11
    })
    ;(global as any).requestAnimationFrame = requestAnimationFrameMock

    render(<TestComponent />)

    act(() => {
      resizeObserverCallback?.([{ contentRect: { width: 200, height: 300 } }])
    })

    act(() => {
      queuedFrame?.(0)
    })

    expect(screen.getByTestId('size')).toHaveTextContent('200x300')

    act(() => {
      resizeObserverCallback?.([{ contentRect: { width: 200, height: 300 } }])
    })

    act(() => {
      queuedFrame?.(0)
    })

    expect(screen.getByTestId('size')).toHaveTextContent('200x300')
  })
})
