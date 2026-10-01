import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import type { TenantActor } from '#tests/helpers/tenant_actor'
import { cleanupTenantActor, createBypassActor } from '#tests/helpers/tenant_actor'
import type { EmployeeFixture } from '#tests/helpers/employee_fixture'
import { cleanupEmployeeFixture, createEmployeeFixture } from '#tests/helpers/employee_fixture'
import { WORK_DISABILITY_ERROR_CODES } from '#constants/work_disability_error_codes'

/**
 * Incapacidades desde la ficha del empleado: registro en un paso (incapacidad
 * y periodo inicial), ampliación con su tipo, la consulta de la sección (con
 * la nota publicada aparte, por JSON) y las reglas de folio, traslape y periodo
 * inicial.
 */

/** PDF mínimo válido para el documento del periodo. */
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
)
const START = '2026-11-02'

/** Folio único por corrida: el folio no se repite en toda la empresa. */
const folio = () => `SB${String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0')}`

let actor: TenantActor | null = null
let fixture: EmployeeFixture | null = null
let coverageId = 0
let internalCoverageId = 0
let subsequentTypeId = 0
let initialTypeId = 0

const headers = () => ({ 'X-Business-Unit-Id': actor!.businessUnit.businessUnitPublicId })
const base = () => `/api/v1/employees/${fixture!.employee.employeeId}/work-disabilities`

