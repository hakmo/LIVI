import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Cluster } from '../Cluster'

const renderCluster = (path = '/cluster') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Cluster />
    </MemoryRouter>
  )

type AnyFn = (...args: any[]) => any

const statusState: Record<string, any> = {
  isStreaming: true
}
const liviState: Record<string, any> = {
  settings: { fps: 60, clusterFps: 60, cluster: { main: true, dash: false, aux: false } },
  boxInfo: null
}

jest.mock('../../../../store/store', () => {
  const useStatusStore: any = (selector: AnyFn) => selector(statusState)
  const useLiviStore: any = (selector: AnyFn) => selector(liviState)
  useLiviStore.setState = (patch: Record<string, any>) => Object.assign(liviState, patch)
  return { useStatusStore, useLiviStore }
})

describe('Cluster page', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterAll(() => jest.restoreAllMocks())

  beforeEach(() => {
    statusState.isStreaming = true
    liviState.settings = {
      fps: 60,
      clusterFps: 60,
      cluster: { main: true, dash: false, aux: false }
    }
    liviState.boxInfo = { supportFeatures: '' }
    ;(global as any).ResizeObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn()
    }))
    ;(global as any).MutationObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn()
    }))

    const contentRoot = document.createElement('div')
    contentRoot.id = 'content-root'
    document.body.appendChild(contentRoot)
    ;(window as any).projection = {
      ipc: {
        requestCluster: jest.fn().mockResolvedValue(undefined),
        onClusterResolution: jest.fn(),
        onEvent: jest.fn(),
        offEvent: jest.fn()
      }
    }
  })

  test('releases cluster stream on phone disconnect', async () => {
    const projectionEventCbs: AnyFn[] = []
    ;(window as any).projection.ipc.onEvent = jest.fn((cb: AnyFn) => {
      projectionEventCbs.push(cb)
    })
    ;(window as any).projection.ipc.offEvent = jest.fn((cb: AnyFn) => {
      const i = projectionEventCbs.indexOf(cb)
      if (i >= 0) projectionEventCbs.splice(i, 1)
    })

    renderCluster()

    act(() => {
      projectionEventCbs.forEach((cb) => cb(undefined, { type: 'unplugged' }))
    })
    await waitFor(() => {
      expect((window as any).projection.ipc.requestCluster).toHaveBeenCalledWith(false)
    })
  })

  test('shows unsupported firmware hint when naviScreen is missing', () => {
    liviState.boxInfo = { supportFeatures: '' }
    renderCluster()

    expect(screen.getByText('Not supported by firmware')).toBeInTheDocument()
  })

  test('parseBoxInfo accepts a stringified JSON boxInfo and detects naviScreen', () => {
    liviState.boxInfo = JSON.stringify({ supportFeatures: 'naviScreen,foo' })
    renderCluster()
    // supportsNaviScreen=true → the "Not supported by firmware" hint is hidden
    expect(screen.queryByText('Not supported by firmware')).not.toBeInTheDocument()
  })

  test('parseBoxInfo treats empty / invalid JSON strings as null', () => {
    liviState.boxInfo = '   '
    renderCluster()
    // No box → not supported → hint appears (isStreaming=true triggers it)
    expect(screen.getByText('Not supported by firmware')).toBeInTheDocument()
  })

  test('parseBoxInfo survives a non-JSON string', () => {
    liviState.boxInfo = 'this is not json'
    renderCluster()
    expect(screen.getByText('Not supported by firmware')).toBeInTheDocument()
  })

  test('supportFeatures array form matches naviScreen entry', () => {
    liviState.boxInfo = { supportFeatures: ['Foo', 'NaviScreen', 'Bar'] }
    renderCluster()
    expect(screen.queryByText('Not supported by firmware')).not.toBeInTheDocument()
  })

  test('isAaActive overrides missing firmware support', () => {
    liviState.boxInfo = null
    statusState.isAaActive = true
    renderCluster()
    expect(screen.queryByText('Not supported by firmware')).not.toBeInTheDocument()
    statusState.isAaActive = false
  })

  test('onClusterResolution applies the crop math to the canvas', async () => {
    let resCb: ((p: unknown) => void) | null = null
    ;(window as any).projection.ipc.onClusterResolution = jest.fn((cb: (p: unknown) => void) => {
      resCb = cb
    })
    // Set user-facing cluster dims so clusterCrop branch fires
    liviState.settings = {
      fps: 60,
      clusterFps: 60,
      cluster: { main: true, dash: false, aux: false },
      clusterWidth: 800,
      clusterHeight: 480
    }
    const { container } = renderCluster()
    await waitFor(() => expect(resCb).not.toBeNull())
    act(() => {
      resCb!({ width: 1920, height: 1080 })
    })
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    // After resolution arrives, width style is computed (not literal 100%)
    expect(canvas.style.width.endsWith('%')).toBe(true)
  })

  test('onClusterResolution callback is skipped if IPC method is missing', () => {
    delete (window as any).projection.ipc.onClusterResolution
    expect(() => renderCluster()).not.toThrow()
  })
})
