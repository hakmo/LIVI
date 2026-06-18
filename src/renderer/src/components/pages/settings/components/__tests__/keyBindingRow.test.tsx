import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { KeyBindingRow } from '../keyBindingRow'

const mockSaveSettings = vi.fn()
let mockSettings: any = null

vi.mock('@store/store', () => ({
  useLiviStore: (selector: (s: any) => unknown) =>
    selector({
      saveSettings: mockSaveSettings,
      settings: mockSettings
    })
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (x: string) => `t:${x}` })
}))

vi.mock('../stackItem', () => ({
  StackItem: ({ children, onClick }: { children: React.ReactNode; onClick: () => void }) => (
    <div role="button" data-testid="stack-item" onClick={onClick}>
      {children}
    </div>
  )
}))

describe('KeyBindingRow', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mockSettings = {
      bindings: { next: 'MediaNextTrack' }
    }
  })

  const node = {
    kind: 'keyBinding',
    id: 'kb.next',
    label: 'Next',
    labelKey: 'settings.key.next',
    bindingKey: 'next',
    defaultValue: 'ArrowRight'
  } as any

  test('captures and saves a non-modifier key', async () => {
    render(<KeyBindingRow node={node} />)

    fireEvent.click(screen.getByTestId('stack-item'))

    expect(screen.getByText(/Press a key for/)).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Shift', code: 'ShiftLeft' })
    expect(mockSaveSettings).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'x', code: 'KeyX' })

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalledWith({
        ...mockSettings,
        bindings: {
          ...mockSettings.bindings,
          next: 'KeyX'
        }
      })
    })
  })

  test('esc cancels capture and delete resets to default', async () => {
    render(<KeyBindingRow node={node} />)

    fireEvent.click(screen.getByTestId('stack-item'))
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByText(/Press a key for/)).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('stack-item'))
    fireEvent.keyDown(document, { key: 'Backspace', code: 'Backspace' })

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalledWith({
        ...mockSettings,
        bindings: {
          ...mockSettings.bindings,
          next: 'ArrowRight'
        }
      })
    })
  })

  test('reset icon click applies default', async () => {
    render(<KeyBindingRow node={node} />)

    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1] as HTMLElement)

    await waitFor(() => {
      expect(mockSaveSettings).toHaveBeenCalled()
    })
  })
})
