vi.mock('../appRoutes', () => ({
  __esModule: true,
  appRoutes: 'appRoutesMock'
}))

vi.mock('../types', () => ({
  __esModule: true,
  RouteType: 'RouteTypeMock'
}))

describe('routes index', () => {
  test('re-exports route modules', async () => {
    const mod = await import('../index')

    expect(mod.appRoutes).toBe('appRoutesMock')
    expect(mod.RouteType).toBe('RouteTypeMock')
  })
})
