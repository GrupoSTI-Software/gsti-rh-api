import { test } from '@japa/runner'
import RegulatoryAuthority from '#models/regulatory_authority'
import Regulation from '#models/regulation'
import RegulationClause from '#models/regulation_clause'
import RegulationClauseFeature from '#models/regulation_clause_feature'
import RegulationEvidenceRequirement from '#models/regulation_evidence_requirement'
import {
  assertModelColumn,
  assertModelHasColumns,
  assertModelRelation,
} from '../helpers/lucid_model_assertions.js'

/**
 * Tests unitarios del marco regulatorio (modelos Lucid).
 * No requieren base de datos: validan metadatos, mapeo de columnas y relaciones.
 */

const TIMESTAMP_COLUMNS = ['createdAt', 'updatedAt', 'deletedAt'] as const

test.group('Marco regulatorio — RegulatoryAuthority', () => {
  test('usa la tabla regulatory_authorities y PK regulatory_authority_id', ({ assert }) => {
    assert.equal(RegulatoryAuthority.table, 'regulatory_authorities')
    assert.equal(RegulatoryAuthority.primaryKey, 'regulatoryAuthorityId')
    assertModelColumn(assert, RegulatoryAuthority, 'regulatoryAuthorityId', {
      columnName: 'regulatory_authority_id',
      isPrimary: true,
    })
  })

  test('mapea columnas de negocio a snake_case', ({ assert }) => {
    assertModelColumn(assert, RegulatoryAuthority, 'regulatoryAuthoritySlug', {
      columnName: 'regulatory_authority_slug',
    })
    assertModelColumn(assert, RegulatoryAuthority, 'regulatoryAuthorityJurisdiction', {
      columnName: 'regulatory_authority_jurisdiction',
    })
    assertModelColumn(assert, RegulatoryAuthority, 'regulatoryAuthorityIsActive', {
      columnName: 'regulatory_authority_is_active',
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
      assertModelColumn(assert, RegulatoryAuthority, attribute, { columnName: expected })
    }
  })

  test('tiene relación hasMany regulations', ({ assert }) => {
    assertModelRelation(assert, RegulatoryAuthority, 'regulations', {
      type: 'hasMany',
      foreignKey: 'regulatoryAuthorityId',
      relatedTable: 'regulations',
    })
  })
})

test.group('Marco regulatorio — Regulation', () => {
  test('usa la tabla regulations y PK regulation_id', ({ assert }) => {
    assert.equal(Regulation.table, 'regulations')
    assert.equal(Regulation.primaryKey, 'regulationId')
    assertModelColumn(assert, Regulation, 'regulationId', {
      columnName: 'regulation_id',
      isPrimary: true,
    })
  })

  test('mapea columnas principales y FK a autoridad', ({ assert }) => {
    assertModelColumn(assert, Regulation, 'regulatoryAuthorityId', {
      columnName: 'regulatory_authority_id',
    })
    assertModelColumn(assert, Regulation, 'regulationCode', { columnName: 'regulation_code' })
    assertModelColumn(assert, Regulation, 'regulationType', { columnName: 'regulation_type' })
    assertModelColumn(assert, Regulation, 'regulationStatus', { columnName: 'regulation_status' })
    assertModelColumn(assert, Regulation, 'regulationRetentionMinYears', {
      columnName: 'regulation_retention_min_years',
    })
  })

  test('convierte fechas DATE de MySQL a instancias Date', ({ assert }) => {
    const publicationCol = Regulation.$getColumn('regulationPublicationDate')
    const effectiveCol = Regulation.$getColumn('regulationEffectiveDate')
    const revisionCol = Regulation.$getColumn('regulationLastRevisionDate')

    assert.exists(publicationCol)
    assert.exists(effectiveCol)
    assert.exists(revisionCol)
    if (!publicationCol || !effectiveCol || !revisionCol) {
      return
    }

    const consumeDate = (value: string | null) =>
      (publicationCol.consume as (v: string | null) => Date | null)(value)

    assert.instanceOf(consumeDate('2018-10-23'), Date)
    assert.instanceOf(
      (effectiveCol.consume as (v: string | null) => Date | null)('2019-01-01'),
      Date
    )
    assert.instanceOf(
      (revisionCol.consume as (v: string | null) => Date | null)('2020-06-15'),
      Date
    )
    assert.isNull((revisionCol.consume as (v: string | null) => Date | null)(null))
    assert.isNull((revisionCol.consume as (v: string | null) => Date | null)(''))
  })

  test('define relaciones belongsTo authority y hasMany clauses', ({ assert }) => {
    assertModelRelation(assert, Regulation, 'regulatoryAuthority', {
      type: 'belongsTo',
      foreignKey: 'regulatoryAuthorityId',
      relatedTable: 'regulatory_authorities',
    })
    assertModelRelation(assert, Regulation, 'clauses', {
      type: 'hasMany',
      foreignKey: 'regulationId',
      relatedTable: 'regulation_clauses',
    })
  })
})

test.group('Marco regulatorio — RegulationClause', () => {
  test('usa la tabla regulation_clauses y PK regulation_clause_id', ({ assert }) => {
    assert.equal(RegulationClause.table, 'regulation_clauses')
    assert.equal(RegulationClause.primaryKey, 'regulationClauseId')
  })

  test('mapea las 6 columnas _key de i18n', ({ assert }) => {
    assertModelHasColumns(assert, RegulationClause, [
      'regulationClauseTitleKey',
      'regulationClauseObligationKey',
      'regulationClauseExplanationKey',
      'regulationClauseRationaleKey',
      'regulationClauseAuditCriteriaKey',
      'regulationClauseApplicabilityKey',
    ])
    assertModelColumn(assert, RegulationClause, 'regulationClauseObligationKey', {
      columnName: 'regulation_clause_obligation_key',
    })
  })

  test('soporta auto-referencia parent / children', ({ assert }) => {
    assertModelColumn(assert, RegulationClause, 'parentRegulationClauseId', {
      columnName: 'parent_regulation_clause_id',
    })
    assertModelRelation(assert, RegulationClause, 'parent', {
      type: 'belongsTo',
      foreignKey: 'parentRegulationClauseId',
      relatedTable: 'regulation_clauses',
    })
    assertModelRelation(assert, RegulationClause, 'children', {
      type: 'hasMany',
      foreignKey: 'parentRegulationClauseId',
      relatedTable: 'regulation_clauses',
    })
  })

  test('relaciona features y evidencias requeridas', ({ assert }) => {
    assertModelRelation(assert, RegulationClause, 'regulation', {
      type: 'belongsTo',
      foreignKey: 'regulationId',
      relatedTable: 'regulations',
    })
    assertModelRelation(assert, RegulationClause, 'features', {
      type: 'hasMany',
      foreignKey: 'regulationClauseId',
      relatedTable: 'regulation_clause_features',
    })
    assertModelRelation(assert, RegulationClause, 'evidenceRequirements', {
      type: 'hasMany',
      foreignKey: 'regulationClauseId',
      relatedTable: 'regulation_evidence_requirements',
    })
  })
})

test.group('Marco regulatorio — RegulationClauseFeature', () => {
  test('usa la tabla regulation_clause_features', ({ assert }) => {
    assert.equal(RegulationClauseFeature.table, 'regulation_clause_features')
    assert.equal(RegulationClauseFeature.primaryKey, 'regulationClauseFeatureId')
  })

  test('mapea columnas de cobertura de producto', ({ assert }) => {
    assertModelColumn(assert, RegulationClauseFeature, 'regulationClauseFeatureSlug', {
      columnName: 'regulation_clause_feature_slug',
    })
    assertModelColumn(assert, RegulationClauseFeature, 'regulationClauseFeatureStatus', {
      columnName: 'regulation_clause_feature_status',
    })
    assertModelColumn(assert, RegulationClauseFeature, 'regulationClauseFeatureAvailableSince', {
      columnName: 'regulation_clause_feature_available_since',
    })
  })

  test('belongsTo regulationClause', ({ assert }) => {
    assertModelRelation(assert, RegulationClauseFeature, 'regulationClause', {
      type: 'belongsTo',
      foreignKey: 'regulationClauseId',
      relatedTable: 'regulation_clauses',
    })
  })
})

test.group('Marco regulatorio — RegulationEvidenceRequirement', () => {
  test('usa la tabla regulation_evidence_requirements', ({ assert }) => {
    assert.equal(RegulationEvidenceRequirement.table, 'regulation_evidence_requirements')
    assert.equal(
      RegulationEvidenceRequirement.primaryKey,
      'regulationEvidenceRequirementId'
    )
  })

  test('mapea tipo, clave i18n y años de retención', ({ assert }) => {
    assertModelColumn(assert, RegulationEvidenceRequirement, 'regulationEvidenceRequirementType', {
      columnName: 'regulation_evidence_requirement_type',
    })
    assertModelColumn(
      assert,
      RegulationEvidenceRequirement,
      'regulationEvidenceRequirementDescriptionKey',
      { columnName: 'regulation_evidence_requirement_description_key' }
    )
    assertModelColumn(
      assert,
      RegulationEvidenceRequirement,
      'regulationEvidenceRequirementRetentionYears',
      { columnName: 'regulation_evidence_requirement_retention_years' }
    )
  })

  test('belongsTo regulationClause', ({ assert }) => {
    assertModelRelation(assert, RegulationEvidenceRequirement, 'regulationClause', {
      type: 'belongsTo',
      foreignKey: 'regulationClauseId',
      relatedTable: 'regulation_clauses',
    })
  })
})

test.group('Marco regulatorio — SoftDeletes en todos los modelos', () => {
  const models = [
    RegulatoryAuthority,
    Regulation,
    RegulationClause,
    RegulationClauseFeature,
    RegulationEvidenceRequirement,
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
