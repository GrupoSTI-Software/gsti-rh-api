import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { LucidModel } from '@adonisjs/lucid/types/model'
import RegulatoryAuthority from '#models/regulatory_authority'
import RegulationClause from '#models/regulation_clause'
import RegulationQuestionnaire from '#models/regulation_questionnaire'
import RegulationQuestionnaireSection from '#models/regulation_questionnaire_section'
import RegulationQuestionnaireQuestion from '#models/regulation_questionnaire_question'
import RegulationQuestionnaireAnswerScale from '#models/regulation_questionnaire_answer_scale'
import RegulationClauseQuestionnaire from '#models/regulation_clause_questionnaire'
import {
  assertModelColumn,
  assertModelHasColumns,
  assertModelRelation,
} from '../helpers/lucid_model_assertions.js'

/**
 * Tests unitarios de instrumentos de evaluación (cuestionarios regulatorios).
 * No requieren base de datos: validan metadatos, mapeo de columnas y relaciones.
 */

const TIMESTAMP_COLUMNS = ['createdAt', 'updatedAt', 'deletedAt'] as const

interface ManyToManyExpectation {
  pivotTable: string
  localKey: string
  pivotForeignKey: string
  relatedKey: string
  pivotRelatedForeignKey: string
  relatedTable: string
  pivotColumns?: string[]
}

interface LucidManyToManyMeta {
  type: 'manyToMany'
  relatedModel: LucidModel
  options: ManyToManyExpectation & {
    relatedModel?: () => LucidModel
  }
}

function resolveRelatedModel(relation: LucidManyToManyMeta): LucidModel {
  if (relation.relatedModel?.table) {
    return relation.relatedModel
  }
  if (typeof relation.options.relatedModel === 'function') {
    return relation.options.relatedModel()
  }
  return relation.relatedModel
}

function assertManyToManyRelation(
  assert: Assert,
  model: LucidModel,
  relationName: string,
  expectation: ManyToManyExpectation
) {
  const relation = model.$relationsDefinitions.get(relationName) as
    | LucidManyToManyMeta
    | undefined

  assert.exists(relation, `Relación "${relationName}" no definida en ${model.name}`)
  if (!relation) {
    return
  }

  assert.equal(relation.type, 'manyToMany')
  assert.equal(relation.options.pivotTable, expectation.pivotTable)
  assert.equal(relation.options.localKey, expectation.localKey)
  assert.equal(relation.options.pivotForeignKey, expectation.pivotForeignKey)
  assert.equal(relation.options.relatedKey, expectation.relatedKey)
  assert.equal(relation.options.pivotRelatedForeignKey, expectation.pivotRelatedForeignKey)
  assert.equal(resolveRelatedModel(relation).table, expectation.relatedTable)

  if (expectation.pivotColumns) {
    assert.deepEqual(relation.options.pivotColumns, expectation.pivotColumns)
  }
}

