import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import MedicalConditionType from '#models/medical_condition_type'
import MedicalConditionTypeProperty from '#models/medical_condition_type_property'
import MedicalConditionTypePropertyValue from '#models/medical_condition_type_property_value'

/**
 * USRH1784259058487 (ampliación) — tipos/propiedades/valores de condición
 * médica son dato sensible por cliente, no catálogo global.
 */

const MODELS_DIR = join(process.cwd(), 'app/models')
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

const TARGETS = [
  {
    fileName: 'medical_condition_type.ts',
    Model: MedicalConditionType,
    migrationSlug: 'add_business_unit_id_to_medical_condition_types',
    resolvesFrom: 'TenantContext.getScope',
  },
  {
    fileName: 'medical_condition_type_property.ts',
    Model: MedicalConditionTypeProperty,
    migrationSlug: 'add_business_unit_id_to_medical_condition_type_properties',
    resolvesFrom: 'resolveParentBusinessUnitId',
  },
  {
    fileName: 'medical_condition_type_property_value.ts',
    Model: MedicalConditionTypePropertyValue,
    migrationSlug: 'add_business_unit_id_to_medical_condition_type_property_values',
    resolvesFrom: 'resolveParentBusinessUnitId',
  },
] as const

test.group('Tipos médicos — modelos componen withBusinessUnitScope', () => {
  for (const { fileName, Model, resolvesFrom } of TARGETS) {
    test(`${fileName} importa y compone withBusinessUnitScope()`, ({ assert }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')
      assert.include(content, 'withBusinessUnitScope()')
      assertModelHasColumns(assert, Model, ['businessUnitId'])
      assert.include(content, '@beforeCreate()')
      assert.include(content, resolvesFrom)
    })
  }
})

test.group('Tipos médicos — migraciones de aislamiento', () => {
  for (const { migrationSlug } of TARGETS) {
    test(`existe la migración ${migrationSlug}`, ({ assert }) => {
      const migrationFiles = readdirSync(MIGRATIONS_DIR)
      const match = migrationFiles.find((f) => f.includes(migrationSlug))
      assert.isDefined(match, `debe existir la migración ${migrationSlug}`)
      if (match) {
        const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
        assert.notMatch(content, /await\s+this\.schema/)
        assert.include(content, 'this.defer(')
        assert.include(content, 'NOT NULL')
      }
    })
  }
})
