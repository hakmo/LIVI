import { render, screen } from '@testing-library/react'
import { UI } from '../../../constants'
import { NavColumn } from '../NavColumn'
import type { NavRailItem } from '../NavRail'

vi.mock('@mui/material/styles', async () => {
  const actual = await vi.importActual('@mui/material/styles')
  return {
    ...actual,
    useTheme: () => ({
      palette: { background: { paper: '#222' }, primary: { main: '#0af' } }
    })
  }
})

vi.mock('../../../hooks/useBlinkingTime', () => ({
  useBlinkingTime: vi.fn(() => '12:34')
}))

const networkMock = { type: 'wifi', online: true }
vi.mock('../../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: vi.fn(() => networkMock)
}))

vi.mock('@mui/icons-material/Wifi', () => ({
  __esModule: true,
  default: () => <svg data-testid="wifi-on" />
}))
vi.mock('@mui/icons-material/WifiOff', () => ({
  __esModule: true,
  default: () => <svg data-testid="wifi-off" />
}))

vi.mock('../NavRail', () => ({
  NavRail: ({ items, activeKey, ariaLabel }: any) => (
    <div data-testid="rail" data-active={activeKey} aria-label={ariaLabel}>
      {items.map((i: NavRailItem) => (
        <span key={i.key}>{i.label}</span>
      ))}
    </div>
  )
}))

const items: NavRailItem[] = [
  { key: 'a', icon: <span>a</span>, label: 'A' },
  { key: 'b', icon: <span>b</span>, label: 'B' }
]

const originalH = window.innerHeight
beforeEach(async () => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
  networkMock.type = 'wifi'
  networkMock.online = true
})
afterEach(async () => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalH })
})

describe('NavColumn', () => {
  test('shows time + wifi-on when there is room and connection is wifi', async () => {
    render(<NavColumn items={items} activeKey="a" onSelect={() => {}} hidden={false} />)
    expect(screen.getByText('12:34')).toBeInTheDocument()
    expect(screen.getByTestId('wifi-on')).toBeInTheDocument()
  })

  test('shows wifi-off icon when offline', async () => {
    networkMock.type = 'none'
    networkMock.online = false
    render(<NavColumn items={items} activeKey="a" onSelect={() => {}} hidden={false} />)
    expect(screen.getByTestId('wifi-off')).toBeInTheDocument()
  })

  test('renders no wifi icon when online but not on wifi', async () => {
    networkMock.type = 'ethernet'
    networkMock.online = true
    render(<NavColumn items={items} activeKey="a" onSelect={() => {}} hidden={false} />)
    expect(screen.queryByTestId('wifi-on')).not.toBeInTheDocument()
    expect(screen.queryByTestId('wifi-off')).not.toBeInTheDocument()
  })

  test('hides the time/wifi block when the window is too short', async () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: UI.MIN_HEIGHT_SHOW_TIME_WIFI
    })
    render(<NavColumn items={items} activeKey="a" onSelect={() => {}} hidden={false} />)
    expect(screen.queryByText('12:34')).not.toBeInTheDocument()
  })

  test('passes through items + activeKey to NavRail', async () => {
    render(<NavColumn items={items} activeKey="b" onSelect={() => {}} hidden={false} />)
    const rail = screen.getByTestId('rail')
    expect(rail).toHaveAttribute('data-active', 'b')
    expect(rail).toHaveAttribute('aria-label', 'Navigation')
  })

  test('forwards a custom ariaLabel to NavRail', async () => {
    render(
      <NavColumn items={items} activeKey="a" onSelect={() => {}} hidden={false} ariaLabel="Aux" />
    )
    expect(screen.getByTestId('rail')).toHaveAttribute('aria-label', 'Aux')
  })

  test('renders both visible and hidden states without crashing', async () => {
    const visible = render(
      <NavColumn items={items} activeKey="a" onSelect={() => {}} hidden={false} />
    )
    expect(visible.getByTestId('rail')).toBeInTheDocument()
    visible.unmount()

    const hidden = render(<NavColumn items={items} activeKey="a" onSelect={() => {}} hidden />)
    expect(hidden.getByTestId('rail')).toBeInTheDocument()
  })

  test('side="right" renders alongside the rail', () => {
    render(<NavColumn items={items} activeKey="a" onSelect={() => {}} hidden side="right" />)
    expect(screen.getByTestId('rail')).toBeInTheDocument()
  })
})
