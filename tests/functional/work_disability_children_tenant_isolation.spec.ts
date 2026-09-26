import { test } from '@japa/runner'
import { cuid } from '@adonisjs/core/helpers'
import User from '#models/user'
import WorkDisability from '#models/work_disability'
import WorkDisabilityNote from '#models/work_disability_note'
import WorkDisabilityPeriod from '#models/work_disability_period'
import WorkDisabilityPeriodExpense from '#models/work_disability_period_expense'
import InsuranceCoverageType from '#models/insurance_coverage_type'
import WorkDisabilityType from '#models/work_disability_type'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1784259058498 — aislamiento por PK directo de notas, periodos y gastos.
 * BU1 (sae) vs BU6 (cima).
 */

const BU1_PUBLIC_ID = 'a76db057-2292-49a0-9f1b-911e328d93b0'
const BU6_PUBLIC_ID = '8c3617a4-c942-4ba7-aee6-2ac32d4ab5ef'
const BU6_EMPLOYEE_ID = 12

async function getUserByEmail(email: string): Promise<User> {
  return User.query().whereNull('user_deleted_at').where('user_email', email).firstOrFail()
}

test.group('Hijos de incapacidades — aislamiento por tenant (BD real)', (group) => {
  let disabilityId: number
  let noteId: number
  let periodId: number
  let expenseId: number

  group.setup(async () => {
    const coverage = await InsuranceCoverageType.query()
      .whereNull('insurance_coverage_type_deleted_at')
      .firstOrFail()
    const disabilityType = await WorkDisabilityType.query()
      .whereNull('work_disability_type_deleted_at')
      .firstOrFail()

    // Cadena completa en BU6: incapacidad → nota + periodo → gasto.
    const disability = await TenantContext.run([6], async () => {
      const wd = new WorkDisability()
      wd.workDisabilityUuid = `test-wd-child-${cuid()}`
      wd.employeeId = BU6_EMPLOYEE_ID
      wd.insuranceCoverageTypeId = coverage.insuranceCoverageTypeId
      await wd.save()
      return wd
    })
    disabilityId = disability.workDisabilityId

    const authorBu6 = await getUserByEmail('jdsimon@cima-aviacion.com.mx')
    const note = await TenantContext.run([6], async () => {
      const n = new WorkDisabilityNote()
      n.workDisabilityId = disabilityId
      n.workDisabilityNoteDescription = 'nota fixture aislamiento'
      n.userId = authorBu6.userId
      await n.save()
      return n
    })
    noteId = note.workDisabilityNoteId

    const period = await TenantContext.run([6], async () => {
      const p = new WorkDisabilityPeriod()
      p.workDisabilityId = disabilityId
      p.workDisabilityTypeId = disabilityType.workDisabilityTypeId
      p.workDisabilityPeriodStartDate = '2026-01-01'
      p.workDisabilityPeriodEndDate = '2026-01-05'
      p.workDisabilityPeriodTicketFolio = `TEST-${cuid().slice(0, 8)}`
      p.workDisabilityPeriodFile = ''
      await p.save()
      return p
    })
    periodId = period.workDisabilityPeriodId

    const expense = await TenantContext.run([6], async () => {
      const e = new WorkDisabilityPeriodExpense()
      e.workDisabilityPeriodId = periodId
      e.workDisabilityPeriodExpenseAmount = 100
      e.workDisabilityPeriodExpenseFile = ''
      await e.save()
      return e
    })
    expenseId = expense.workDisabilityPeriodExpenseId
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (expenseId) {
        await WorkDisabilityPeriodExpense.query()
          .where('workDisabilityPeriodExpenseId', expenseId)
          .delete()
      }
      if (periodId) {
        await WorkDisabilityPeriod.query().where('workDisabilityPeriodId', periodId).delete()
      }
      if (noteId) {
        await WorkDisabilityNote.query().where('workDisabilityNoteId', noteId).delete()
      }
      if (disabilityId) {
        await WorkDisability.query().where('workDisabilityId', disabilityId).delete()
      }
    }, 'limpieza test hijos incapacidades')
  })

  test('alta hereda business_unit_id del padre inmediato (BU6)', async ({ assert }) => {
    const [note, period, expense] = await TenantContext.runUnscoped(async () => {
      return Promise.all([
        WorkDisabilityNote.query().where('workDisabilityNoteId', noteId).firstOrFail(),
        WorkDisabilityPeriod.query().where('workDisabilityPeriodId', periodId).firstOrFail(),
        WorkDisabilityPeriodExpense.query()
          .where('workDisabilityPeriodExpenseId', expenseId)
          .firstOrFail(),
      ])
    }, 'lectura fixtures')

    assert.equal(note.businessUnitId, 6)
    assert.equal(period.businessUnitId, 6)
    assert.equal(expense.businessUnitId, 6)
  })

  test('usuario BU1 recibe 404 al pedir nota de BU6 por PK', async ({ client }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')
    const response = await client
      .get(`/api/work-disability-notes/${noteId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'recurso-no-encontrado', code: 'WD.NF.001' })
  })

  test('usuario BU1 recibe 404 al pedir periodo de BU6 por PK', async ({ client }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')
    const response = await client
      .get(`/api/work-disability-periods/${periodId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'recurso-no-encontrado', code: 'WD.NF.001' })
  })

  test('usuario BU1 recibe 404 al pedir gasto de BU6 por PK y no lo borra', async ({
    client,
    assert,
  }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')
    const response = await client
      .delete(`/api/work-disability-period-expenses/${expenseId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)
    response.assertBodyContains({ key: 'recurso-no-encontrado', code: 'WD.NF.001' })

    const stillAlive = await TenantContext.runUnscoped(
      () =>
        WorkDisabilityPeriodExpense.query()
          .where('workDisabilityPeriodExpenseId', expenseId)
          .whereNull('work_disability_period_expense_deleted_at')
          .first(),
      'verificación post-delete'
    )
    assert.isNotNull(stillAlive)
  })

  test('usuario BU6 sí puede ver su nota y periodo propios', async ({ client, assert }) => {
    const user = await getUserByEmail('jdsimon@cima-aviacion.com.mx')

    const noteRes = await client
      .get(`/api/work-disability-notes/${noteId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)
    noteRes.assertStatus(200)
    assert.equal(noteRes.body().data.workDisabilityNote.workDisabilityNoteId, noteId)

    const periodRes = await client
      .get(`/api/work-disability-periods/${periodId}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU6_PUBLIC_ID)
    periodRes.assertStatus(200)
    assert.equal(periodRes.body().data.workDisabilityPeriod.workDisabilityPeriodId, periodId)
  })
})
