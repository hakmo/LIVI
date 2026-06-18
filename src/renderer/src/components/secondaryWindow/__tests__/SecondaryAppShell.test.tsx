import { fireEvent, render, screen } from '@testing-library/react'

const state: {
  settings:
    | (Partial<{
        dashboards: Record<string, Partial<Record<'main' | 'dash' | 'aux', boolean>>>
        media: Partial<Record<'dash' | 'aux', boolean>>
        camera: Partial<Record<'dash' | 'aux', boolean>>
        bindings: Record<string, string>
      }> & { dashboards?: unknown })
    | undefined
} = { settings: undefined }

let clusterDashActive = false

vi.mock('../../../store/store', () => ({
  useLiviStore: (selector: (s: { settings: unknown }) => unknown) => selector(state),
  useStatusStore: (selector: (s: { clusterDashActive: boolean }) => unknown) =>
    selector({ clusterDashActive })
}))

// Stub the page components so the shell logic is what we exercise.
vi.mock('../../pages/camera', () => ({
  Camera: () => <div data-testid="camera-page" />
}))
vi.mock('../../pages/cluster/Cluster', () => ({
  Cluster: ({ visible }: { visible: boolean }) => (
    <div data-testid="cluster-page" data-visible={String(visible)} />
  )
}))
vi.mock('../../pages/media', () => ({
  Media: ({ forceHydrate }: { forceHydrate?: boolean }) => (
    <div data-testid="media-page" data-hydrate={String(!!forceHydrate)} />
  )
}))
vi.mock('../../pages/telemetry', () => ({
  Telemetry: ({ windowRole }: { windowRole: string }) => (
    <div data-testid="telemetry-page" data-role={windowRole} />
  )
}))

vi.mock('../../layouts/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  )
}))

const sendCommandMock = vi.fn()
const onMediaKeyMock = vi.fn()

