import { test } from '@japa/runner'
import {
  assertChannelBaseDomain,
  channelAddressOf,
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

test.group('Secreto del canal: direccion que se teclea', () => {
  test('el secreto va como etiqueta delante del dominio comun', ({ assert }) => {
    assert.equal(
      channelAddressOf('37htrxq38vtrms', 'adms-dev.valanserh.app'),
      '37htrxq38vtrms.adms-dev.valanserh.app'
    )
  })

  /**
   * El DNS no distingue mayusculas, pero quien teclea si: una direccion
   * mostrada en mayusculas se copia en mayusculas al menu del aparato y
   * despues no cuadra con lo que la pantalla dice.
   */
  test('normaliza a minusculas y recorta los espacios de los extremos', ({ assert }) => {
    assert.equal(
      channelAddressOf('  ABCDEF1234  ', '  ADMS.VALANSERH.APP '),
      'abcdef1234.adms.valanserh.app'
    )
  })

  test('sin dominio comun no hay direccion que dar', ({ assert }) => {
    assert.isNull(channelAddressOf('37htrxq38vtrms', null))
    assert.isNull(channelAddressOf('37htrxq38vtrms', ''))
    assert.isNull(channelAddressOf('37htrxq38vtrms', '   '))
  })

  test('un equipo anterior al canal no tiene direccion propia', ({ assert }) => {
    assert.isNull(channelAddressOf(null, 'adms-dev.valanserh.app'))
  })

  /** La direccion que se muestra tiene que ser la que el canal despues acepta. */
  test('lo que se teclea es lo que el canal reconoce como etiqueta propia', ({ assert }) => {
    const secret = generateChannelSecret()
    const base = 'adms-dev.valanserh.app'

    const address = channelAddressOf(secret, base)

    assert.isNotNull(address)
    assert.equal(hostLabelOf(address, base), secret)
    assert.isTrue(channelSecretMatches(hostLabelOf(address, base), secret))
  })
})

test.group('Secreto del canal: validacion del dominio comun', () => {
  test('acepta un dominio de dos y de tres etiquetas', ({ assert }) => {
    assert.equal(assertChannelBaseDomain('VAR', 'valanserh.app'), 'valanserh.app')
    assert.equal(
      assertChannelBaseDomain('VAR', 'adms-dev.valanserh.app'),
      'adms-dev.valanserh.app'
    )
  })

  test('vacio significa convivencia, no error', ({ assert }) => {
    assert.isUndefined(assertChannelBaseDomain('VAR', ''))
    assert.isUndefined(assertChannelBaseDomain('VAR', '   '))
    assert.isUndefined(assertChannelBaseDomain('VAR', undefined))
  })

  test('normaliza mayusculas y espacios de los extremos', ({ assert }) => {
    assert.equal(assertChannelBaseDomain('VAR', '  ADMS.Valanserh.App  '), 'adms.valanserh.app')
  })

  /**
   * El caso real del 2026-09-11: con el comodin puesto, el sufijo que busca
   * `hostLabelOf` pasa a ser `.*.valanserh.app` y ningun `Host` termina asi,
   * asi que el canal rechaza a toda la flota sin decir nada.
   */
  test('rechaza el comodin, que es sintaxis de DNS y no de esta variable', ({ assert }) => {
    assert.throws(
      () => assertChannelBaseDomain('ADMS_CHANNEL_BASE_DOMAIN', '*.valanserh.app'),
      /comodin va en el registro DNS/
    )
  })

  test('rechaza esquema, ruta y puerto', ({ assert }) => {
    assert.throws(() => assertChannelBaseDomain('VAR', 'https://valanserh.app'), /esquema/)
    assert.throws(() => assertChannelBaseDomain('VAR', 'valanserh.app/iclock'), /ruta/)
    assert.throws(() => assertChannelBaseDomain('VAR', 'valanserh.app:443'), /puerto/)
  })

  test('rechaza un valor que no puede ser dominio', ({ assert }) => {
    assert.throws(() => assertChannelBaseDomain('VAR', 'localhost'), /falta al menos un punto/)
    assert.throws(() => assertChannelBaseDomain('VAR', '.valanserh.app'), /punto de los extremos/)
    assert.throws(() => assertChannelBaseDomain('VAR', 'valanserh.app.'), /punto de los extremos/)
    assert.throws(() => assertChannelBaseDomain('VAR', 'adms..valanserh.app'), /no es valida para DNS/)
    assert.throws(() => assertChannelBaseDomain('VAR', 'adms dev.valanserh.app'), /espacios/)
    assert.throws(() => assertChannelBaseDomain('VAR', '-adms.valanserh.app'), /no es valida para DNS/)
  })

  /** Lo validado tiene que servirle despues a las dos funciones del canal. */
  test('lo que pasa la validacion funciona en el resto del canal', ({ assert }) => {
    const base = assertChannelBaseDomain('VAR', 'ADMS-Dev.Valanserh.App')!
    const secret = generateChannelSecret()

    const address = channelAddressOf(secret, base)

    assert.equal(hostLabelOf(address, base), secret)
  })
})
