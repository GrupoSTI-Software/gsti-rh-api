import { test } from '@japa/runner'

test.group('NOM035 Questionnaire Application Close - auth', () => {
  test('PATCH /api/nom035/questionnaire-applications/:id/close responde 401 sin autenticación', async ({
    client,
  }) => {
    const response = await client
      .patch('/api/nom035/questionnaire-applications/1/close')
      .json({ note: 'Cierre sin sesión' })

    response.assertStatus(401)
  })

  test('GET /api/nom035/questionnaire-applications/:id/history responde 401 sin autenticación', async ({
    client,
  }) => {
    const response = await client.get('/api/nom035/questionnaire-applications/1/history')

    response.assertStatus(401)
  })
})
