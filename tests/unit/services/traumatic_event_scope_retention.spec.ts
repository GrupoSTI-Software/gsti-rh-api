import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * USRH1786595131490 — retiro quirúrgico del predicado de empresa en el
 * whereHas del colaborador, y retención contra la unidad dueña del reporte.
 */

const REPORT_SERVICE = join(process.cwd(), 'app/services/traumatic_event_report_service.ts')
const REGISTRY_SERVICE = join(
  process.cwd(),
  'app/services/traumatic_event_registry_report_service.ts'
)
const EXAM_SERVICE = join(process.cwd(), 'app/services/traumatic_event_exam_service.ts')
const REFERRAL_SERVICE = join(process.cwd(), 'app/services/traumatic_event_referral_service.ts')
const EVIDENCE_SERVICE = join(
  process.cwd(),
  'app/services/traumatic_event_report_evidence_service.ts'
)

function sliceBetween(source: string, startToken: string, endToken: string): string {
  const start = source.indexOf(startToken)
  if (start < 0) throw new Error(`No se encontró inicio: ${startToken}`)
  const end = source.indexOf(endToken, start + startToken.length)
  if (end < 0) throw new Error(`No se encontró fin: ${endToken}`)
  return source.slice(start, end)
}

test.group('Eventos traumáticos — whereHas ya no deduce la empresa del colaborador', () => {
  test('listPaginated y findInScopeOrFail conservan baja y fail-closed, sin whereIn de empresa', ({
    assert,
  }) => {
    const content = readFileSync(REPORT_SERVICE, 'utf-8')
    const listBody = sliceBetween(content, 'async listPaginated', 'async findById')
    const findBody = sliceBetween(content, 'private async findInScopeOrFail', 'ensureEmployeeBelongsToScope')

    for (const [label, body] of [
      ['listPaginated', listBody],
      ['findInScopeOrFail', findBody],
    ] as const) {
      assert.include(body, "q.whereNull('employee_deleted_at')", label)
      assert.include(body, 'allowedBusinessUnitIds.length === 0', label)
      assert.include(body, "q.whereRaw('1 = 0')", label)
      assert.notInclude(body, "q.whereIn('business_unit_id', allowedBusinessUnitIds)", label)
    }
  })

  test('la búsqueda por nombre conserva su whereHas de texto', ({ assert }) => {
    const content = readFileSync(REPORT_SERVICE, 'utf-8')
    const listBody = sliceBetween(content, 'async listPaginated', 'async findById')

    assert.include(
      listBody,
      'UPPER(CONCAT(employee_first_name, " ", employee_last_name)) LIKE ?'
    )
  })

  test('ensureEmployeeBelongsToScope sigue filtrando por unidad al asignar empleado', ({
    assert,
  }) => {
    const content = readFileSync(REPORT_SERVICE, 'utf-8')
    const body = sliceBetween(
      content,
      'private async ensureEmployeeBelongsToScope',
      'private async ensureEventTypeValid'
    )
    assert.include(body, ".whereIn('business_unit_id', allowedBusinessUnitIds)")
  })

  test('el registro auditable deja el whereHas solo con employee_deleted_at', ({ assert }) => {
    const content = readFileSync(REGISTRY_SERVICE, 'utf-8')
    const body = sliceBetween(content, 'private buildBaseQuery', 'private async hydrateItems')

    assert.include(body, "eq.whereNull('employee_deleted_at')")
    assert.notInclude(body, ".whereIn('business_unit_id', allowedBusinessUnitIds)")
    assert.include(content, 'allowedBusinessUnitIds.length === 0')
  })
})

test.group('Eventos traumáticos — retención contra la empresa dueña del reporte', () => {
  test('destroy del reporte usa report.businessUnitId y conserva load(employee)', ({
    assert,
  }) => {
    const content = readFileSync(REPORT_SERVICE, 'utf-8')
    const body = sliceBetween(content, 'async destroy', 'async assertReportInScope')

    assert.include(body, "await report.load('employee')")
    assert.include(body, 'report.businessUnitId')
    assert.notInclude(body, 'report.employee.businessUnitId')
  })

  test('destroy de examen y canalización usan report.businessUnitId y ya no cargan employee', ({
    assert,
  }) => {
    const exam = readFileSync(EXAM_SERVICE, 'utf-8')
    const referral = readFileSync(REFERRAL_SERVICE, 'utf-8')
    const examDestroy = sliceBetween(exam, 'async destroy', 'private async findExamOrFail')
    const referralDestroy = sliceBetween(
      referral,
      'async destroy',
      'private async findReferralOrFail'
    )

    for (const [label, body] of [
      ['exam', examDestroy],
      ['referral', referralDestroy],
    ] as const) {
      assert.include(body, 'report.businessUnitId', label)
      assert.notInclude(body, "load('employee')", label)
      assert.notInclude(body, 'report.employee.businessUnitId', label)
    }
  })

  test('el destroy de evidencias no invoca RetentionGuardService (C-17)', ({ assert }) => {
    const content = readFileSync(EVIDENCE_SERVICE, 'utf-8')
    assert.notInclude(content, 'RetentionGuardService')
  })
})
