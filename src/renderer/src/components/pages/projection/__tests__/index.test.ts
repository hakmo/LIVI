vi.mock('../Projection', () => ({
  __esModule: true,
  Projection: 'ProjectionMock'
}))

describe('projection index', () => {
  test('re-exports Projection module', async () => {
    const mod = await import('../index')

    expect(mod.Projection).toBe('ProjectionMock')
  })
})