test.group('Cuestionarios regulatorios — RegulationQuestionnaire', () => {
  test('usa la tabla regulation_questionnaires y PK regulation_questionnaire_id', ({ assert }) => {
    assert.equal(RegulationQuestionnaire.table, 'regulation_questionnaires')
    assert.equal(RegulationQuestionnaire.primaryKey, 'regulationQuestionnaireId')
    assertModelColumn(assert, RegulationQuestionnaire, 'regulationQuestionnaireId', {
      columnName: 'regulation_questionnaire_id',
      isPrimary: true,
    })
  })

  test('mapea columnas de negocio e i18n a snake_case', ({ assert }) => {
    assertModelColumn(assert, RegulationQuestionnaire, 'regulatoryAuthorityId', {
      columnName: 'regulatory_authority_id',
    })
    assertModelColumn(assert, RegulationQuestionnaire, 'regulationQuestionnaireCode', {
      columnName: 'regulation_questionnaire_code',
    })
    assertModelColumn(assert, RegulationQuestionnaire, 'regulationQuestionnaireTitleKey', {
      columnName: 'regulation_questionnaire_title_key',
    })
    assertModelColumn(assert, RegulationQuestionnaire, 'regulationQuestionnaireDescriptionKey', {
      columnName: 'regulation_questionnaire_description_key',
    })
    assertModelColumn(assert, RegulationQuestionnaire, 'regulationQuestionnaireVersion', {
      columnName: 'regulation_questionnaire_version',
    })
    assertModelColumn(assert, RegulationQuestionnaire, 'regulationQuestionnaireStatus', {
      columnName: 'regulation_questionnaire_status',
    })
    assertModelColumn(assert, RegulationQuestionnaire, 'regulationQuestionnaireAppliesToDescriptionKey', {
      columnName: 'regulation_questionnaire_applies_to_description_key',
    })
    assertModelColumn(assert, RegulationQuestionnaire, 'regulationQuestionnaireMinResponders', {
      columnName: 'regulation_questionnaire_min_responders',
    })
    assertModelColumn(assert, RegulationQuestionnaire, 'regulationQuestionnaireCompletionTimeMinutes', {
      columnName: 'regulation_questionnaire_completion_time_minutes',
    })
  })

  test('define timestamps estándar created_at / updated_at / deleted_at', ({ assert }) => {
    for (const attribute of TIMESTAMP_COLUMNS) {
      const expected =
        attribute === 'createdAt'
          ? 'created_at'
          : attribute === 'updatedAt'
            ? 'updated_at'
            : 'deleted_at'
      assertModelColumn(assert, RegulationQuestionnaire, attribute, { columnName: expected })
    }
  })

  test('define relaciones belongsTo authority, hasMany sections y manyToMany clauses', ({
    assert,
  }) => {
    assertModelRelation(assert, RegulationQuestionnaire, 'regulatoryAuthority', {
      type: 'belongsTo',
      foreignKey: 'regulatoryAuthorityId',
      relatedTable: 'regulatory_authorities',
    })
    assertModelRelation(assert, RegulationQuestionnaire, 'sections', {
      type: 'hasMany',
      foreignKey: 'regulationQuestionnaireId',
      relatedTable: 'regulation_questionnaire_sections',
    })
    assertManyToManyRelation(assert, RegulationQuestionnaire, 'clauses', {
      pivotTable: 'regulation_clause_questionnaires',
      localKey: 'regulationQuestionnaireId',
      pivotForeignKey: 'regulation_questionnaire_id',
      relatedKey: 'regulationClauseId',
      pivotRelatedForeignKey: 'regulation_clause_id',
      relatedTable: 'regulation_clauses',
      pivotColumns: ['regulation_clause_questionnaire_notes'],
    })
  })
})

test.group('Cuestionarios regulatorios — RegulationQuestionnaireSection', () => {
  test('usa la tabla regulation_questionnaire_sections y PK regulation_questionnaire_section_id', ({
    assert,
  }) => {
    assert.equal(RegulationQuestionnaireSection.table, 'regulation_questionnaire_sections')
    assert.equal(RegulationQuestionnaireSection.primaryKey, 'regulationQuestionnaireSectionId')
  })

  test('mapea columnas de sección y orden', ({ assert }) => {
    assertModelColumn(assert, RegulationQuestionnaireSection, 'regulationQuestionnaireId', {
      columnName: 'regulation_questionnaire_id',
    })
    assertModelColumn(assert, RegulationQuestionnaireSection, 'regulationQuestionnaireSectionCode', {
      columnName: 'regulation_questionnaire_section_code',
    })
    assertModelColumn(assert, RegulationQuestionnaireSection, 'regulationQuestionnaireSectionTitleKey', {
      columnName: 'regulation_questionnaire_section_title_key',
    })
    assertModelColumn(assert, RegulationQuestionnaireSection, 'regulationQuestionnaireSectionDescriptionKey', {
      columnName: 'regulation_questionnaire_section_description_key',
    })
    assertModelColumn(assert, RegulationQuestionnaireSection, 'regulationQuestionnaireSectionOrd', {
      columnName: 'regulation_questionnaire_section_ord',
    })
  })

  test('define relaciones belongsTo questionnaire y hasMany questions', ({ assert }) => {
    assertModelRelation(assert, RegulationQuestionnaireSection, 'questionnaire', {
      type: 'belongsTo',
      foreignKey: 'regulationQuestionnaireId',
      relatedTable: 'regulation_questionnaires',
    })
    assertModelRelation(assert, RegulationQuestionnaireSection, 'questions', {
      type: 'hasMany',
      foreignKey: 'regulationQuestionnaireSectionId',
      relatedTable: 'regulation_questionnaire_questions',
    })
  })
})

