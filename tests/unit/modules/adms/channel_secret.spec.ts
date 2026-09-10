import { test } from '@japa/runner'
import {
  channelSecretMatches,
  generateChannelSecret,
  hostLabelOf,
  CHANNEL_SECRET_LENGTH,
} from '#modules/adms/channel/channel_secret'

test.group('Secreto del canal: generacion', () => {
  test('tiene el largo declarado y solo caracteres sin ambiguedad', ({ assert }) => {
    for (let i = 0; i < 200; i += 1) {
      const secret = generateChannelSecret()
      assert.lengthOf(secret, CHANNEL_SECRET_LENGTH)
      // Sin 0/O ni 1/l/i: lo teclea una persona en el menu de un checador.
      assert.match(secret, /^[abcdefghjkmnpqrstuvwxyz23456789]+$/)
    }
  })

  test('no se repite: dos seguidos distintos', ({ assert }) => {
    assert.notEqual(generateChannelSecret(), generateChannelSecret())
  })
})

const BASE = 'adms.valanserh.com'

test.group('Secreto del canal: etiqueta del Host', () => {
  test('saca la etiqueta propia y descarta el puerto', ({ assert }) => {
    assert.equal(hostLabelOf('k7f3q9x2abcdef.adms.valanserh.com', BASE), 'k7f3q9x2abcdef')
    assert.equal(hostLabelOf('k7f3q9x2abcdef.adms.valanserh.com:8443', BASE), 'k7f3q9x2abcdef')
    assert.equal(hostLabelOf('K7F3Q9X2ABCDEF.adms.valanserh.com', BASE), 'k7f3q9x2abcdef')
  })

  /** El dominio comun es por donde se nace: no trae direccion propia. */
  test('el dominio comun no trae etiqueta', ({ assert }) => {
    assert.isNull(hostLabelOf('adms.valanserh.com', BASE))
    assert.isNull(hostLabelOf('', BASE))
    assert.isNull(hostLabelOf(null, BASE))
  })

  test('un host de otro dominio no trae etiqueta', ({ assert }) => {
    assert.isNull(hostLabelOf('k7f3q9x2abcdef.otro-dominio.com', BASE))
    assert.isNull(hostLabelOf('adms.valanserh.com.evil.test', BASE))
  })

  test('mas de una etiqueta no es la direccion de nadie', ({ assert }) => {
    assert.isNull(hostLabelOf('a.b.adms.valanserh.com', BASE))
  })

  /** Una IP no lleva etiqueta: sus puntos separan octetos, no subdominios. */
  test('una IP no se confunde con un subdominio', ({ assert }) => {
    assert.isNull(hostLabelOf('192.168.1.60:8081', BASE))
  })

  /** Sin dominio base configurado no se exige nada: es la convivencia. */
  test('sin dominio base no hay etiqueta que sacar', ({ assert }) => {
    assert.isNull(hostLabelOf('k7f3q9x2abcdef.adms.valanserh.com', null))
  })
})

test.group('Secreto del canal: comparacion', () => {
  test('coincide solo con el secreto exacto', ({ assert }) => {
    const secret = generateChannelSecret()
    assert.isTrue(channelSecretMatches(secret, secret))
    assert.isFalse(channelSecretMatches(secret.slice(0, -1) + 'z', secret))
  })

  test('un largo distinto no coincide y no revienta', ({ assert }) => {
    const secret = generateChannelSecret()
    assert.isFalse(channelSecretMatches('corto', secret))
    assert.isFalse(channelSecretMatches(secret + 'extra', secret))
  })

  /**
   * `length` cuenta unidades UTF-16 y `timingSafeEqual` exige bytes: un `Host`
   * con bytes altos pasaba la guarda y hacia reventar la comparacion. Ese 500,
   * frente al 200 de una serie desconocida, convertia el canal en un oraculo de
   * series registradas.
   */
  test('una etiqueta con bytes altos no coincide ni revienta', ({ assert }) => {
    const secret = generateChannelSecret()
    const mismoLargoOtrosBytes = 'é'.repeat(secret.length)

    assert.equal(mismoLargoOtrosBytes.length, secret.length)
    assert.isFalse(channelSecretMatches(mismoLargoOtrosBytes, secret))
  })

  test('sin etiqueta o sin secreto nunca coincide', ({ assert }) => {
    assert.isFalse(channelSecretMatches(null, generateChannelSecret()))
    assert.isFalse(channelSecretMatches(generateChannelSecret(), null))
    assert.isFalse(channelSecretMatches(null, null))
  })
})
