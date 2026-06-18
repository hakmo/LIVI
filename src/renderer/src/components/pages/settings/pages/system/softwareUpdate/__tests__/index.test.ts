describe('softwareUpdate index', () => {
  test('re-exports SoftwareUpdate', async () => {
    const mod = await import('../index')

    expect(mod).toHaveProperty('SoftwareUpdate')
  })
})
