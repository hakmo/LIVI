import { THEME } from '../constants'
import {
  buildRuntimeTheme,
  darkTheme,
  initCursorHider,
  initUiBreatheClock,
  lightTheme
} from '../theme'

describe('theme module', () => {
  test('exports base light/dark themes', async () => {
    expect(lightTheme.palette.mode).toBe('light')
    expect(darkTheme.palette.mode).toBe('dark')
  })

  test('buildRuntimeTheme applies provided primary/highlight colors', async () => {
    const theme = buildRuntimeTheme(THEME.DARK, '#112233', '#aabbcc')
    expect(theme.palette.primary.main).toBe('#112233')
    expect(theme.palette.secondary.main).toBe('#aabbcc')
  })

  test('buildRuntimeTheme falls back to defaults when colors are missing', async () => {
    const theme = buildRuntimeTheme(THEME.LIGHT)
    expect(theme.palette.mode).toBe('light')
    expect(typeof theme.palette.primary.main).toBe('string')
  })

  const pointerMove = (pointerType: string, x = 0, y = 0) => {
    const ev = new Event('pointermove') as Event & {
      pointerType?: string
      clientX?: number
      clientY?: number
    }
    Object.defineProperty(ev, 'pointerType', { value: pointerType })
    Object.defineProperty(ev, 'clientX', { value: x })
    Object.defineProperty(ev, 'clientY', { value: y })
    document.dispatchEvent(ev)
  }

  test('initCursorHider reveals pointer on real mouse movement, hides after inactivity', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const notify = vi.fn()
    ;(window as any).app = { notifyUserActivity: notify }

    const main = document.createElement('div')
    main.id = 'main'
    document.body.appendChild(main)
    const btn = document.createElement('button')
    btn.className = 'MuiButtonBase-root'
    document.body.appendChild(btn)

    initCursorHider()
    expect(document.body.style.cursor).toBe('none')

    pointerMove('mouse', 100, 100)
    expect(document.body.style.cursor).toBe('none')

    pointerMove('mouse', 150, 150)
    expect(notify).toHaveBeenCalled()
    expect(document.body.style.cursor).toBe('default')

    vi.advanceTimersByTime(3000)
    expect(document.body.style.cursor).toBe('none')
    vi.useRealTimers()
  })

  test('initCursorHider keeps pointer hidden on touch', async () => {
    const notify = vi.fn()
    ;(window as any).app = { notifyUserActivity: notify }

    initCursorHider()
    pointerMove('touch', 10, 10)
    pointerMove('touch', 50, 50)
    expect(notify).toHaveBeenCalled()
    expect(document.body.style.cursor).toBe('none')
  })

  test('initUiBreatheClock writes css variable', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    initUiBreatheClock()
    vi.advanceTimersByTime(50)
    const v = document.documentElement.style.getPropertyValue('--ui-breathe-opacity')
    expect(v).not.toBe('')
    vi.useRealTimers()
  })

  test('buildRuntimeTheme falls back to default highlight when only primary is provided', async () => {
    const theme = buildRuntimeTheme(THEME.DARK, '#112233')

    expect(theme.palette.primary.main).toBe('#112233')
    expect(typeof theme.palette.secondary.main).toBe('string')
    expect(theme.palette.secondary.main).not.toBe('')
  })

  test('buildRuntimeTheme falls back to default primary when only highlight is provided', async () => {
    const theme = buildRuntimeTheme(THEME.LIGHT, undefined, '#aabbcc')

    expect(theme.palette.secondary.main).toBe('#aabbcc')
    expect(typeof theme.palette.primary.main).toBe('string')
    expect(theme.palette.primary.main).not.toBe('')
  })

  test('initUiBreatheClock does nothing on second call', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const setPropertySpy = vi.spyOn(document.documentElement.style, 'setProperty')

    initUiBreatheClock()
    const callsAfterFirstStart = setPropertySpy.mock.calls.length

    initUiBreatheClock()
    const callsAfterSecondStart = setPropertySpy.mock.calls.length

    expect(callsAfterSecondStart).toBe(callsAfterFirstStart)

    vi.useRealTimers()
  })

  test('initUiBreatheClock updates opacity across multiple animation phases', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const perfSpy = vi.spyOn(performance, 'now')
    perfSpy
      .mockReturnValueOnce(0) // start
      .mockReturnValueOnce(100) // rising
      .mockReturnValueOnce(700) // plateau
      .mockReturnValueOnce(1100) // falling
      .mockReturnValueOnce(1500) // zero phase

    initUiBreatheClock()

    const first = document.documentElement.style.getPropertyValue('--ui-breathe-opacity')

    vi.advanceTimersByTime(42)
    const second = document.documentElement.style.getPropertyValue('--ui-breathe-opacity')

    vi.advanceTimersByTime(42)
    const third = document.documentElement.style.getPropertyValue('--ui-breathe-opacity')

    vi.advanceTimersByTime(42)
    const fourth = document.documentElement.style.getPropertyValue('--ui-breathe-opacity')

    expect(first).not.toBe('')
    expect(second).not.toBe('')
    expect(third).not.toBe('')
    expect(fourth).not.toBe('')

    perfSpy.mockRestore()
    vi.useRealTimers()
  })

  test('initUiBreatheClock covers plateau, falling and zero wave phases', async () => {
    vi.resetModules()
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const perfSpy = vi.spyOn(performance, 'now')
    perfSpy
      .mockReturnValueOnce(0) // start
      .mockReturnValueOnce(700) // p = 700 / 1600 = 0.4375  -> wave = 1
      .mockReturnValueOnce(1100) // p = 1100 / 1600 = 0.6875 -> falling branch
      .mockReturnValueOnce(1500) // p = 1500 / 1600 = 0.9375 -> wave = 0

    const { initUiBreatheClock } = await import('../theme')

    initUiBreatheClock()

    expect(document.documentElement.style.getPropertyValue('--ui-breathe-opacity')).toBe('1.000')

    vi.advanceTimersByTime(42)
    expect(document.documentElement.style.getPropertyValue('--ui-breathe-opacity')).not.toBe(
      '1.000'
    )
    expect(document.documentElement.style.getPropertyValue('--ui-breathe-opacity')).not.toBe(
      '0.180'
    )

    vi.advanceTimersByTime(42)
    expect(document.documentElement.style.getPropertyValue('--ui-breathe-opacity')).toBe('0.180')

    perfSpy.mockRestore()
    vi.useRealTimers()
  })
})
