vi.mock('../dongle', () => ({
  __esModule: true,
  DongleType: 'DongleTypeMock'
}))

vi.mock('../fw', () => ({
  __esModule: true,
  FirmwareType: 'FirmwareTypeMock'
}))

vi.mock('../ui', () => ({
  __esModule: true,
  UIType: 'UITypeMock'
}))

describe('types index', () => {
  test('re-exports types modules', async () => {
    const mod = await import('../index')

    expect(mod.DongleType).toBe('DongleTypeMock')
    expect(mod.FirmwareType).toBe('FirmwareTypeMock')
    expect(mod.UIType).toBe('UITypeMock')
  })
})
