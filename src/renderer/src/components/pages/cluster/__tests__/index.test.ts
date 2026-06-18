vi.mock('../Cluster', () => ({
  __esModule: true,
  Cluster: 'ClusterMock'
}))

describe('cluster index', () => {
  test('re-exports Cluster module', async () => {
    const mod = await import('../index')

    expect(mod.Cluster).toBe('ClusterMock')
  })
})
