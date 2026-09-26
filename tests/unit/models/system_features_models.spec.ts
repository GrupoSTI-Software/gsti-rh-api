import { test } from '@japa/runner'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import SystemModule from '#models/system_module'
import SystemFeature from '#models/system_feature'

/**
 * Tests unitarios de la capa de funcionalidades del sistema y cobertura regulatoria.
 * No requieren base de datos: validan metadatos de columnas, relaciones Lucid y SoftDeletes.
 *
 * Nota: Los tests de RegulationClauseFeature (relaciones con regulation_clauses) se
 * validan en la rama base del marco regulatorio, donde ese modelo existe completo.
 */

type RelationType = 'hasMany' | 'belongsTo' | 'hasOne' | 'manyToMany'

interface LucidRelationMeta {
  type: RelationType
  relatedModel: LucidModel
  options: {
    foreignKey: string
    relatedModel?: () => LucidModel
  }
}

function resolveRelatedModel(relation: LucidRelationMeta): LucidModel {
  if (relation.relatedModel?.table) {
    return relation.relatedModel
  }
  if (typeof relation.options.relatedModel === 'function') {
    return relation.options.relatedModel()
  }
  return relation.relatedModel
}

function assertColumn(
  assert: { exists: (...args: any[]) => void; equal: (...args: any[]) => void },
  model: LucidModel,
  attribute: string,
  columnName: string,
  isPrimary?: boolean
) {
  const col = model.$getColumn(attribute)
  assert.exists(col, `Columna "${attribute}" no definida en ${model.name}`)
  if (!col) return
  assert.equal(col.columnName, columnName, `columnName de "${attribute}" en ${model.name}`)
  if (isPrimary !== undefined) {
    assert.equal(col.isPrimary, isPrimary)
  }
}

function assertRelation(
  assert: { exists: (...args: any[]) => void; equal: (...args: any[]) => void },
  model: LucidModel,
  relationName: string,
  type: RelationType,
  foreignKey: string,
  relatedTable: string
) {
  const relation = model.$relationsDefinitions.get(relationName) as
    | LucidRelationMeta
    | undefined
  assert.exists(relation, `Relación "${relationName}" no definida en ${model.name}`)
  if (!relation) return
  assert.equal(relation.type, type, `tipo de relación "${relationName}"`)
  assert.equal(relation.options.foreignKey, foreignKey, `foreignKey de "${relationName}"`)
  assert.equal(
    resolveRelatedModel(relation).table,
    relatedTable,
    `tabla relacionada de "${relationName}"`
  )
}

test.group('Funcionalidades del sistema — SystemFeature', () => {
  test('usa la tabla system_features y PK system_feature_id', ({ assert }) => {
    assert.equal(SystemFeature.table, 'system_features')
    assert.equal(SystemFeature.primaryKey, 'systemFeatureId')
    assertColumn(assert, SystemFeature, 'systemFeatureId', 'system_feature_id', true)
  })

  test('mapea FK a módulo, nombre, slug y descripción a snake_case', ({ assert }) => {
    assertColumn(assert, SystemFeature, 'systemModuleId', 'system_module_id')
    assertColumn(assert, SystemFeature, 'systemFeatureName', 'system_feature_name')
    assertColumn(assert, SystemFeature, 'systemFeatureSlug', 'system_feature_slug')
    assertColumn(assert, SystemFeature, 'systemFeatureDescription', 'system_feature_description')
  })

  test('mapea ENUM status a snake_case', ({ assert }) => {
    assertColumn(assert, SystemFeature, 'systemFeatureStatus', 'system_feature_status')
  })

  test('expone todas las columnas esperadas', ({ assert }) => {
    const expected = [
      'systemFeatureId',
      'systemModuleId',
      'systemFeatureName',
      'systemFeatureSlug',
      'systemFeatureDescription',
      'systemFeatureStatus',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ]
    for (const attr of expected) {
      assert.exists(
        SystemFeature.$getColumn(attr),
        `Falta columna "${attr}" en SystemFeature`
      )
    }
  })

  test('define timestamps estándar created_at / updated_at / deleted_at', ({ assert }) => {
    assertColumn(assert, SystemFeature, 'createdAt', 'created_at')
    assertColumn(assert, SystemFeature, 'updatedAt', 'updated_at')
    assertColumn(assert, SystemFeature, 'deletedAt', 'deleted_at')
  })

  test('expone columna deletedAt para borrado lógico', ({ assert }) => {
    const col = SystemFeature.$getColumn('deletedAt')
    assert.exists(col, 'SystemFeature debe tener columna deletedAt')
    if (!col) return
    assert.equal(col.columnName, 'deleted_at')
  })

  test('define relación belongsTo systemModule', ({ assert }) => {
    assertRelation(assert, SystemFeature, 'systemModule', 'belongsTo', 'systemModuleId', 'system_modules')
  })

  test('define relación hasMany regulationClauseFeatures — tipo y FK correctos', ({ assert }) => {
    const relation = SystemFeature.$relationsDefinitions.get('regulationClauseFeatures') as
      | { type: string; options: { foreignKey: string } }
      | undefined
    assert.exists(relation, 'Relación "regulationClauseFeatures" no definida en SystemFeature')
    if (!relation) return
    assert.equal(relation.type, 'hasMany')
    assert.equal(relation.options.foreignKey, 'systemFeatureId')
  })
})

test.group('Funcionalidades del sistema — extensión de SystemModule', () => {
  test('SystemModule expone relación hasMany features', ({ assert }) => {
    assertRelation(assert, SystemModule, 'features', 'hasMany', 'systemModuleId', 'system_features')
  })

  test('SystemModule conserva relación hasMany systemPermissions sin cambios', ({ assert }) => {
    assertRelation(
      assert,
      SystemModule,
      'systemPermissions',
      'hasMany',
      'systemModuleId',
      'system_permissions'
    )
  })
})
