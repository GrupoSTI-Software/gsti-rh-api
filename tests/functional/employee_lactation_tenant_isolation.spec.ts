import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import EmployeeLactationPeriod from '#models/employee_lactation_period'
import EmployeeLactationPeriodEvidence from '#models/employee_lactation_period_evidence'
import { TenantContext } from '#utils/tenant_context'

/**
 * USRH1784259058510 — aislamiento del dominio de lactancia (BD real).
 * BU1 (sae) empleado 678 vs BU6 (cima) empleado 12.
 */

const BU1_PUBLIC_ID = 'a76db057-2292-49a0-9f1b-911e328d93b0'
const BU1_EMPLOYEE_ID = 678
const BU6_EMPLOYEE_ID = 12

async function getUserByEmail(email: string): Promise<User> {
  return User.query().whereNull('user_deleted_at').where('user_email', email).firstOrFail()
}

test.group('Lactancia — aislamiento por tenant (BD real)', (group) => {
  let periodBu6Id: number
  let periodBu1Id: number
  let evidenceBu6Id: number

  group.setup(async () => {
    const start = DateTime.now().startOf('day')
    const end = start.plus({ days: 60 })

    const p6 = await TenantContext.run([6], async () => {
      const p = new EmployeeLactationPeriod()
      p.employeeId = BU6_EMPLOYEE_ID
      p.employeeLactationPeriodStartDate = start
      p.employeeLactationPeriodEndDate = end
      p.employeeLactationPeriodType = 'reduced_hour'
      p.employeeLactationPeriodReductionApplication = 'end'
      p.employeeLactationPeriodNotes = null
      p.employeeChildrenId = null
      await p.save()
      return p
    })
    periodBu6Id = p6.employeeLactationPeriodId

    const p1 = await TenantContext.run([1], async () => {
      const p = new EmployeeLactationPeriod()
      p.employeeId = BU1_EMPLOYEE_ID
      p.employeeLactationPeriodStartDate = start
      p.employeeLactationPeriodEndDate = end
      p.employeeLactationPeriodType = 'two_rest_periods'
      p.employeeLactationPeriodReductionApplication = 'start'
      p.employeeLactationPeriodNotes = null
      p.employeeChildrenId = null
      await p.save()
      return p
    })
    periodBu1Id = p1.employeeLactationPeriodId

    const ev = await TenantContext.run([6], async () => {
      const e = new EmployeeLactationPeriodEvidence()
      e.employeeLactationPeriodId = periodBu6Id
      e.employeeLactationPeriodEvidenceFile = 'test/lactation-fixture.pdf'
      e.employeeLactationPeriodEvidenceOriginalName = 'fixture.pdf'
      e.employeeLactationPeriodEvidenceCategory = 'other'
      await e.save()
      return e
    })
    evidenceBu6Id = ev.employeeLactationPeriodEvidenceId
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      if (evidenceBu6Id) {
        await EmployeeLactationPeriodEvidence.query()
          .where('employeeLactationPeriodEvidenceId', evidenceBu6Id)
          .delete()
      }
      if (periodBu6Id) {
        await EmployeeLactationPeriod.query()
          .where('employeeLactationPeriodId', periodBu6Id)
          .delete()
      }
      if (periodBu1Id) {
        await EmployeeLactationPeriod.query()
          .where('employeeLactationPeriodId', periodBu1Id)
          .delete()
      }
    }, 'limpieza test lactancia')
  })

  test('alta de periodo/evidencia hereda business_unit_id del padre', async ({ assert }) => {
    const [p6, p1, ev] = await TenantContext.runUnscoped(async () => {
      return Promise.all([
        EmployeeLactationPeriod.query()
          .where('employeeLactationPeriodId', periodBu6Id)
          .firstOrFail(),
        EmployeeLactationPeriod.query()
          .where('employeeLactationPeriodId', periodBu1Id)
          .firstOrFail(),
        EmployeeLactationPeriodEvidence.query()
          .where('employeeLactationPeriodEvidenceId', evidenceBu6Id)
          .firstOrFail(),
      ])
    }, 'lectura fixtures lactancia')

    assert.equal(p6.businessUnitId, 6)
    assert.equal(p1.businessUnitId, 1)
    assert.equal(ev.businessUnitId, 6)
  })

  test('DELETE de periodo ajeno responde 404 y no lo borra', async ({ client, assert }) => {
    const user = await getUserByEmail('betosimon@sae.com.mx')
    const response = await client
      .delete(`/api/employee-lactation-periods/${periodBu6Id}`)
      .loginAs(user)
      .header('X-Business-Unit-Id', BU1_PUBLIC_ID)

    response.assertStatus(404)

    const stillAlive = await TenantContext.runUnscoped(
      () =>
        EmployeeLactationPeriod.query()
          .where('employeeLactationPeriodId', periodBu6Id)
          .whereNull('employee_lactation_period_deleted_at')
          .first(),
      'verificación post-delete lactancia'
    )
    assert.isNotNull(stillAlive)
  })

  test('mixin filtra periodo y evidencia ajenos por PK con contexto activo', async ({
    assert,
  }) => {
    const foundPeriod = await TenantContext.run([1], () =>
      EmployeeLactationPeriod.query().where('employeeLactationPeriodId', periodBu6Id).first()
    )
    assert.isNull(foundPeriod)

    const foundEvidence = await TenantContext.run([1], () =>
      EmployeeLactationPeriodEvidence.query()
        .where('employeeLactationPeriodEvidenceId', evidenceBu6Id)
        .first()
    )
    assert.isNull(foundEvidence)

    const ownPeriod = await TenantContext.run([6], () =>
      EmployeeLactationPeriod.query().where('employeeLactationPeriodId', periodBu6Id).first()
    )
    assert.isNotNull(ownPeriod)

    const ownEvidence = await TenantContext.run([6], () =>
      EmployeeLactationPeriodEvidence.query()
        .where('employeeLactationPeriodEvidenceId', evidenceBu6Id)
        .first()
    )
    assert.isNotNull(ownEvidence)
  })
})
