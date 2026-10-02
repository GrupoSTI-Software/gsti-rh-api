import { test } from '@japa/runner'
import NominatimReverseGeocoder, {
  formatNominatimAddress,
} from '#modules/assist-source/nominatim_reverse_geocoder'

const ADDRESS = {
  address: {
    road: 'Avenida Vallarta',
    house_number: '1234',
    neighbourhood: 'Colonia Americana',
    city: 'Guadalajara',
    state: 'Jalisco',
  },
  display_name: 'Avenida Vallarta 1234, Colonia Americana, Guadalajara, Jalisco, 44160, México',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

test.group('Nominatim — dirección aproximada', (group) => {
  group.each.setup(() => NominatimReverseGeocoder.resetForTests())

  test('arma una dirección corta con calle, colonia, ciudad y estado', ({ assert }) => {
    assert.equal(
      formatNominatimAddress(ADDRESS),
      'Avenida Vallarta 1234, Colonia Americana, Guadalajara, Jalisco'
    )
    assert.equal(formatNominatimAddress({ display_name: 'Algún lugar' }), 'Algún lugar')
  })

  test('identifica a la aplicación y no vuelve a consultar la misma coordenada', async ({
    assert,
  }) => {
    const calls: RequestInit[] = []
    const fetcher = (async (_url: URL, init: RequestInit) => {
      calls.push(init)
      return jsonResponse(ADDRESS)
    }) as unknown as typeof fetch
    const geocoder = new NominatimReverseGeocoder(fetcher)

    const first = await geocoder.reverse(20.673822, -103.385461)
    const second = await geocoder.reverse(20.673822, -103.385461)

    assert.equal(first, second)
    assert.lengthOf(calls, 1)
    assert.match(String((calls[0].headers as Record<string, string>)['User-Agent']), /^Valanserh/)
  })

  test('una falla no se guarda: el reintento vuelve a consultar', async ({ assert }) => {
    let attempt = 0
    const fetcher = (async () => {
      attempt += 1
      return attempt === 1 ? jsonResponse({}, 503) : jsonResponse(ADDRESS)
    }) as unknown as typeof fetch
    const geocoder = new NominatimReverseGeocoder(fetcher)

    await assert.rejects(() => geocoder.reverse(20.6, -103.3))
    assert.isString(await geocoder.reverse(20.6, -103.3))
    assert.equal(attempt, 2)
  }).timeout(5000)
})