test.group('Cuestionarios regulatorios — RegulationQuestionnaireQuestion', () => {
  test('usa la tabla regulation_questionnaire_questions y PK regulation_questionnaire_question_id', ({
    assert,
  }) => {
    assert.equal(RegulationQuestionnaireQuestion.table, 'regulation_questionnaire_questions')
    assert.equal(RegulationQuestionnaireQuestion.primaryKey, 'regulationQuestionnaireQuestionId')
  })

  test('mapea columnas de pregunta, escala, ponderación y reverse-scored', ({ assert }) => {
    assertModelHasColumns(assert, RegulationQuestionnaireQuestion, [
      'regulationQuestionnaireQuestionCode',
      'regulationQuestionnaireQuestionTextKey',
      'regulationQuestionnaireQuestionHelpKey',
      'regulationQuestionnaireQuestionAnswerScaleId',
      'regulationQuestionnaireQuestionIsReverseScored',
      'regulationQuestionnaireQuestionWeight',
      'regulationQuestionnaireQuestionOrd',
    ])
    assertModelColumn(assert, RegulationQuestionnaireQuestion, 'regulationQuestionnaireQuestionTextKey', {
      columnName: 'regulation_questionnaire_question_text_key',
    })
    assertModelColumn(assert, RegulationQuestionnaireQuestion, 'regulationQuestionnaireQuestionWeight', {
      columnName: 'regulation_questionnaire_question_weight',
    })
  })

  test('define relaciones belongsTo section y answerScale', ({ assert }) => {
    assertModelRelation(assert, RegulationQuestionnaireQuestion, 'section', {
      type: 'belongsTo',
      foreignKey: 'regulationQuestionnaireSectionId',
      relatedTable: 'regulation_questionnaire_sections',
    })
    assertModelRelation(assert, RegulationQuestionnaireQuestion, 'answerScale', {
      type: 'belongsTo',
      foreignKey: 'regulationQuestionnaireQuestionAnswerScaleId',
      relatedTable: 'regulation_questionnaire_answer_scales',
    })
  })
})

test.group('Cuestionarios regulatorios — RegulationQuestionnaireAnswerScale', () => {
  test('usa la tabla regulation_questionnaire_answer_scales y PK regulation_questionnaire_answer_scale_id', ({
    assert,
  }) => {
    assert.equal(RegulationQuestionnaireAnswerScale.table, 'regulation_questionnaire_answer_scales')
    assert.equal(
      RegulationQuestionnaireAnswerScale.primaryKey,
      'regulationQuestionnaireAnswerScaleId'
    )
  })

  test('mapea código, título i18n y definición JSON', ({ assert }) => {
    assertModelColumn(assert, RegulationQuestionnaireAnswerScale, 'regulationQuestionnaireAnswerScaleCode', {
      columnName: 'regulation_questionnaire_answer_scale_code',
    })
    assertModelColumn(assert, RegulationQuestionnaireAnswerScale, 'regulationQuestionnaireAnswerScaleTitleKey', {
      columnName: 'regulation_questionnaire_answer_scale_title_key',
    })
    assertModelColumn(assert, RegulationQuestionnaireAnswerScale, 'regulationQuestionnaireAnswerScaleDefinition', {
      columnName: 'regulation_questionnaire_answer_scale_definition',
    })
  })

  test('define relación hasMany questions', ({ assert }) => {
    assertModelRelation(assert, RegulationQuestionnaireAnswerScale, 'questions', {
      type: 'hasMany',
      foreignKey: 'regulationQuestionnaireQuestionAnswerScaleId',
      relatedTable: 'regulation_questionnaire_questions',
    })
  })
})

