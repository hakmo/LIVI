import { renderHook } from '@testing-library/react'
import { useActiveControl } from '../useActivateControl'

describe('useActiveControl', () => {
  test('returns false for null element', () => {
    const { result } = renderHook(() => useActiveControl())
    expect(result.current(null)).toBe(false)
  })

  test('clicks switch-like element', () => {
    const { result } = renderHook(() => useActiveControl())
    const input = document.createElement('input')
    input.type = 'checkbox'
    const click = vi.spyOn(input, 'click')
    expect(result.current(input)).toBe(true)
    expect(click).toHaveBeenCalled()
  })

  test('dispatches mousedown for dropdown button', () => {
    const { result } = renderHook(() => useActiveControl())
    const el = document.createElement('div')
    el.setAttribute('role', 'combobox')
    el.setAttribute('aria-haspopup', 'listbox')
    const dispatch = vi.spyOn(el, 'dispatchEvent')
    expect(result.current(el)).toBe(true)
    expect(dispatch).toHaveBeenCalled()
  })

  test('dispatches click event for non-switch, non-dropdown elements without click function', () => {
    const { result } = renderHook(() => useActiveControl())
    const el = document.createElement('div')

    Object.defineProperty(el, 'click', {
      value: undefined,
      configurable: true
    })

    const dispatch = vi.spyOn(el, 'dispatchEvent')

    expect(result.current(el)).toBe(true)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toEqual(expect.any(MouseEvent))
    expect(dispatch.mock.calls[0][0].type).toBe('click')
  })

  test('returns false when fallback click dispatchEvent returns false', () => {
    const { result } = renderHook(() => useActiveControl())
    const el = document.createElement('div')

    Object.defineProperty(el, 'click', {
      value: undefined,
      configurable: true
    })

    vi.spyOn(el, 'dispatchEvent').mockReturnValue(false)

    expect(result.current(el)).toBe(false)
  })

  test('clicks closest clickable ancestor before falling back to the element itself', () => {
    const { result } = renderHook(() => useActiveControl())

    const button = document.createElement('button')
    const child = document.createElement('span')
    button.appendChild(child)

    const click = vi.spyOn(button, 'click')

    expect(result.current(child)).toBe(true)
    expect(click).toHaveBeenCalled()
  })
})
