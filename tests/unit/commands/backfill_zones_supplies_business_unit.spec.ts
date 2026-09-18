import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import BackfillZonesSuppliesBusinessUnit from '../../../commands/backfill_zones_supplies_business_unit.js'

/**
 * Contrato del comando que rellena `business_unit_id` en Zonas y el catálogo de
 * activos. Lo que se vigila aquí no es el SQL sino las tres decisiones que lo
 * hacen seguro: corre en seco por defecto, solo toca filas sin empresa, y con
 * más de una empresa viva ABORTA en vez de adivinar. Una corrida real necesita
 * MySQL; esto cierra la puerta a que alguien invierta el valor por defecto de
 * `--apply` o afloje la regla sin que nadie lo note en el diff.
 */

const COMMAND_SOURCE = join(process.cwd(), 'commands/backfill_zones_supplies_business_unit.ts')

const TABLAS_CUBIERTAS = [
  'zones',
  'supply_types',
  'supplies',
  'supplie_caracteristics',
  'supplie_caracteristic_values',
  'supply_value_histories',
] as const

const leerFuente = () => readFileSync(COMMAND_SOURCE, 'utf8')

test.group('backfill:zones-supplies-business-unit — identidad y alcance', () => {
  test('se registra con el nombre esperado y arranca la app', ({ assert }) => {
    assert.equal(
      BackfillZonesSuppliesBusinessUnit.commandName,
      'backfill:zones-supplies-business-unit'
    )
    assert.isTrue(BackfillZonesSuppliesBusinessUnit.options.startApp)
  })

  test('cubre las seis tablas que la tanda de migraciones dejó en NULL', ({ assert }) => {
    const source = leerFuente()
    const faltantes = TABLAS_CUBIERTAS.filter((tabla) => !source.includes(`'${tabla}'`))

    assert.deepEqual(faltantes, [])
  })
})

test.group('backfill:zones-supplies-business-unit — seco por defecto', () => {
  test('declara --apply como bandera y no hay un --dry-run que lo invierta', ({ assert }) => {
    // El valor por defecto de un boolean de ace es false: sin --apply el
    // comando reporta y no escribe. Un --dry-run sería la señal contraria.
    const source = leerFuente()

    assert.include(source, 'declare apply: boolean')
    assert.notInclude(source, 'dryRun')
    assert.include(source, 'if (!this.apply)')
  })

  test('solo escribe filas sin empresa, así que correrlo dos veces no cambia nada', ({
    assert,
  }) => {
    const source = leerFuente()
    const updates = source.match(/\.update\(/g) ?? []

    assert.lengthOf(updates, 1, 'un único UPDATE, el del backfill')
    assert.match(source, /whereNull\('business_unit_id'\)[\s\S]{0,80}\.update\(/)
  })
})

test.group('backfill:zones-supplies-business-unit — regla de asignación', () => {
  test('aborta cuando no hay exactamente una empresa viva, con key y exitCode', ({ assert }) => {
    const source = leerFuente()

    assert.include(source, 'if (empresasVivas.length !== 1)')
    assert.include(source, 'this.exitCode = 1')
    assert.include(source, 'BACKFILL.BU.000')
    assert.include(source, 'BACKFILL.BU.001')
  })

  test('define empresa viva por borrado lógico, no por estatus activo', ({ assert }) => {
    // Una empresa desactivada sigue siendo dueña de sus datos: contarla como
    // muerta volvería "única" a una base que en realidad tiene dos clientes.
    const source = leerFuente()

    assert.include(source, "whereNull('business_unit_deleted_at')")
    // El estatus solo puede aparecer explicado en la cabecera, nunca filtrando.
    assert.notMatch(source, /where\w*\(\s*'business_unit_active'/)
  })

  test('documenta la regla en el propio comando', ({ assert }) => {
    const source = leerFuente()

    assert.include(source, 'Regla de asignación')
    assert.include(source, 'Idempotencia')
    assert.match(source, /ABORTA/)
    assert.match(source, /no adivina/i)
  })
})
