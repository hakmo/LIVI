vi.mock('../SettingsPage', () => ({
  __esModule: true,
  SettingsPage: 'SettingsPageMock'
}))

describe('settings index', () => {
  test('re-exports SettingsPage module', async () => {
    const mod = await import('../index')

    expect(mod.SettingsPage).toBe('SettingsPageMock')
  })
})
