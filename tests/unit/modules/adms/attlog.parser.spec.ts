import { test } from '@japa/runner'
import { parseAttlogBody } from '#modules/adms/parsers/attlog.parser'

/** Linea real del V5L: PIN, hora, status, verify, workcode, ..., 255 en la pos 8. */
const V5L_LINE = '9999\t2026-08-12 08:53:23\t0\t15\t0\t0\t0\t255\t0\t0\t'
/** Linea real del SenseFace: 255 en la pos 3. */
const ZAM70_LINE = '9995\t2026-08-13 11:19:12\t255\t1\t0\t0\t0\t0\t0\t'

test.group('ADMS attlog parser', () => {
  test('V5L: PIN, hora, verify y status en sus posiciones', ({ assert }) => {
    const result = parseAttlogBody(`${V5L_LINE}\n`, 'zam180')
    assert.lengthOf(result.rows, 1)
    assert.deepEqual(result.rows[0], {
      lineNumber: 1,
      pin: '9999',
      localTime: '2026-08-12 08:53:23',
      status: 0,
      verify: 15,
      workCode: 0,
    })
    assert.lengthOf(result.unparsed, 0)
  })

  test('SenseFace: el 255 de la posicion 3 no se confunde con el status', ({ assert }) => {
    const result = parseAttlogBody(`${ZAM70_LINE}\n`, 'zam70')
    assert.equal(result.rows[0].pin, '9995')
    assert.equal(result.rows[0].verify, 1)
    assert.isNull(result.rows[0].status)
  })

  test('sin layout conocido solo salen los campos estables', ({ assert }) => {
    const result = parseAttlogBody(`${V5L_LINE}\n`, null)
    assert.equal(result.rows[0].pin, '9999')
    assert.equal(result.rows[0].localTime, '2026-08-12 08:53:23')
    assert.equal(result.rows[0].verify, 15)
    assert.isNull(result.rows[0].status)
    assert.isNull(result.rows[0].workCode)
  })

  test('lineas vacias se ignoran y las ilegibles se listan sin romper el lote', ({ assert }) => {
    const result = parseAttlogBody(
      `${V5L_LINE}\n\nbasura\n9998\t2026-08-12 09:00:00\t0\t1\n`,
      'zam180'
    )
    assert.lengthOf(result.rows, 2)
    assert.deepEqual(result.unparsed, [3])
    assert.equal(result.rows[1].pin, '9998')
  })

  test('un PIN o una hora fuera de forma no pasan', ({ assert }) => {
    const result = parseAttlogBody(
      '\t2026-08-12 08:53:23\t0\t1\nABC\t2026-08-12 08:53:23\t0\t1\n9999\t12/08/2026 08:53\t0\t1\n',
      'zam180'
    )
    assert.lengthOf(result.rows, 0)
    assert.deepEqual(result.unparsed, [1, 2, 3])
  })

  test('CRLF y separadores repetidos no rompen el corte', ({ assert }) => {
    const result = parseAttlogBody(`${V5L_LINE}\r\n`, 'zam180')
    assert.equal(result.rows[0].localTime, '2026-08-12 08:53:23')
  })

  test('un verify fuera de la banda de la columna se descarta y la checada se queda', ({
    assert,
  }) => {
    // La columna destino es tinyint unsigned. Con MySQL estricto un valor fuera
    // de banda tumba el insert, y sin acuse el equipo reintenta el mismo lote
    // para siempre. Vale mas no saber el metodo que perder la checada.
    const result = parseAttlogBody(
      '9999\t2026-08-12 08:53:23\t0\t1200\t0\t0\n9998\t2026-08-12 08:54:00\t0\t-1\t0\t0\n',
      null
    )
    assert.lengthOf(result.rows, 2)
    assert.isNull(result.rows[0].verify)
    assert.isNull(result.rows[1].verify)
    assert.deepEqual(result.unparsed, [])
  })

  test('un verify dentro de la banda si se conserva', ({ assert }) => {
    const result = parseAttlogBody('9999\t2026-08-12 08:53:23\t0\t255\t0\t0\n', null)
    assert.equal(result.rows[0].verify, 255)
  })
})
