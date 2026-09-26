import { test } from '@japa/runner'

test.group('NOM035 Attention Program - auth', () => {
  test('GET /api/nom035/attention-program-catalog responde 401 sin autenticación', async ({
    client,
  }) => {
    const response = await client.get('/api/nom035/attention-program-catalog')
    response.assertStatus(401)
  })

  test('GET /api/nom035/attention-programs responde 401 sin autenticación', async ({
    client,
  }) => {
    const response = await client.get('/api/nom035/attention-programs')
    response.assertStatus(401)
  })

  test('POST /api/nom035/attention-programs responde 401 sin autenticación', async ({
    client,
  }) => {
    const response = await client.post('/api/nom035/attention-programs').json({
      year: 2026,
      period: 'Eval marzo',
    })

    response.assertStatus(401)
  })

  test('GET /api/nom035/attention-programs/:id responde 401 sin autenticación', async ({
    client,
  }) => {
    const response = await client.get('/api/nom035/attention-programs/1')
    response.assertStatus(401)
  })

  test('PATCH /api/nom035/attention-programs/:id responde 401 sin autenticación', async ({
    client,
  }) => {
    const response = await client.patch('/api/nom035/attention-programs/1').json({
      period: 'Eval octubre',
      status: 'vigente',
    })

    response.assertStatus(401)
  })
})
