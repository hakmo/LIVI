describe('usbDongle index', () => {
  test('re-exports USBDongle', async () => {
    const mod = await import('../index')

    expect(mod).toHaveProperty('USBDongle')
  })
})
