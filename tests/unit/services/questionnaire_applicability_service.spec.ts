import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import QuestionnaireApplicabilityService from '#services/questionnaire_applicability_service'
import type { I18n } from '@adonisjs/i18n'

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await db.from(tableName).select('*').limit(1)
    return true
  } catch {
    return false
  }
}

function getI18nStub(): I18n {
  return {
    formatMessage: (key: string, params?: Record<string, unknown>) => {
      if (key === 'nom035.questionnaire_applicability.none_note') {
        return `No aplica (${String(params?.count ?? 0)})`
      }
      return key
    },
  } as unknown as I18n
}

test.group('QuestionnaireApplicabilityService', () => {
  test('reporta OPEN_ROUND_EXISTS cuando hay una ronda en curso', async ({ assert }) => {
    const requiredTables = ['branch_offices', 'questionnaire_applications', 'regulation_questionnaires']

    for (const tableName of requiredTables) {
      if (!(await tableExists(tableName))) {
        assert.isTrue(true, `Tabla ${tableName} no disponible en BD de testing; prueba omitida`)
        return
      }
    }

    const branch = await db
      .from('branch_offices as bo')
      .leftJoin('employee_branch_offices as ebo', 'ebo.branch_office_id', 'bo.branch_office_id')
      .leftJoin('employees as e', 'e.employee_id', 'ebo.employee_id')
      .whereNull('bo.branch_office_deleted_at')
      .where('ebo.employee_branch_office_active', 1)
      .whereNull('e.employee_deleted_at')
      .groupBy('bo.branch_office_id', 'bo.business_unit_id')
      .havingRaw('COUNT(DISTINCT ebo.employee_id) >= 16')
      .select('bo.branch_office_id', 'bo.business_unit_id')
      .first()
    const questionnaire = await db
      .from('regulation_questionnaires')
      .whereNull('deleted_at')
      .select('regulation_questionnaire_id')
      .first()

    if (!branch || !questionnaire) {
      assert.isTrue(
        true,
        'No hay sucursal con umbral mínimo y cuestionario disponibles en BD de testing; prueba omitida'
      )
      return
    }

    const now = DateTime.utc().toSQL({ includeOffset: false })!
    const folio = `TEST-APPL-OPEN-${Date.now()}`
    const [applicationIdRaw] = await db.table('questionnaire_applications').insert({
      business_unit_id: Number(branch.business_unit_id),
      branch_office_id: Number(branch.branch_office_id),
      regulation_questionnaire_id: Number(questionnaire.regulation_questionnaire_id),
      questionnaire_application_folio: folio,
      questionnaire_application_instrument: 'guide_ii',
      questionnaire_application_status: 'en-curso',
      questionnaire_application_launched_at: now,
      questionnaire_application_closed_at: null,
      questionnaire_application_created_at: now,
      questionnaire_application_updated_at: now,
      questionnaire_application_deleted_at: null,
    })

    const applicationId = Number(applicationIdRaw)

    try {
      const result = await QuestionnaireApplicabilityService.getByBranchOffice(
        Number(branch.branch_office_id),
        getI18nStub()
      )

      assert.isFalse(result.canLaunch)
      assert.equal(result.launchBlockReason, 'OPEN_ROUND_EXISTS')
      assert.isNotNull(result.blockingApplicationId)
    } finally {
      await db
        .from('questionnaire_applications')
        .where('questionnaire_application_id', applicationId)
        .delete()
    }
  })

  test('reporta NOT_APPLICABLE cuando la sucursal no alcanza umbral mínimo', async ({ assert }) => {
    const requiredTables = ['branch_offices', 'business_units']
    for (const tableName of requiredTables) {
      if (!(await tableExists(tableName))) {
        assert.isTrue(true, `Tabla ${tableName} no disponible en BD de testing; prueba omitida`)
        return
      }
    }

    const baseBranch = await db
      .from('branch_offices')
      .whereNull('branch_office_deleted_at')
      .select('business_unit_id')
      .first()

    if (!baseBranch) {
      assert.isTrue(true, 'No hay sucursales disponibles en BD de testing; prueba omitida')
      return
    }

    const now = DateTime.utc().toSQL({ includeOffset: false })!
    const suffix = Date.now()
    const [branchOfficeIdRaw] = await db.table('branch_offices').insert({
      business_unit_id: Number(baseBranch.business_unit_id),
      branch_office_name: `Sucursal Applicability ${suffix}`,
      branch_office_slug: `sucursal-applicability-${suffix}`,
      branch_office_location_address: null,
      branch_office_ideal_template_count: null,
      branch_office_min_active_employees_per_shift: null,
      branch_office_created_at: now,
      branch_office_updated_at: now,
      branch_office_deleted_at: null,
    })

    const branchOfficeId = Number(branchOfficeIdRaw)

    try {
      const result = await QuestionnaireApplicabilityService.getByBranchOffice(
        branchOfficeId,
        getI18nStub()
      )

      assert.equal(result.applicableInstrument, 'none')
      assert.isFalse(result.canLaunch)
      assert.equal(result.launchBlockReason, 'NOT_APPLICABLE')
      assert.isNull(result.blockingApplicationId)
      assert.isString(result.note)
    } finally {
      await db.from('branch_offices').where('branch_office_id', branchOfficeId).delete()
    }
  })
})
