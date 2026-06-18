describe('debug index', () => {
  test('re-exports Debug', async () => {
    const mod = await import('../index')

    expect(mod).toHaveProperty('Debug')
  })
})
