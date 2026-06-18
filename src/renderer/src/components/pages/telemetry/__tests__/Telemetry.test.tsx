import { AppContext } from '@renderer/context'
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { Telemetry } from '../Telemetry'

const useLiviStoreMock = vi.fn()
const useNavbarHiddenMock = vi.fn()
const useKeyboardNavigationMock = vi.fn()
const normalizeDashComponentsMock = vi.fn()

vi.mock('@store/store', () => ({
  useLiviStore: (selector: (state: { settings: unknown }) => unknown) => useLiviStoreMock(selector)
}))

vi.mock('@renderer/hooks/useNavbarHidden', () => ({
  useNavbarHidden: () => useNavbarHiddenMock()
}))

vi.mock('../hooks/useKeyboardNavigation', () => ({
  useKeyboardNavigation: (args: unknown) => useKeyboardNavigationMock(args)
}))

vi.mock('@renderer/components/pages/telemetry/utils', () => ({
  normalizeDashComponents: (...args: unknown[]) => normalizeDashComponentsMock(...args)
}))

vi.mock('@renderer/components/pages/telemetry/config', () => ({
  DashboardConfig: {
    dash1: React.createElement('div', { 'data-testid': 'dash-1' }, 'Dash 1'),
    dash2: React.createElement('div', { 'data-testid': 'dash-2' }, 'Dash 2')
  }
}))

vi.mock('@renderer/components/pages/telemetry/components/DashPlaceholder', () => ({
  DashPlaceholder: ({ title }: { title: string }) =>
    React.createElement('div', { 'data-testid': 'dash-placeholder' }, title)
}))

vi.mock('@renderer/components/pages/telemetry/components/pagination/pagination', () => ({
  DashboardsPagination: ({
    activeIndex,
    dotsLength,
    onSetIndex,
    isNavbarHidden
  }: {
    activeIndex: number
    dotsLength: number
    onSetIndex: (index: number) => void
    isNavbarHidden: boolean
  }) =>
    React.createElement(
      'button',
      {
        'data-testid': 'pagination',
        'data-active-index': activeIndex,
        'data-dots-length': dotsLength,
        'data-navbar-hidden': String(isNavbarHidden),
        onClick: () => onSetIndex(1)
      },
      'pagination'
    )
}))

vi.mock('@renderer/context', async () => {
  const React = await import('react')
  return {
    AppContext: React.createContext({})
  }
})

const renderWithContext = (ui: React.ReactElement, value: Record<string, unknown> = {}) => {
  return render(
    <AppContext.Provider
      value={
        {
          isTouchDevice: false,
          ...(value as object)
        } as any
      }
    >
      {ui}
    </AppContext.Provider>
  )
}

describe('Telemetry', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    useLiviStoreMock.mockImplementation((selector: (state: { settings: unknown }) => unknown) =>
      selector({
        settings: {
          telemetryDashboards: [{ id: 'dash1', enabled: true, pos: 1 }]
        }
      })
    )

    useNavbarHiddenMock.mockReturnValue({ isNavbarHidden: false })

    normalizeDashComponentsMock.mockReturnValue({
      dashboards: [{ id: 'dash1', pos: 1 }]
    })

    useKeyboardNavigationMock.mockReturnValue({
      prev: vi.fn(),
      next: vi.fn(),
      canPrev: false,
      canNext: false,
      onPointerDown: vi.fn(),
      onPointerUp: vi.fn()
    })
  })

  test('renders fallback when no dashboards are enabled', async () => {
    normalizeDashComponentsMock.mockReturnValue({ dashboards: [] })

    renderWithContext(<Telemetry />)

    expect(screen.getByTestId('dash-placeholder')).toHaveTextContent('No dashboards enabled')
  })

  test('renders configured dashboard for current index', async () => {
    renderWithContext(<Telemetry />)

    expect(screen.getByTestId('dash-1')).toBeInTheDocument()
  })

  test('renders unknown fallback when dashboard id is not in config', async () => {
    normalizeDashComponentsMock.mockReturnValue({
      dashboards: [{ id: 'unknownDash', pos: 1 }]
    })

    renderWithContext(<Telemetry />)

    expect(screen.getByTestId('dash-placeholder')).toHaveTextContent('Unknown dash')
  })

  test('renders pagination only when more than one dashboard exists', async () => {
    normalizeDashComponentsMock.mockReturnValue({
      dashboards: [
        { id: 'dash1', pos: 1 },
        { id: 'dash2', pos: 2 }
      ]
    })

    renderWithContext(<Telemetry />)

    expect(screen.getByTestId('pagination')).toBeInTheDocument()
  })

  test('does not render pagination when only one dashboard exists', async () => {
    renderWithContext(<Telemetry />)

    expect(screen.queryByTestId('pagination')).toBeNull()
  })

  test('switches dashboard when pagination changes index', async () => {
    normalizeDashComponentsMock.mockReturnValue({
      dashboards: [
        { id: 'dash1', pos: 1 },
        { id: 'dash2', pos: 2 }
      ]
    })

    renderWithContext(<Telemetry />)

    expect(screen.getByTestId('dash-1')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('pagination'))

    expect(screen.getByTestId('dash-2')).toBeInTheDocument()
  })

  test('passes telemetry pager into app context and cleans up on unmount', async () => {
    const prev = vi.fn()
    const next = vi.fn()
    const onSetAppContext = vi.fn()

    useKeyboardNavigationMock.mockReturnValue({
      prev,
      next,
      canPrev: true,
      canNext: true,
      onPointerDown: vi.fn(),
      onPointerUp: vi.fn()
    })

    const { unmount } = renderWithContext(<Telemetry />, { onSetAppContext })

    expect(onSetAppContext).toHaveBeenCalledWith({
      telemetryPager: { prev, next, canPrev: true, canNext: true }
    })

    unmount()

    expect(onSetAppContext).toHaveBeenLastCalledWith({
      telemetryPager: undefined
    })
  })

  test('does not try to register app context when onSetAppContext is missing', async () => {
    renderWithContext(<Telemetry />, {})

    expect(screen.getByTestId('dash-1')).toBeInTheDocument()
  })

  test('uses fixed positioning when navbar is hidden', async () => {
    useNavbarHiddenMock.mockReturnValue({ isNavbarHidden: true })

    const { container } = renderWithContext(<Telemetry />)

    expect(container.firstChild).toHaveStyle({ position: 'fixed' })
  })

  test('wires pointer handlers from keyboard navigation hook', async () => {
    const onPointerDown = vi.fn()
    const onPointerUp = vi.fn()

    useKeyboardNavigationMock.mockReturnValue({
      prev: vi.fn(),
      next: vi.fn(),
      canPrev: false,
      canNext: false,
      onPointerDown,
      onPointerUp
    })

    const { container } = renderWithContext(<Telemetry />)

    fireEvent.pointerDown(container.firstChild as Element)
    fireEvent.pointerUp(container.firstChild as Element)

    expect(onPointerDown).toHaveBeenCalled()
    expect(onPointerUp).toHaveBeenCalled()
  })
})
