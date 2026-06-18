vi.mock('../useActivateControl', () => ({
  __esModule: true,
  useActivateControl: 'useActivateControlMock'
}))

vi.mock('../useKeyDown', () => ({
  __esModule: true,
  useKeyDown: 'useKeyDownMock'
}))

vi.mock('../useFocus', () => ({
  __esModule: true,
  useFocus: 'useFocusMock'
}))

describe('keysControl index', () => {
  test('re-exports key control hooks', async () => {
    const mod = await import('../index')

    expect(mod.useActivateControl).toBe('useActivateControlMock')
    expect(mod.useKeyDown).toBe('useKeyDownMock')
    expect(mod.useFocus).toBe('useFocusMock')
  })
})
