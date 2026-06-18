vi.mock('../Media', () => ({
  __esModule: true,
  Media: 'MediaMock'
}))

describe('media index', () => {
  test('re-exports Media module', async () => {
    const mod = await import('../index')

    expect(mod.Media).toBe('MediaMock')
  })
})
