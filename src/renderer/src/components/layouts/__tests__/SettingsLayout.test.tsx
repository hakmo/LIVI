import { fireEvent, render, screen } from '@testing-library/react'
import { SettingsLayout } from '../SettingsLayout'

const navigateMock = vi.fn()
let mockPathname = '/settings/system'

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router')
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({ pathname: mockPathname })
  }
})

describe('SettingsLayout', () => {
  beforeEach(async () => {
    navigateMock.mockReset()
    mockPathname = '/settings/system'
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 1
    })
  })

  afterEach(async () => {
    vi.restoreAllMocks()
  })

  test('shows Back button outside root settings page and navigates back on click', async () => {
    render(
      <SettingsLayout title="System" showRestart={false}>
        <div>Body</div>
      </SettingsLayout>
    )

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(document.activeElement).toBe(input)

    fireEvent.click(screen.getByLabelText('Back'))

    expect(navigateMock).toHaveBeenCalledWith(-1)
    expect(document.activeElement).not.toBe(input)
  })

  test('hides Back button on root settings page', async () => {
    mockPathname = '/settings'
    render(
      <SettingsLayout title="Settings" showRestart={false}>
        <div>Body</div>
      </SettingsLayout>
    )

    expect(screen.queryByLabelText('Back')).toBeNull()
  })

  test('renders Apply action and calls restart handler', async () => {
    const onRestart = vi.fn()
    render(
      <SettingsLayout title="System" showRestart onRestart={onRestart}>
        <div>Body</div>
      </SettingsLayout>
    )

    fireEvent.click(screen.getByLabelText('Apply'))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })

  test('blurs the active element before navigating back when it is not the body', async () => {
    render(
      <SettingsLayout title="System" showRestart={false}>
        <div>Body</div>
      </SettingsLayout>
    )

    const input = document.createElement('input')
    document.body.appendChild(input)

    const blurSpy = vi.spyOn(input, 'blur')
    input.focus()

    fireEvent.click(screen.getByLabelText('Back'))

    expect(blurSpy).toHaveBeenCalledTimes(1)
    expect(navigateMock).toHaveBeenCalledWith(-1)
  })

  test('does not blur when the active element is the body', async () => {
    render(
      <SettingsLayout title="System" showRestart={false}>
        <div>Body</div>
      </SettingsLayout>
    )

    const blurSpy = vi.spyOn(document.body, 'blur')
    document.body.focus()

    fireEvent.click(screen.getByLabelText('Back'))

    expect(blurSpy).not.toHaveBeenCalled()
    expect(navigateMock).toHaveBeenCalledWith(-1)
  })
})
