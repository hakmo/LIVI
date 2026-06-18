describe('home index', () => {
  test('re-exports Home', async () => {
    const mod = await import('../index')

    expect(mod).toHaveProperty('Home')
  })
})
