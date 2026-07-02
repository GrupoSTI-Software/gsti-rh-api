import { test } from '@japa/runner'

test.group('NOM035 Disclosure - auth', () => {
  test('GET /api/nom035/disclosure/results responde 401 sin autenticación', async ({ client }) => {
    const response = await client.get('/api/nom035/disclosure/results')
    response.assertStatus(401)
  })
})