beforeEach(async () => {
  state.settings = undefined
  clusterDashActive = false
  sendCommandMock.mockReset()
  onMediaKeyMock.mockReset().mockReturnValue(() => {})
  ;(window as unknown as { projection: unknown }).projection = {
    ipc: { sendCommand: sendCommandMock }
  }
  ;(window as unknown as { app: unknown }).app = { onMediaKey: onMediaKeyMock }
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => vi.restoreAllMocks())

// Force a re-import per describe to capture the freshest mock state if needed.
async function renderShell(role: 'dash' | 'aux' = 'dash', emptyLabel = 'Dash Window') {
  // Lazy import so vi.mock() above is in effect
  const { SecondaryAppShell } = await import('../SecondaryAppShell')
  return render(<SecondaryAppShell role={role} emptyLabel={emptyLabel} />)
}

describe('SecondaryAppShell — empty / loading states', async () => {
  test('renders a blank black canvas while settings are still null', async () => {
    state.settings = undefined
    const { container } = await renderShell()
    expect(container.querySelector('[data-testid="app-layout"]')).toBeNull()
  })

  test('renders the empty-label panel when no slot is enabled for the role', async () => {
    state.settings = { dashboards: {}, media: {}, camera: {} }
    await renderShell('dash', 'Dash Window')
    expect(screen.getByText('Dash Window')).toBeInTheDocument()
  })
})

describe('SecondaryAppShell — initial route selection', () => {
  test('a cluster dash (dash3/dash4) renders the cluster overlay and routes to telemetry', async () => {
    // Cluster capability now derives from a cluster dash routed to the role.
    state.settings = { dashboards: { dash3: { dash: true } } }
    await renderShell('dash')
    // Cluster dash is also a dashboard slot, so the initial route is telemetry.
    expect(screen.getByTestId('telemetry-page')).toHaveAttribute('data-role', 'dash')
    expect(screen.getByTestId('cluster-page')).toBeInTheDocument()
  })

  test('telemetry routes when a non-cluster dashboard slot is set', async () => {
    state.settings = { dashboards: { dash1: { dash: true } } }
    await renderShell('dash')
    expect(screen.getByTestId('telemetry-page')).toHaveAttribute('data-role', 'dash')
    // No cluster dash → no cluster overlay.
    expect(screen.queryByTestId('cluster-page')).toBeNull()
  })

  test('media routes when only media is enabled', async () => {
    state.settings = { media: { dash: true } }
    await renderShell('dash')
    expect(screen.getByTestId('media-page')).toHaveAttribute('data-hydrate', 'true')
  })

  test('camera routes when only camera is enabled', async () => {
    state.settings = { camera: { dash: true } }
    await renderShell('dash')
    expect(screen.getByTestId('camera-page')).toBeInTheDocument()
  })

  test('cluster overlay visibility follows clusterDashActive', async () => {
    clusterDashActive = true
    state.settings = { dashboards: { dash4: { aux: true } } }
    await renderShell('aux')
    expect(screen.getByTestId('cluster-page')).toHaveAttribute('data-visible', 'true')
  })

  test('cluster overlay is hidden while the cluster dash has not signalled active', async () => {
    clusterDashActive = false
    state.settings = { dashboards: { dash4: { aux: true } } }
    await renderShell('aux')
    expect(screen.getByTestId('cluster-page')).toHaveAttribute('data-visible', 'false')
  })

  test('aux role ignores slots that belong to dash', async () => {
    state.settings = { media: { dash: true } }
    await renderShell('aux', 'Aux Window')
    expect(screen.getByText('Aux Window')).toBeInTheDocument()
  })
})

describe('SecondaryAppShell — media-key bridge', () => {
  test('subscribes to window.app.onMediaKey on mount', async () => {
    state.settings = { media: { dash: true } }
    await renderShell()
    expect(onMediaKeyMock).toHaveBeenCalled()
  })

  test('an incoming media key dispatches a car-media-key window event', async () => {
    state.settings = { media: { dash: true } }
    let captured: ((command: string) => void) | null = null
    onMediaKeyMock.mockImplementation((cb: (c: string) => void) => {
      captured = cb
      return () => {}
    })
    await renderShell()
    const listener = vi.fn()
    window.addEventListener('car-media-key', listener as never)
    captured!('playPause')
    expect(listener).toHaveBeenCalled()
    window.removeEventListener('car-media-key', listener as never)
  })

  test('survives missing window.app.onMediaKey', async () => {
    state.settings = { media: { dash: true } }
    ;(window as { app?: unknown }).app = {}
    await expect(renderShell()).resolves.toBeDefined()
  })
})

describe('SecondaryAppShell — key bindings dispatch IPC commands', () => {
  test('transport actions send the command through projection.ipc.sendCommand', async () => {
    state.settings = {
      media: { dash: true },
      bindings: { playPause: 'Space', next: 'KeyN' }
    }
    await renderShell()
    fireEvent.keyDown(document, { code: 'Space' })
    expect(sendCommandMock).toHaveBeenCalledWith('playPause')

    fireEvent.keyDown(document, { code: 'KeyN' })
    expect(sendCommandMock).toHaveBeenCalledWith('next')
  })

  test('unmapped key codes are ignored', async () => {
    state.settings = { media: { dash: true }, bindings: { playPause: 'Space' } }
    await renderShell()
    fireEvent.keyDown(document, { code: 'KeyZ' })
    expect(sendCommandMock).not.toHaveBeenCalled()
  })

  test('voiceAssistant fires on press and release', async () => {
    state.settings = { media: { dash: true }, bindings: { voiceAssistant: 'KeyV' } }
    await renderShell()
    fireEvent.keyDown(document, { code: 'KeyV' })
    expect(sendCommandMock).toHaveBeenCalledWith('voiceAssistant')

    sendCommandMock.mockClear()
    fireEvent.keyUp(document, { code: 'KeyV' })
    expect(sendCommandMock).toHaveBeenCalledWith('voiceAssistantRelease')
  })

  test('repeated voiceAssistant keydown is suppressed', async () => {
    state.settings = { media: { dash: true }, bindings: { voiceAssistant: 'KeyV' } }
    await renderShell()
    fireEvent.keyDown(document, { code: 'KeyV' })
    sendCommandMock.mockClear()
    fireEvent.keyDown(document, { code: 'KeyV', repeat: true })
    expect(sendCommandMock).not.toHaveBeenCalled()
  })

  test('PTT auto-releases on window blur', async () => {
    state.settings = { media: { dash: true }, bindings: { voiceAssistant: 'KeyV' } }
    await renderShell()
    fireEvent.keyDown(document, { code: 'KeyV' })
    sendCommandMock.mockClear()
    window.dispatchEvent(new Event('blur'))
    expect(sendCommandMock).toHaveBeenCalledWith('voiceAssistantRelease')
  })

  test('PTT auto-releases on visibility hidden', async () => {
    state.settings = { media: { dash: true }, bindings: { voiceAssistant: 'KeyV' } }
    await renderShell()
    fireEvent.keyDown(document, { code: 'KeyV' })
    sendCommandMock.mockClear()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(sendCommandMock).toHaveBeenCalledWith('voiceAssistantRelease')
  })

  test('sendCommand failure is swallowed', async () => {
    sendCommandMock.mockImplementation(() => {
      throw new Error('ipc down')
    })
    state.settings = { media: { dash: true }, bindings: { next: 'KeyN' } }
    await renderShell()
    expect(() => fireEvent.keyDown(document, { code: 'KeyN' })).not.toThrow()
  })
})
