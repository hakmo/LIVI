describe('iconUploader index', () => {
  test('re-exports IconUploader', async () => {
    const mod = await import('../index')

    expect(mod).toHaveProperty('IconUploader')
  })
})