test.group('Incapacidades del empleado', (group) => {
  group.setup(async () => {
    actor = await createBypassActor('owner', 'incapacidad')
    fixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'incapacidad')

    const coverage = await db
      .from('insurance_coverage_types')
      .where('insurance_coverage_type_slug', 'enfermedad-general')
      .first()
    coverageId = Number(coverage.insurance_coverage_type_id)
    const internal = await db
      .from('insurance_coverage_types')
      .where('insurance_coverage_type_slug', 'incapacidad-interna')
      .first()
    internalCoverageId = Number(internal.insurance_coverage_type_id)
    const types = await db.from('work_disability_types').select('work_disability_type_id', 'work_disability_type_slug')
    initialTypeId = Number(types.find((t) => t.work_disability_type_slug === 'inicial').work_disability_type_id)
    subsequentTypeId = Number(types.find((t) => t.work_disability_type_slug === 'subsecuente').work_disability_type_id)

    return async () => {
      const employeeId = fixture!.employee.employeeId
      const disabilities = await db
        .from('work_disabilities')
        .where('employee_id', employeeId)
        .select('work_disability_id')
      const disabilityIds = disabilities.map((row) => row.work_disability_id)
      if (disabilityIds.length) {
        const periods = await db
          .from('work_disability_periods')
          .whereIn('work_disability_id', disabilityIds)
          .select('work_disability_period_id')
        const periodIds = periods.map((row) => row.work_disability_period_id)
        if (periodIds.length) {
          await db.from('shift_exceptions').whereIn('work_disability_period_id', periodIds).delete()
          await db.from('work_disability_period_expenses').whereIn('work_disability_period_id', periodIds).delete()
          await db.from('work_disability_periods').whereIn('work_disability_period_id', periodIds).delete()
        }
        await db.from('work_disability_notes').whereIn('work_disability_id', disabilityIds).delete()
        await db.from('work_disabilities').whereIn('work_disability_id', disabilityIds).delete()
      }
      await db.from('employee_assist_calendars').where('employee_id', employeeId).delete()
      await cleanupEmployeeFixture(fixture)
      await cleanupTenantActor(actor)
    }
  })

  test('registra la incapacidad con su periodo inicial y la consulta la devuelve con su nota', async ({
    client,
    assert,
  }) => {
    const ticket = folio()
    const created = await client
      .post(base())
      .field('insuranceCoverageTypeId', String(coverageId))
      .field('folio', ticket.toLowerCase())
      .field('startDate', START)
      .field('days', '3')
      .file('document', PDF, { filename: 'certificado.pdf', contentType: 'application/pdf' })
      .loginAs(actor!.user)
      .headers(headers())
    assert.equal(created.status(), 201, JSON.stringify(created.body()))
    const { workDisabilityId, workDisabilityPeriodId } = created.body().data.workDisability

    const period = await db.from('work_disability_periods').where('work_disability_period_id', workDisabilityPeriodId).first()
    assert.equal(period.work_disability_type_id, initialTypeId)
    assert.equal(period.work_disability_period_ticket_folio, ticket, 'el folio se guarda en mayúsculas')
    assert.equal(period.work_disability_period_registered_by_user_id, actor!.user.userId)

    const exceptionType = await db.from('exception_types').where('exception_type_slug', 'falta-por-incapacidad').first()
    if (exceptionType) {
      const days = await db
        .from('shift_exceptions')
        .where('work_disability_period_id', workDisabilityPeriodId)
        .whereNull('shift_exceptions_deleted_at')
      assert.lengthOf(days, 3, 'una excepción de turno por día amparado')
    }

    // La nota es dato de salud: el backoffice la publica aparte, por JSON.
    const note = await client
      .post('/api/work-disability-notes')
      .json({ workDisabilityId, workDisabilityNoteDescription: 'Influenza, reposo en casa' })
      .loginAs(actor!.user)
      .headers(headers())
    assert.equal(note.status(), 201, JSON.stringify(note.body()))

    const feed = await client.get(base()).loginAs(actor!.user).headers(headers())
    feed.assertStatus(200)
    const disability = (feed.body().data.workDisabilities as Array<Record<string, any>>).find(
      (row) => row.workDisabilityId === workDisabilityId
    )!
    assert.equal(disability.coverageSlug, 'enfermedad-general')
    assert.equal(disability.startDate, START)
    assert.equal(disability.endDate, '2026-11-04')
    assert.equal(disability.totalDays, 3)
    assert.lengthOf(disability.periods, 1)
    assert.equal(disability.periods[0].typeSlug, 'inicial')
    assert.isTrue(disability.periods[0].hasFile)
    assert.lengthOf(disability.notes, 1)
  })

  test('rechaza un folio fuera de formato y fechas empalmadas', async ({ client, assert }) => {
    const badFolio = await client
      .post(base())
      .field('insuranceCoverageTypeId', String(coverageId))
      .field('folio', '12345')
      .field('startDate', '2026-12-01')
      .field('days', '2')
      .file('document', PDF, { filename: 'certificado.pdf', contentType: 'application/pdf' })
      .loginAs(actor!.user)
      .headers(headers())
    badFolio.assertStatus(422)
    assert.equal(badFolio.body().code, WORK_DISABILITY_ERROR_CODES.FOLIO_INVALID)

    const overlap = await client
      .post(base())
      .field('insuranceCoverageTypeId', String(coverageId))
      .field('folio', folio())
      .field('startDate', '2026-11-03')
      .field('days', '2')
      .file('document', PDF, { filename: 'certificado.pdf', contentType: 'application/pdf' })
      .loginAs(actor!.user)
      .headers(headers())
    overlap.assertStatus(422)
    assert.equal(overlap.body().code, WORK_DISABILITY_ERROR_CODES.PERIOD_OVERLAP)
  })

  test('la incapacidad interna puede ir sin folio', async ({ client, assert }) => {
    const created = await client
      .post(base())
      .field('insuranceCoverageTypeId', String(internalCoverageId))
      .field('startDate', '2027-01-11')
      .field('days', '1')
      .file('document', PDF, { filename: 'interna.pdf', contentType: 'application/pdf' })
      .loginAs(actor!.user)
      .headers(headers())
    assert.equal(created.status(), 201, JSON.stringify(created.body()))
  })

  test('amplía con su tipo, protege el periodo inicial y registra gastos sin comprobante', async ({
    client,
    assert,
  }) => {
    const feed = await client.get(base()).loginAs(actor!.user).headers(headers())
    const disability = (feed.body().data.workDisabilities as Array<Record<string, any>>).find(
      (row) => row.startDate === START
    )!

    const extended = await client
      .post(`${base()}/${disability.workDisabilityId}/extensions`)
      .field('workDisabilityTypeId', String(subsequentTypeId))
      .field('folio', folio())
      .field('startDate', '2026-11-05')
      .field('days', '4')
      .file('document', PDF, { filename: 'ampliacion.pdf', contentType: 'application/pdf' })
      .loginAs(actor!.user)
      .headers(headers())
    assert.equal(extended.status(), 201, JSON.stringify(extended.body()))

    const initialTypeAsExtension = await client
      .post(`${base()}/${disability.workDisabilityId}/extensions`)
      .field('workDisabilityTypeId', String(initialTypeId))
      .field('folio', folio())
      .field('startDate', '2026-11-20')
      .field('days', '1')
      .file('document', PDF, { filename: 'ampliacion.pdf', contentType: 'application/pdf' })
      .loginAs(actor!.user)
      .headers(headers())
    initialTypeAsExtension.assertStatus(422)

    const deleteInitial = await client
      .delete(`/api/work-disability-periods/${disability.periods[0].workDisabilityPeriodId}`)
      .loginAs(actor!.user)
      .headers(headers())
    deleteInitial.assertStatus(422)
    assert.equal(deleteInitial.body().code, WORK_DISABILITY_ERROR_CODES.INITIAL_PERIOD_LOCKED)

    const expense = await client
      .post('/api/work-disability-period-expenses')
      .json({
        workDisabilityPeriodId: disability.periods[0].workDisabilityPeriodId,
        workDisabilityPeriodExpenseAmount: 300,
        workDisabilityPeriodExpenseConcept: 'Consulta médica de valoración',
      })
      .loginAs(actor!.user)
      .headers(headers())
    assert.equal(expense.status(), 201, JSON.stringify(expense.body()))

    const after = await client.get(base()).loginAs(actor!.user).headers(headers())
    const updated = (after.body().data.workDisabilities as Array<Record<string, any>>).find(
      (row) => row.workDisabilityId === disability.workDisabilityId
    )!
    assert.deepEqual(
      updated.periods.map((p: Record<string, unknown>) => p.typeSlug),
      ['inicial', 'subsecuente']
    )
    assert.equal(updated.totalDays, 7)
    assert.equal(updated.endDate, '2026-11-08')
    assert.lengthOf(updated.expenses, 1)
    assert.equal(updated.expenses[0].concept, 'Consulta médica de valoración')
    assert.isFalse(updated.expenses[0].hasFile)
  })

  test('el regreso anticipado recorta el periodo y retira las ampliaciones y sus excepciones', async ({
    client,
    assert,
  }) => {
    const created = await client
      .post(base())
      .field('insuranceCoverageTypeId', String(coverageId))
      .field('folio', folio())
      .field('startDate', '2027-03-01')
      .field('days', '3')
      .file('document', PDF, { filename: 'certificado.pdf', contentType: 'application/pdf' })
      .loginAs(actor!.user)
      .headers(headers())
    assert.equal(created.status(), 201, JSON.stringify(created.body()))
    const { workDisabilityId, workDisabilityPeriodId } = created.body().data.workDisability

    const extended = await client
      .post(`${base()}/${workDisabilityId}/extensions`)
      .field('workDisabilityTypeId', String(subsequentTypeId))
      .field('folio', folio())
      .field('startDate', '2027-03-04')
      .field('days', '4')
      .file('document', PDF, { filename: 'ampliacion.pdf', contentType: 'application/pdf' })
      .loginAs(actor!.user)
      .headers(headers())
    assert.equal(extended.status(), 201, JSON.stringify(extended.body()))

    const outOfRange = await client
      .post(`${base()}/${workDisabilityId}/early-return`)
      .json({ returnDate: '2027-03-01' })
      .loginAs(actor!.user)
      .headers(headers())
    outOfRange.assertStatus(422)
    assert.equal(outOfRange.body().code, WORK_DISABILITY_ERROR_CODES.RETURN_OUT_OF_RANGE)

    const back = await client
      .post(`${base()}/${workDisabilityId}/early-return`)
      .json({ returnDate: '2027-03-03' })
      .loginAs(actor!.user)
      .headers(headers())
    assert.equal(back.status(), 200, JSON.stringify(back.body()))
    assert.deepEqual(back.body().data.earlyReturn, { lastCoveredDay: '2027-03-02', removedDays: 5 })

    const feed = await client.get(base()).loginAs(actor!.user).headers(headers())
    const disability = (feed.body().data.workDisabilities as Array<Record<string, any>>).find(
      (row) => row.workDisabilityId === workDisabilityId
    )!
    assert.lengthOf(disability.periods, 1, 'la ampliación que empezaba después del regreso se retira')
    assert.equal(disability.endDate, '2027-03-02')
    assert.equal(disability.totalDays, 2)

    const exceptionType = await db.from('exception_types').where('exception_type_slug', 'falta-por-incapacidad').first()
    if (exceptionType) {
      const remaining = await db
        .from('shift_exceptions')
        .where('work_disability_period_id', workDisabilityPeriodId)
        .whereNull('shift_exceptions_deleted_at')
      assert.lengthOf(remaining, 2, 'solo quedan las excepciones de los días amparados')
    }
  })

  test('otro colaborador fuera de la empresa responde 404', async ({ client }) => {
    const response = await client
      .get('/api/v1/employees/999999999/work-disabilities')
      .loginAs(actor!.user)
      .headers(headers())
    response.assertStatus(404)
  })
})
