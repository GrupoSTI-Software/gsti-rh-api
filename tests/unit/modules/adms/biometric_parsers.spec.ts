import { test } from '@japa/runner'
import { parseBiodataBody, splitField } from '#modules/adms/parsers/biodata.parser'
import { parseOperlogBody } from '#modules/adms/parsers/operlog.parser'
import { validateTemplate } from '#modules/biometric-vault/template/template_validation'

/** Blob de referencia con la longitud tipica de una huella medida (1120). */
const FINGER_BLOB = 'A'.repeat(1120)
/** Rostro del V5L: la captura trae MajorVer=39. */
const FACE_BLOB = 'B'.repeat(1400)

/** Linea real del V5L (capture/2026-08-12T15-27-20-002Z-0005-cdata.txt). */
const BIODATA_LINE = `BIODATA Pin=9998\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tMajorVer=39\tMinorVer=3\tFormat=0\tTmp=${FACE_BLOB}`
/** Linea real del SenseFace (capture/2026-08-13T17-05-30-970Z-0002-cdata.txt). */
const BIODATA_FINGER = `BIODATA Pin=9995\tNo=7\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=13\tMinorVer=0\tFormat=0\tTmp=${FINGER_BLOB}`

test.group('Corte de campos del checador', () => {
  test('corta en el primer igual, que es lo que salva la atribucion', ({ assert }) => {
    assert.deepEqual(splitField('PIN=9999'), { key: 'PIN', value: '9999' })
    // El equipo emitio esto de verdad. El valor es `=1`, no `1`.
    assert.deepEqual(splitField('PIN==1'), { key: 'PIN', value: '=1' })
    assert.deepEqual(splitField('Tmp=abc=='), { key: 'Tmp', value: 'abc==' })
    assert.isNull(splitField('=1'))
    assert.isNull(splitField('sinigual'))
  })
})

test.group('Parser de BIODATA', () => {
  test('rostro del V5L con su version', ({ assert }) => {
    const result = parseBiodataBody(`${BIODATA_LINE}\n`)
    assert.lengthOf(result.rows, 1)
    assert.deepEqual(result.rows[0], {
      lineNumber: 1,
      pin: '9998',
      bioNo: 0,
      bioIndex: 0,
      valid: 1,
      duress: 0,
      bioType: 9,
      majorVer: '39',
      minorVer: '3',
      format: 0,
      template: FACE_BLOB,
    })
  })

  test('huella del SenseFace con su dedo y su version', ({ assert }) => {
    const result = parseBiodataBody(`${BIODATA_FINGER}\n`)
    assert.equal(result.rows[0].bioType, 1)
    assert.equal(result.rows[0].bioNo, 7)
    assert.equal(result.rows[0].majorVer, '13')
    assert.equal(result.rows[0].template, FINGER_BLOB)
  })

  test('el blob viaja verbatim, con su relleno', ({ assert }) => {
    const conRelleno = `${FACE_BLOB.slice(0, 1398)}==`
    const result = parseBiodataBody(
      `BIODATA Pin=1\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tMajorVer=39\tMinorVer=0\tFormat=0\tTmp=${conRelleno}\n`
    )
    assert.equal(result.rows[0].template, conRelleno)
  })

  test('sin PIN valido, sin blob, sin tipo o sin dedo no hay fila', ({ assert }) => {
    const result = parseBiodataBody(
      [
        `BIODATA Pin=\tNo=0\tType=9\tTmp=${FACE_BLOB}`,
        `BIODATA Pin=abc\tNo=0\tType=9\tTmp=${FACE_BLOB}`,
        'BIODATA Pin=9998\tNo=0\tType=9\tTmp=',
        `BIODATA Pin=9998\tNo=0\tTmp=${FACE_BLOB}`,
        `BIODATA Pin=9998\tType=9\tTmp=${FACE_BLOB}`,
      ].join('\n')
    )
    assert.lengthOf(result.rows, 0)
    assert.deepEqual(result.unparsed, [1, 2, 3, 4, 5])
  })

  test('sin version el campo queda nulo y la fila sigue viva', ({ assert }) => {
    const result = parseBiodataBody(
      `BIODATA Pin=9998\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tFormat=0\tTmp=${FACE_BLOB}\n`
    )
    assert.lengthOf(result.rows, 1)
    assert.isNull(result.rows[0].majorVer)
  })

  test('una linea rota no tumba el resto del lote', ({ assert }) => {
    const result = parseBiodataBody(`basura\n${BIODATA_LINE}\n`)
    assert.lengthOf(result.rows, 1)
    assert.deepEqual(result.unparsed, [1])
  })
})

