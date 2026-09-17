import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import Zone from '#models/zone'
import SupplyType from '#models/supply_type'
import Supplie from '#models/supplie'
import SupplieCaracteristic from '#models/supplie_caracteristic'
import SupplieCaracteristicValue from '#models/supplie_caracteristic_value'
import SupplyValueHistory from '#models/supply_value_history'

/**
 * Aislamiento por empresa de Zonas y del catálogo de activos (alcance de
 * lanzamiento SaaS). Dos raíces resuelven la empresa desde la sesión y cuatro
 * hijas la heredan del padre, que ya está acotado: así un id ajeno en el cuerpo
 * del request no resuelve y el alta falla en vez de cruzar empresas.
 */

const MODELS_DIR = join(process.cwd(), 'app/models')

const RAICES = [
  { fileName: 'zone.ts', Model: Zone },
  { fileName: 'supply_type.ts', Model: SupplyType },
] as const

const HIJAS = [
  { fileName: 'supplie.ts', Model: Supplie, padre: 'SupplyType' },
  { fileName: 'supplie_caracteristic.ts', Model: SupplieCaracteristic, padre: 'SupplyType' },
  {
    fileName: 'supplie_caracteristic_value.ts',
    Model: SupplieCaracteristicValue,
    padre: 'Supplie',
  },
  { fileName: 'supply_value_history.ts', Model: SupplyValueHistory, padre: 'Supplie' },
] as const

const leerModelo = (fileName: string) => readFileSync(join(MODELS_DIR, fileName), 'utf8')

test.group('Zonas y activos — los seis modelos componen withBusinessUnitScope', () => {
  for (const { fileName, Model } of [...RAICES, ...HIJAS]) {
    test(`${fileName} compone el mixin y declara la columna`, ({ assert }) => {
      const content = leerModelo(fileName)

      assert.include(
        content,
        "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
      )
      assert.include(content, 'withBusinessUnitScope()')
      assertModelHasColumns(assert, Model, ['businessUnitId'])
    })
  }
})

test.group('Zonas y activos — de dónde sale la empresa al crear', () => {
  for (const { fileName } of RAICES) {
    test(`${fileName} resuelve la empresa desde la sesión, nunca del cuerpo`, ({ assert }) => {
      // Son raíces: no hay padre del que derivarla, así que sale del
      // TenantContext que monta el middleware businessScope.
      const content = leerModelo(fileName)

      assert.include(content, '@beforeCreate()')
      assert.include(content, 'TenantContext.getScope()')
      assert.include(content, 'no hay unidad activa en el alcance')
    })
  }

  for (const { fileName, padre } of HIJAS) {
    test(`${fileName} hereda la empresa de ${padre}, nunca del cuerpo`, ({ assert }) => {
      // El padre ya está acotado por el mixin: un id de otra empresa no
      // resuelve y resolveParentBusinessUnitId lanza en vez de persistir.
      const content = leerModelo(fileName)

      assert.include(content, '@beforeCreate()')
      assert.include(content, 'resolveParentBusinessUnitId')
      assert.include(content, `${padre}.query()`)
      assert.notInclude(content, 'TenantContext.getScope()')
    })
  }

  test('ningún validador del dominio acepta businessUnitId desde el cuerpo', ({ assert }) => {
    // Si un validador lo aceptara, el `if (instance.businessUnitId) return` de
    // los hooks lo dejaría pasar tal cual y el alta cruzaría empresas.
    const validators = [
      'zone.ts',
      'supply_type.ts',
      'supplie.ts',
      'supplie_caracteristic.ts',
      'supplie_caracteristic_value.ts',
      'supply_value_history.ts',
    ]

    const filtrados = validators.filter((fileName) =>
      readFileSync(join(process.cwd(), 'app/validators', fileName), 'utf8').includes(
        'businessUnitId'
      )
    )

    assert.deepEqual(filtrados, [])
  })
})
