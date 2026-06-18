vi.mock('../Telemetry', () => ({
  __esModule: true,
  Telemetry: 'TelemetryMock'
}))

describe('telemetry index', () => {
  test('re-exports Telemetry module', async () => {
    const mod = await import('../index')

    expect(mod.Telemetry).toBe('TelemetryMock')
  })
})
