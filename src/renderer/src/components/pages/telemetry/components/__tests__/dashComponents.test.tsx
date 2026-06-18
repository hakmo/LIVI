import { render, screen } from '@testing-library/react'
import { DashPlaceholder } from '../DashPlaceholder'
import { DashShell } from '../DashShell'

describe('DashShell', () => {
  test('renders children and attaches ResizeObserver', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    ;(global as any).ResizeObserver = vi.fn(function () {
      return { observe, disconnect }
    })

    const { unmount } = render(
      <div style={{ width: 400, height: 300 }}>
        <DashShell>
          <div>dash-child</div>
        </DashShell>
      </div>
    )

    expect(screen.getByText('dash-child')).toBeInTheDocument()
    expect(observe).toHaveBeenCalledTimes(1)

    unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})

describe('DashPlaceholder', () => {
  test('renders title and subscribes to content-root attribute changes', () => {
    const contentRoot = document.createElement('div')
    contentRoot.id = 'content-root'
    document.body.appendChild(contentRoot)

    const observe = vi.fn()
    const disconnect = vi.fn()
    ;(global as any).MutationObserver = vi.fn(function () {
      return { observe, disconnect }
    })

    const { unmount } = render(<DashPlaceholder title="Telemetry" />)

    expect(screen.getByText('Telemetry')).toBeInTheDocument()
    expect(observe).toHaveBeenCalledWith(contentRoot, {
      attributes: true,
      attributeFilter: ['data-nav-hidden']
    })

    unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
    contentRoot.remove()
  })
})
