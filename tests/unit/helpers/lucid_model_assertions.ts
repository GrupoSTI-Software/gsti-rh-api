import type { Assert } from '@japa/assert'
import type { LucidModel } from '@adonisjs/lucid/types/model'

type RelationType = 'hasMany' | 'belongsTo' | 'hasOne' | 'manyToMany'

interface ColumnExpectation {
  columnName: string
  isPrimary?: boolean
}

interface RelationExpectation {
  type: RelationType
  foreignKey: string
  relatedTable: string
}

function resolveRelatedModel(relation: {
  relatedModel: LucidModel
  options: { relatedModel?: () => LucidModel }
}): LucidModel {
  if (relation.relatedModel?.table) {
    return relation.relatedModel
  }
  if (typeof relation.options.relatedModel === 'function') {
    return relation.options.relatedModel()
  }
  return relation.relatedModel
}

/**
 * Verifica que un atributo del modelo Lucid mapee a la columna SQL esperada.
 */
export function assertModelColumn(
  assert: Assert,
  model: LucidModel,
  attribute: string,
  expectation: ColumnExpectation
) {
  const column = model.$getColumn(attribute)
  assert.exists(column, `Columna "${attribute}" no definida en ${model.name}`)
  assert.equal(
    column.columnName,
    expectation.columnName,
    `columnName de "${attribute}" en ${model.name}`
  )
  if (expectation.isPrimary !== undefined) {
    assert.equal(column.isPrimary, expectation.isPrimary)
  }
}

/**
 * Verifica tipo, FK y modelo relacionado de una relación Lucid.
 */
export function assertModelRelation(
  assert: Assert,
  model: LucidModel,
  relationName: string,
  expectation: RelationExpectation
) {
  const relation = model.$relationsDefinitions.get(relationName)
  assert.exists(relation, `Relación "${relationName}" no definida en ${model.name}`)
  assert.equal(relation.type, expectation.type)
  assert.equal(relation.options.foreignKey, expectation.foreignKey)
  const relatedModel = resolveRelatedModel(relation)
  assert.equal(relatedModel.table, expectation.relatedTable)
}

/**
 * Verifica que el modelo exponga las columnas indicadas.
 */
export function assertModelHasColumns(assert: Assert, model: LucidModel, attributes: string[]) {
  for (const attribute of attributes) {
    assert.exists(
      model.$getColumn(attribute),
      `Falta columna "${attribute}" en ${model.name}`
    )
  }
}
