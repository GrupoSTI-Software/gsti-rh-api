import { test } from '@japa/runner'
import { resolveSystemModuleGroupIds } from '../../../app/helpers/system_module_group_seed_resolver.js'
import { SYSTEM_MODULE_GROUP_CATALOG } from '../../../app/constants/system_module_group_catalog.js'

/**
 * USRH1788282413088 — resolución de grupos de módulos por clave estable.
 *
 * Los tests CA1–CA3 consultan la BD de pruebas: requieren que la migración
 * 1788282413065000 y el seeder 0059 hayan corrido en el ambiente de pruebas.
 * Los tests CA4–CA6 validan la lógica pura del helper (no consultan la BD).
 */
test.group('resolveSystemModuleGroupIds — USRH1788282413088', () => {
  test('CA1: clave válida → devuelve Map con id numérico positivo', async ({ assert }) => {
    const primeraKey = SYSTEM_MODULE_GROUP_CATALOG[0].key

    const map = await resolveSystemModuleGroupIds([primeraKey], 'test-ca1')

    assert.isTrue(map.has(primeraKey), `El mapa debe contener la clave "${primeraKey}"`)
    assert.isAbove(map.get(primeraKey)!, 0, 'El id debe ser un entero positivo')
  })

  test('CA2: varias claves válidas → una entrada por clave, sin duplicados', async ({
    assert,
  }) => {
    const keys = [
      SYSTEM_MODULE_GROUP_CATALOG[0].key,
      SYSTEM_MODULE_GROUP_CATALOG[1].key,
      SYSTEM_MODULE_GROUP_CATALOG[2].key,
    ] as const

    const map = await resolveSystemModuleGroupIds([...keys], 'test-ca2')

    assert.equal(map.size, 3, 'Debe devolver exactamente 3 entradas')
    for (const key of keys) {
      assert.isTrue(map.has(key))
      assert.isAbove(map.get(key)!, 0)
    }
    const ids = [...map.values()]
    const uniqueIds = new Set(ids)
    assert.equal(uniqueIds.size, ids.length, 'Los ids no deben repetirse entre grupos')
  })

  test('CA3: clave nula mezclada con válida → nula se descarta, válida se resuelve', async ({
    assert,
  }) => {
    const validKey = SYSTEM_MODULE_GROUP_CATALOG[0].key

    const map = await resolveSystemModuleGroupIds([null, validKey, null], 'test-ca3')

    assert.equal(map.size, 1, 'Debe haber exactamente 1 entrada (el nulo se descarta)')
    assert.isTrue(map.has(validKey))
  })

  test('CA4: clave desconocida → lanza error con nombre del seeder y la clave', async ({
    assert,
  }) => {
    try {
      await resolveSystemModuleGroupIds(['clave-inexistente' as never], 'seeder-prueba-ca4')
      assert.fail('Debió lanzar un error por clave desconocida')
    } catch (err) {
      assert.instanceOf(err, Error)
      assert.include(
        (err as Error).message,
        'seeder-prueba-ca4',
        'El error debe incluir el nombre del seeder'
      )
      assert.include(
        (err as Error).message,
        'clave-inexistente',
        'El error debe incluir la clave fallida'
      )
    }
  })

  test('CA5: solo nulos → devuelve mapa vacío sin lanzar', async ({ assert }) => {
    const map = await resolveSystemModuleGroupIds([null, null], 'test-ca5')

    assert.equal(map.size, 0)
  })

  test('CA6: array vacío → devuelve mapa vacío (corte temprano)', async ({ assert }) => {
    const map = await resolveSystemModuleGroupIds([], 'test-ca6')

    assert.equal(map.size, 0)
  })
})
