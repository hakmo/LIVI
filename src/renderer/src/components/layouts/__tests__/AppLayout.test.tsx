import { act, fireEvent, render } from '@testing-library/react'
import { createRef } from 'react'
import { AppLayout } from '../AppLayout'

let mockPathname = '/'
let mockStreaming = false
let mockHand = 0

vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: mockPathname })
}))

vi.mock('../../navigation', () => ({
  Nav: () => <div data-testid="nav">Nav</div>
}))

let mockTabCount = 4
vi.mock('../../navigation/useTabsConfig', () => ({
  useTabsConfig: () =>
    Array.from({ length: mockTabCount }, (_, i) => ({ path: `/${i}`, label: `t${i}`, icon: null }))
}))

vi.mock('@store/store', () => ({
  useLiviStore: (selector: (s: any) => unknown) => selector({ settings: { hand: mockHand } }),
  useStatusStore: (selector: (s: any) => unknown) => selector({ isStreaming: mockStreaming })
}))

vi.mock('../../../hooks/useBlinkingTime', () => ({
  useBlinkingTime: () => '12:34'
}))

vi.mock('../../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ type: 'wifi', online: true })
}))

vi.mock('@mui/material/styles', async () => {
  const actual = await vi.importActual('@mui/material/styles')
  return {
    ...actual,
    useTheme: () => ({
      palette: { background: { paper: '#111' } }
    })
  }
})

describe('AppLayout', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockPathname = '/'
    mockStreaming = false
    mockHand = 0
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    ;(window as any).app = { notifyUserActivity: vi.fn() }
  })

  afterEach(async () => {
    vi.useRealTimers()
  })

  test('hides nav on home when streaming', async () => {
    mockStreaming = true
    const navRef = createRef<HTMLDivElement>()
    const mainRef = createRef<HTMLDivElement>()
    const { container } = render(
      <AppLayout navRef={navRef} mainRef={mainRef} receivingVideo={false}>
        <div>Content</div>
      </AppLayout>
    )
    expect(container.querySelector('#content-root')?.getAttribute('data-nav-hidden')).toBe('1')
  })

  test('auto-hides nav after inactivity on maps', async () => {
    mockPathname = '/cluster'
    const navRef = createRef<HTMLDivElement>()
    const mainRef = createRef<HTMLDivElement>()
    const { container } = render(
      <AppLayout navRef={navRef} mainRef={mainRef} receivingVideo={false}>
        <div>Content</div>
      </AppLayout>
    )

    expect(container.querySelector('#content-root')?.getAttribute('data-nav-hidden')).toBe('0')
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(container.querySelector('#content-root')?.getAttribute('data-nav-hidden')).toBe('1')
  })

  test('forwards pointer activity to app notifier', async () => {
    const navRef = createRef<HTMLDivElement>()
    const mainRef = createRef<HTMLDivElement>()
    const { container } = render(
      <AppLayout navRef={navRef} mainRef={mainRef} receivingVideo={false}>
        <div>Content</div>
      </AppLayout>
    )
    fireEvent.pointerDown(container.querySelector('#main') as HTMLElement)
    expect((window as any).app.notifyUserActivity).toHaveBeenCalled()
  })

  test('shows nav again and re-arms hide timer on mousemove in maps mode', async () => {
    mockPathname = '/cluster'
    const navRef = createRef<HTMLDivElement>()
    const mainRef = createRef<HTMLDivElement>()

    const { container } = render(
      <AppLayout navRef={navRef} mainRef={mainRef} receivingVideo={false}>
        <div>Content</div>
      </AppLayout>
    )

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(container.querySelector('#content-root')?.getAttribute('data-nav-hidden')).toBe('1')

    fireEvent.mouseMove(document)

    expect(container.querySelector('#content-root')?.getAttribute('data-nav-hidden')).toBe('0')

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(container.querySelector('#content-root')?.getAttribute('data-nav-hidden')).toBe('1')
  })

  test('shows nav again when focus moves into nav area on cluster page', async () => {
    mockPathname = '/cluster'
    const navRef = createRef<HTMLDivElement>()
    const mainRef = createRef<HTMLDivElement>()

    const { container, getByTestId } = render(
      <AppLayout navRef={navRef} mainRef={mainRef} receivingVideo={false}>
        <div>Content</div>
      </AppLayout>
    )

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(container.querySelector('#content-root')?.getAttribute('data-nav-hidden')).toBe('1')

    const navChild = getByTestId('nav')
    ;(navChild as HTMLElement).setAttribute('tabindex', '-1')
    ;(navChild as HTMLElement).focus()
    fireEvent.focusIn(navChild)

    expect(container.querySelector('#content-root')?.getAttribute('data-nav-hidden')).toBe('0')
  })

  test('clears auto-hide timer and keeps nav visible when leaving auto-hide pages', async () => {
    mockPathname = '/cluster'
    const navRef = createRef<HTMLDivElement>()
    const mainRef = createRef<HTMLDivElement>()

    const { container, rerender } = render(
      <AppLayout navRef={navRef} mainRef={mainRef} receivingVideo={false}>
        <div>Content</div>
      </AppLayout>
    )

    expect(container.querySelector('#content-root')?.getAttribute('data-nav-hidden')).toBe('0')

    mockPathname = '/'
    rerender(
      <AppLayout navRef={navRef} mainRef={mainRef} receivingVideo={false}>
        <div>Content</div>
      </AppLayout>
    )

    act(() => {
      vi.advanceTimersByTime(3000)
    })

    expect(container.querySelector('#content-root')?.getAttribute('data-nav-hidden')).toBe('0')
  })

  test('removes wake listeners on unmount for auto-hide pages', async () => {
    mockPathname = '/cluster'
    const navRef = createRef<HTMLDivElement>()
    const mainRef = createRef<HTMLDivElement>()

    const windowRemoveSpy = vi.spyOn(window, 'removeEventListener')
    const documentRemoveSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = render(
      <AppLayout navRef={navRef} mainRef={mainRef} receivingVideo={false}>
        <div>Content</div>
      </AppLayout>
    )

    unmount()

    expect(windowRemoveSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(documentRemoveSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(documentRemoveSpy).toHaveBeenCalledWith('wheel', expect.any(Function))
    expect(documentRemoveSpy).toHaveBeenCalledWith('focusin', expect.any(Function))
  })
})
