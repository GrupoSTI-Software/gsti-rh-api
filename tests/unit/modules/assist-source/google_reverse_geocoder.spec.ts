import { test } from '@japa/runner'
import GoogleReverseGeocoder, { trimCountry } from '#modules/assist-source/google_reverse_geocoder'
import NominatimReverseGeocoder from '#modules/assist-source/nominatim_reverse_geocoder'
import { resolveReverseGeocoder } from '#modules/assist-source/assist_address.service'

const OK = {
  status: 'OK',
  results: [
    {
      formatted_address:
        'Privada Paseo de Juan Diego 12, San Salvador Tizatlalli, 52172 Metepec, Méx., México',
    },
  ],
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function fetcherWith(...bodies: unknown[]) {
  const calls: string[] = []
  const fetcher = (async (url: URL) => {
    calls.push(String(url))
    return jsonResponse(bodies[Math.min(calls.length - 1, bodies.length - 1)])
  }) as unknown as typeof fetch
  return { fetcher, calls }
}

test.group('Google — dirección aproximada', (group) => {
  group.each.setup(() => GoogleReverseGeocoder.resetForTests())

  test('devuelve la dirección con número y sin el país', async ({ assert }) => {
    const { fetcher, calls } = fetcherWith(OK)
    const address = await new GoogleReverseGeocoder('llave', fetcher).reverse(19.273762, -99.58497)

    assert.equal(
      address,
      'Privada Paseo de Juan Diego 12, San Salvador Tizatlalli, 52172 Metepec, Méx.'
    )
    assert.include(calls[0], 'latlng=19.273762%2C-99.58497')
    assert.include(calls[0], 'language=es')
  })

  test('sin resultados no hay dirección, pero no es una falla', async ({ assert }) => {
    const { fetcher } = fetcherWith({ status: 'ZERO_RESULTS', results: [] })
    assert.isNull(await new GoogleReverseGeocoder('llave', fetcher).reverse(0.1, 0.1))
  })

  test('con la API apagada lanza y no guarda nada: el reintento vuelve a consultar', async ({
    assert,
  }) => {
    const { fetcher, calls } = fetcherWith(
      { status: 'REQUEST_DENIED', error_message: 'This API is not activated' },
      OK
    )
    const geocoder = new GoogleReverseGeocoder('llave', fetcher)

    await assert.rejects(() => geocoder.reverse(19.27, -99.58))
    assert.isString(await geocoder.reverse(19.27, -99.58))
    assert.lengthOf(calls, 2)
  })

  test('guarda la dirección un día y después vuelve a consultar', async ({ assert }) => {
    let now = 0
    const { fetcher, calls } = fetcherWith(OK)
    const geocoder = new GoogleReverseGeocoder('llave', fetcher, () => now)

    await geocoder.reverse(19.27, -99.58)
    await geocoder.reverse(19.27, -99.58)
    assert.lengthOf(calls, 1)

    now = 25 * 60 * 60 * 1000
    await geocoder.reverse(19.27, -99.58)
    assert.lengthOf(calls, 2)
  })

  test('quita el país solo al final', ({ assert }) => {
    assert.equal(
      trimCountry('Av. Vallarta 1234, Guadalajara, Jal., México'),
      'Av. Vallarta 1234, Guadalajara, Jal.'
    )
    assert.equal(trimCountry('Calle México 5, Toluca'), 'Calle México 5, Toluca')
  })

  test('con llave usa Google y sin ella OpenStreetMap', ({ assert }) => {
    assert.instanceOf(resolveReverseGeocoder('llave'), GoogleReverseGeocoder)
    assert.instanceOf(resolveReverseGeocoder(''), NominatimReverseGeocoder)
    assert.instanceOf(resolveReverseGeocoder(undefined), NominatimReverseGeocoder)
  })
})