test.group('Parser de OPERLOG', () => {
  test('reparte bitacora, usuarios y huellas', ({ assert }) => {
    const body = [
      'OPLOG 4\t0\t2026-08-12 08:17:48\t0\t0\t0\t0',
      'USER PIN=9998\tName=PRUEBA REPLICA\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000\tVerify=-1',
      `FP PIN=9999\tFID=1\tSize=1120\tValid=1\tTMP=${FINGER_BLOB}`,
    ].join('\n')
    const result = parseOperlogBody(body)

    assert.equal(result.oplogs, 1)
    assert.deepEqual(result.users, [{ lineNumber: 2, pin: '9998', name: 'PRUEBA REPLICA' }])
    assert.lengthOf(result.fingerprints, 1)
    assert.equal(result.fingerprints[0].pin, '9999')
    assert.equal(result.fingerprints[0].fingerId, 1)
    assert.equal(result.fingerprints[0].declaredSize, 1120)
    assert.equal(result.fingerprints[0].template, FINGER_BLOB)
  })

  test('el PIN con doble igual NO se convierte en el PIN 1', ({ assert }) => {
    // Linea literal de capture/2026-08-12T14-44-20-457Z-0010-cdata.txt.
    const result = parseOperlogBody(`FP PIN==1\tFID=0\tSize=1120\tValid=1\tTMP=${FINGER_BLOB}`)
    assert.lengthOf(result.fingerprints, 0)
    assert.deepEqual(result.unparsed, [1])
  })

  test('lo mismo para una linea USER con doble igual', ({ assert }) => {
    const result = parseOperlogBody('USER PIN==1\tName=\tPri=0')
    assert.lengthOf(result.users, 0)
    assert.deepEqual(result.unparsed, [1])
  })

  test('un tamano declarado que no cuadra se conserva tal cual, no se corrige', ({ assert }) => {
    const result = parseOperlogBody(`FP PIN=9999\tFID=1\tSize=99\tValid=1\tTMP=${FINGER_BLOB}`)
    assert.equal(result.fingerprints[0].declaredSize, 99)
    assert.equal(result.fingerprints[0].template.length, 1120)
  })

  test('un nombre vacio queda nulo y no cadena vacia', ({ assert }) => {
    const result = parseOperlogBody('USER PIN=9999\tName=\tPri=0')
    assert.isNull(result.users[0].name)
  })

  test('una linea de tipo desconocido se anota sin romper el lote', ({ assert }) => {
    const result = parseOperlogBody('OTRACOSA foo=bar\nOPLOG 1\t0\t2026-08-12 08:00:00')
    assert.deepEqual(result.unparsed, [1])
    assert.equal(result.oplogs, 1)
  })
})

test.group('Validacion del blob biometrico', () => {
  test('una huella y un rostro de tamano medido pasan', ({ assert }) => {
    assert.deepEqual(validateTemplate({ bioType: 1, template: FINGER_BLOB }), {
      ok: true,
      size: 1120,
    })
    assert.deepEqual(validateTemplate({ bioType: 9, template: FACE_BLOB }), {
      ok: true,
      size: 1400,
    })
  })

  test('lo que no es base64 no entra', ({ assert }) => {
    const result = validateTemplate({ bioType: 1, template: `${'A'.repeat(600)} con espacio` })
    assert.isFalse(result.ok)
    if (!result.ok) assert.equal(result.reason, 'not_base64')
  })

  test('media huella no sirve para identificar a nadie', ({ assert }) => {
    const result = validateTemplate({ bioType: 1, template: 'A'.repeat(200) })
    assert.isFalse(result.ok)
    if (!result.ok) assert.equal(result.reason, 'too_short')
  })

  test('un blob desmedido tampoco', ({ assert }) => {
    const result = validateTemplate({ bioType: 1, template: 'A'.repeat(5000) })
    assert.isFalse(result.ok)
    if (!result.ok) assert.equal(result.reason, 'too_long')
  })

  test('vacio se reporta como vacio', ({ assert }) => {
    const result = validateTemplate({ bioType: 9, template: '' })
    assert.isFalse(result.ok)
    if (!result.ok) assert.equal(result.reason, 'empty')
  })

  test('una modalidad que no conocemos usa la banda amplia y no rechaza de mas', ({ assert }) => {
    assert.isTrue(validateTemplate({ bioType: 7, template: 'A'.repeat(600) }).ok)
  })
})