test.group('Cuestionarios regulatorios — RegulationClauseQuestionnaire', () => {
  test('usa la tabla regulation_clause_questionnaires y PK regulation_clause_questionnaire_id', ({
    assert,
  }) => {
    assert.equal(RegulationClauseQuestionnaire.table, 'regulation_clause_questionnaires')
    assert.equal(RegulationClauseQuestionnaire.primaryKey, 'regulationClauseQuestionnaireId')
  })

  test('mapea FKs de pivote y notas contextuales', ({ assert }) => {
    assertModelColumn(assert, RegulationClauseQuestionnaire, 'regulationClauseId', {
      columnName: 'regulation_clause_id',
    })
    assertModelColumn(assert, RegulationClauseQuestionnaire, 'regulationQuestionnaireId', {
      columnName: 'regulation_questionnaire_id',
    })
    assertModelColumn(assert, RegulationClauseQuestionnaire, 'regulationClauseQuestionnaireNotes', {
      columnName: 'regulation_clause_questionnaire_notes',
    })
  })

  test('define relaciones belongsTo clause y questionnaire', ({ assert }) => {
    assertModelRelation(assert, RegulationClauseQuestionnaire, 'regulationClause', {
      type: 'belongsTo',
      foreignKey: 'regulationClauseId',
      relatedTable: 'regulation_clauses',
    })
    assertModelRelation(assert, RegulationClauseQuestionnaire, 'questionnaire', {
      type: 'belongsTo',
      foreignKey: 'regulationQuestionnaireId',
      relatedTable: 'regulation_questionnaires',
    })
  })
})

test.group('Cuestionarios regulatorios — extensiones en modelos existentes', () => {
  test('RegulatoryAuthority expone hasMany questionnaires', ({ assert }) => {
    assertModelRelation(assert, RegulatoryAuthority, 'questionnaires', {
      type: 'hasMany',
      foreignKey: 'regulatoryAuthorityId',
      relatedTable: 'regulation_questionnaires',
    })
  })

  test('RegulationClause expone manyToMany questionnaires con pivote y notas', ({ assert }) => {
    assertManyToManyRelation(assert, RegulationClause, 'questionnaires', {
      pivotTable: 'regulation_clause_questionnaires',
      localKey: 'regulationClauseId',
      pivotForeignKey: 'regulation_clause_id',
      relatedKey: 'regulationQuestionnaireId',
      pivotRelatedForeignKey: 'regulation_questionnaire_id',
      relatedTable: 'regulation_questionnaires',
      pivotColumns: ['regulation_clause_questionnaire_notes'],
    })
  })
})

test.group('Cuestionarios regulatorios — SoftDeletes en todos los modelos', () => {
  const models = [
    RegulationQuestionnaire,
    RegulationQuestionnaireSection,
    RegulationQuestionnaireQuestion,
    RegulationQuestionnaireAnswerScale,
    RegulationClauseQuestionnaire,
  ] as const

  for (const model of models) {
    test(`${model.name} expone columna deletedAt para borrado lógico`, ({ assert }) => {
      const deletedAt = model.$getColumn('deletedAt')
      assert.exists(deletedAt)
      if (!deletedAt) {
        return
      }
      assert.equal(deletedAt.columnName, 'deleted_at')
    })
  }
})
