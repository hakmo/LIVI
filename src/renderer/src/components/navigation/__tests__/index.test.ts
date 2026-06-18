describe('navigation index', () => {
  test('re-exports Nav module', async () => {
    const mod = await import('../index')
    expect(mod).toHaveProperty('Nav')
  })
})
