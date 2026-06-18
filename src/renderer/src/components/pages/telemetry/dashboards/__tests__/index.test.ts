vi.mock('../dash1/Dash1', () => ({
  Dash1: 'Dash1'
}))

vi.mock('../dash2/Dash2', () => ({
  Dash2: 'Dash2'
}))

vi.mock('../dash3/Dash3', () => ({
  Dash3: 'Dash3'
}))

vi.mock('../dash4/Dash4', () => ({
  Dash4: 'Dash4'
}))

describe('telemetry dashboards index', () => {
  test('re-exports all dashboard modules', async () => {
    const mod = await import('../index')

    expect(mod.Dash1).toBe('Dash1')
    expect(mod.Dash2).toBe('Dash2')
    expect(mod.Dash3).toBe('Dash3')
    expect(mod.Dash4).toBe('Dash4')
  })
})
