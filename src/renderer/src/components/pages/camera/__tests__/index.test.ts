vi.mock('../Camera', () => ({
  __esModule: true,
  Camera: 'CameraMock'
}))

describe('camera index', () => {
  test('re-exports Camera module', async () => {
    const mod = await import('../index')

    expect(mod.Camera).toBe('CameraMock')
  })
})
