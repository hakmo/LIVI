import { act, renderHook } from '@testing-library/react'
import { useNavbarHidden } from '../useNavbarHidden'

describe('useNavbarHidden', () => {
  test('reads initial hidden state and exposes setter', () => {
    const el = document.createElement('div')
    el.id = 'content-root'
    el.setAttribute('data-nav-hidden', '1')
    document.body.appendChild(el)

    const observe = vi.fn()
    const disconnect = vi.fn()
    ;(global as any).MutationObserver = vi.fn(function () {
      return { observe, disconnect }
    })

    const { result, unmount } = renderHook(() => useNavbarHidden())
    expect(result.current.isNavbarHidden).toBe(true)

    act(() => {
      result.current.onSetNavHidden(false)
    })
    expect(result.current.isNavbarHidden).toBe(false)

    unmount()
    expect(disconnect).toHaveBeenCalled()
    el.remove()
  })

  test('handles missing content-root element', () => {
    const disconnect = vi.fn()
    ;(global as any).MutationObserver = vi.fn(function () {
      return { observe: vi.fn(), disconnect }
    })

    const { result, unmount } = renderHook(() => useNavbarHidden())

    expect(result.current.isNavbarHidden).toBe(false)

    act(() => {
      result.current.onSetNavHidden(true)
    })

    expect(result.current.isNavbarHidden).toBe(true)

    unmount()
    expect(disconnect).not.toHaveBeenCalled()
  })
})
