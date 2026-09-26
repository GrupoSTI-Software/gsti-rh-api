import { test } from '@japa/runner'
import { parseBusinessUnitAccessInput } from '#utils/business_unit_access'

/**
 * Tests unitarios del helper de parseo defensivo de `userBusinessAccess`.
 *
 * El helper acepta tres formatos posibles desde la API y agrupa el resultado en
 * `ids` (IDs explícitos del formato nuevo), `slugs` (slugs heredados que requieren
 * traducción posterior) y `legacyCsv` (rastro auditable del CSV original).
 *
 * No requiere conexión a base de datos: las pruebas validan únicamente el
 * comportamiento del parser.
 */
test.group('parseBusinessUnitAccessInput - formato nuevo (array)', () => {
  test('extrae únicamente IDs positivos cuando el input es un arreglo numérico', ({ assert }) => {
    const result = parseBusinessUnitAccessInput([1, 3, 5])

    assert.deepEqual(result.ids, [1, 3, 5])
    assert.lengthOf(result.slugs, 0)
    assert.isNull(result.legacyCsv)
  })

  test('descarta valores no enteros y menores a 1 del arreglo', ({ assert }) => {
    const result = parseBusinessUnitAccessInput([0, -1, 2.5, 4, Number.NaN])

    assert.deepEqual(result.ids, [4])
    assert.lengthOf(result.slugs, 0)
  })

  test('regresa colecciones vacías cuando el arreglo está vacío', ({ assert }) => {
    const result = parseBusinessUnitAccessInput([])

    assert.deepEqual(result.ids, [])
    assert.deepEqual(result.slugs, [])
    assert.isNull(result.legacyCsv)
  })
})

test.group('parseBusinessUnitAccessInput - formato legado (CSV)', () => {
  test('separa IDs numéricos y slugs en colecciones distintas', ({ assert }) => {
    const result = parseBusinessUnitAccessInput('1,gsti-rh,3,sae,7')

    assert.deepEqual(result.ids, [1, 3, 7])
    assert.deepEqual(result.slugs, ['gsti-rh', 'sae'])
    assert.equal(result.legacyCsv, '1,gsti-rh,3,sae,7')
  })

  test('clasifica un CSV de puros slugs sin perder tokens', ({ assert }) => {
    const result = parseBusinessUnitAccessInput('sae,sae-siler,sae-quorum')

    assert.deepEqual(result.ids, [])
    assert.deepEqual(result.slugs, ['sae', 'sae-siler', 'sae-quorum'])
    assert.equal(result.legacyCsv, 'sae,sae-siler,sae-quorum')
  })

  test('descarta espacios y tokens vacíos generados por comas consecutivas', ({ assert }) => {
    const result = parseBusinessUnitAccessInput('  gsti-rh , , sae , ')

    assert.deepEqual(result.ids, [])
    assert.deepEqual(result.slugs, ['gsti-rh', 'sae'])
    // El trim externo elimina espacios, pero conserva las comas: `legacyCsv` refleja el
    // valor recortado tal cual lo recibió el helper, sin reescrituras adicionales.
    assert.equal(result.legacyCsv, 'gsti-rh , , sae ,')
  })

  test('regresa colecciones vacías cuando el CSV es solo espacios o comas', ({ assert }) => {
    const result = parseBusinessUnitAccessInput('  ,, ')

    assert.deepEqual(result.ids, [])
    assert.deepEqual(result.slugs, [])
    // legacyCsv refleja el contenido original recortado por trim externo.
    assert.equal(result.legacyCsv, ',,')
  })
})

test.group('parseBusinessUnitAccessInput - entradas inválidas', () => {
  test('regresa colecciones vacías cuando el valor es null', ({ assert }) => {
    const result = parseBusinessUnitAccessInput(null)

    assert.deepEqual(result.ids, [])
    assert.deepEqual(result.slugs, [])
    assert.isNull(result.legacyCsv)
  })

  test('regresa colecciones vacías cuando el valor es undefined', ({ assert }) => {
    const result = parseBusinessUnitAccessInput(undefined)

    assert.deepEqual(result.ids, [])
    assert.deepEqual(result.slugs, [])
    assert.isNull(result.legacyCsv)
  })

  test('regresa colecciones vacías ante un tipo no soportado (objeto)', ({ assert }) => {
    const result = parseBusinessUnitAccessInput({ id: 1 })

    assert.deepEqual(result.ids, [])
    assert.deepEqual(result.slugs, [])
    assert.isNull(result.legacyCsv)
  })

  test('regresa colecciones vacías cuando la cadena es vacía', ({ assert }) => {
    const result = parseBusinessUnitAccessInput('')

    assert.deepEqual(result.ids, [])
    assert.deepEqual(result.slugs, [])
    assert.isNull(result.legacyCsv)
  })
})
