import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import PiiAccessLog from '#models/pii_access_log'
import PiiAccessLogService from '#services/pii_access_log_service'
import {
  createActor,
  cleanupActor,
  createSensitiveFixture,
  cleanupSensitiveFixture,
  createRemainingSensitiveFixture,
  cleanupRemainingSensitiveFixture,
  buHeader,
  CLEAR_FIXED,
  CLEAR_REMAINING,
  createSystemActor,
  cleanupSystemActor,
  grantAcrossModules,
  countRevealLogs,
  countRevealLogSubjects,
  lastRevealLog,
  cleanupRevealLogs,
  type TenantActor,
  type SensitiveFixture,
  type RemainingSensitiveFixture,
} from './pii_permission_gate_support.js'

test.group('Revelado ampliado del expediente (USRH1788478865946)', (group) => {
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null
  let extra: RemainingSensitiveFixture | null = null

  group.each.setup(async () => {
    actor = await createActor('pii-reveal-expanded')
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'pii-reveal-expanded')
    extra = await createRemainingSensitiveFixture(actor, fixture)
  })

  group.each.teardown(async () => {
    if (actor) {
      await cleanupRevealLogs({ userId: actor.user.userId })
      await cleanupRevealLogs({ businessUnitId: actor.businessUnit.businessUnitId })
    }
    await cleanupRemainingSensitiveFixture(extra)
    await cleanupSensitiveFixture(fixture)
    await cleanupActor(actor)
    extra = null
    fixture = null
    actor = null
  })

  test('CA-1 — revelado de evento traumático escribe titular y pantalla de origen', async ({ client, assert }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-salud-read'] },
    ])
    const recordId = extra!.trauma.traumaticEventReportId
    const employeeId = fixture!.employee.employeeId
    const before = await countRevealLogs(
      'TraumaticEventReport',
      'traumaticEventReportDescription',
      recordId
    )

    const response = await client
      .get(
        `/api/v1/pii/reveal/TraumaticEventReport/traumaticEventReportDescription/${recordId}`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .header('X-Origin-Module', 'compliance')

    response.assertStatus(200)
    assert.equal(response.body().data.traumaticEventReportDescription, CLEAR_REMAINING.traumaDescription)

    const after = await countRevealLogs(
      'TraumaticEventReport',
      'traumaticEventReportDescription',
      recordId
    )
    assert.equal(after, before + 1)

    const log = await lastRevealLog(
      'TraumaticEventReport',
      'traumaticEventReportDescription',
      recordId
    )
    assert.isNotNull(log)
    assert.equal(log!.originModule, 'compliance')
    assert.equal(await countRevealLogSubjects(log!.piiAccessLogId), 1)

    const subjectRow = await db
      .from('pii_access_log_subjects')
      .where('pii_access_log_id', log!.piiAccessLogId)
      .first()
    assert.equal(Number(subjectRow!.employee_id), employeeId)
  })

  test('CA-3 — nota de incapacidad con titular; padre borrado responde 404 sin asiento', async ({
    client,
    assert,
  }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-salud-read'] },
    ])
    const recordId = extra!.note.workDisabilityNoteId
    const employeeId = fixture!.employee.employeeId

    const okResponse = await client
      .get(`/api/v1/pii/reveal/WorkDisabilityNote/workDisabilityNoteDescription/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    okResponse.assertStatus(200)

    const log = await lastRevealLog('WorkDisabilityNote', 'workDisabilityNoteDescription', recordId)
    assert.isNotNull(log)
    const subjectRow = await db
      .from('pii_access_log_subjects')
      .where('pii_access_log_id', log!.piiAccessLogId)
      .first()
    assert.equal(Number(subjectRow!.employee_id), employeeId)

    await extra!.disability.merge({ deletedAt: DateTime.now() }).save()
    const beforeOrphan = await countRevealLogs(
      'WorkDisabilityNote',
      'workDisabilityNoteDescription',
      recordId
    )

    const orphanResponse = await client
      .get(`/api/v1/pii/reveal/WorkDisabilityNote/workDisabilityNoteDescription/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    orphanResponse.assertStatus(404)

    const afterOrphan = await countRevealLogs(
      'WorkDisabilityNote',
      'workDisabilityNoteDescription',
      recordId
    )
    assert.equal(afterOrphan, beforeOrphan)
  })

  test('CA-4 — RFC de empresa contratante revela sin titular y no aparece al filtrar por trabajador', async ({
    client,
    assert,
  }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-identificacion-read'] },
      { module: 'sensitive-data-access-log', slugs: ['read'] },
    ])
    const recordId = extra!.empresa.empresaContratanteId
    const employeeId = fixture!.employee.employeeId
    const before = await countRevealLogs('EmpresaContratante', 'rfc', recordId)

    const response = await client
      .get(`/api/v1/pii/reveal/EmpresaContratante/rfc/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .header('X-Origin-Module', 'repse')
    response.assertStatus(200)
    assert.equal(response.body().data.rfc, CLEAR_REMAINING.empresaRfc)

    const after = await countRevealLogs('EmpresaContratante', 'rfc', recordId)
    assert.equal(after, before + 1)

    const log = await lastRevealLog('EmpresaContratante', 'rfc', recordId)
    assert.isNotNull(log)
    assert.equal(await countRevealLogSubjects(log!.piiAccessLogId), 0)

    const listResponse = await client
      .get('/api/v1/pii/access-logs')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    listResponse.assertStatus(200)
    const listRows = listResponse.body().data.data as Array<{
      field?: { model?: string; column?: string }
      subject?: unknown
    }>
    const empresaRow = listRows.find(
      (row) => row.field?.model === 'EmpresaContratante' && row.field?.column === 'rfc'
    )
    assert.isDefined(empresaRow)
    assert.notProperty(empresaRow!, 'subject')

    const filteredResponse = await client
      .get(`/api/v1/pii/access-logs?employeeId=${employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    filteredResponse.assertStatus(200)
    const filteredRows = filteredResponse.body().data.data as Array<{
      field?: { model?: string }
    }>
    const filteredEmpresa = filteredRows.some((row) => row.field?.model === 'EmpresaContratante')
    assert.isFalse(filteredEmpresa)
  })

  test('CA-5 — registro de otra empresa, borrado o inexistente responde 404 sin asiento', async ({
    client,
    assert,
  }) => {
    const otherActor = await createActor('pii-reveal-expanded-other')
    const otherFixture = await createSensitiveFixture(
      otherActor.businessUnit.businessUnitId,
      'pii-reveal-expanded-other'
    )
    const otherExtra = await createRemainingSensitiveFixture(otherActor, otherFixture)
    try {
      await grantAcrossModules(actor!.role.roleId, [
        { module: 'employees', slugs: ['sensitive-salud-read', 'sensitive-contacto-read'] },
      ])

      const crossTenantId = otherExtra.lactation.employeeLactationPeriodId
      const beforeCross = await countRevealLogs(
        'EmployeeLactationPeriod',
        'employeeLactationPeriodNotes',
        crossTenantId
      )
      const crossResponse = await client
        .get(
          `/api/v1/pii/reveal/EmployeeLactationPeriod/employeeLactationPeriodNotes/${crossTenantId}`
        )
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      crossResponse.assertStatus(404)
      assert.equal(
        await countRevealLogs(
          'EmployeeLactationPeriod',
          'employeeLactationPeriodNotes',
          crossTenantId
        ),
        beforeCross
      )

      const spouseId = extra!.spouse.employeeSpouseId
      await extra!.spouse.merge({ deletedAt: DateTime.now() }).save()
      const beforeDeleted = await countRevealLogs('EmployeeSpouse', 'employeeSpousePhone', spouseId)
      const deletedResponse = await client
        .get(`/api/v1/pii/reveal/EmployeeSpouse/employeeSpousePhone/${spouseId}`)
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      deletedResponse.assertStatus(404)
      assert.equal(
        await countRevealLogs('EmployeeSpouse', 'employeeSpousePhone', spouseId),
        beforeDeleted
      )

      const missingId = 9_999_999
      const beforeMissing = await countRevealLogs(
        'EmployeeEmergencyContact',
        'employeeEmergencyContactPhone',
        missingId
      )
      const missingResponse = await client
        .get(
          `/api/v1/pii/reveal/EmployeeEmergencyContact/employeeEmergencyContactPhone/${missingId}`
        )
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      missingResponse.assertStatus(404)
      assert.equal(
        await countRevealLogs(
          'EmployeeEmergencyContact',
          'employeeEmergencyContactPhone',
          missingId
        ),
        beforeMissing
      )
    } finally {
      await cleanupRemainingSensitiveFixture(otherExtra)
      await cleanupSensitiveFixture(otherFixture)
      await cleanupActor(otherActor)
    }
  })

  test('CA-6 — sin permiso de contacto responde 403 sin asiento ni filtraciones', async ({
    client,
    assert,
  }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-identificacion-read'] },
    ])
    const recordId = extra!.spouse.employeeSpouseId
    const before = await countRevealLogs('EmployeeSpouse', 'employeeSpousePhone', recordId)

    const existingResponse = await client
      .get(`/api/v1/pii/reveal/EmployeeSpouse/employeeSpousePhone/${recordId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    existingResponse.assertStatus(403)
    const existingBody = existingResponse.body()
    assert.equal(existingBody.code, 'EMP.SENS.READ.FORBIDDEN')
    assert.equal(existingBody.key, 'sin-permiso-para-revelar-datos-sensibles')
    assert.include(existingBody.detail, 'datos de contacto')
    assert.notInclude(JSON.stringify(existingBody), CLEAR_FIXED.phoneSecondary)

    const missingResponse = await client
      .get('/api/v1/pii/reveal/EmployeeSpouse/employeeSpousePhone/9999999')
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    missingResponse.assertStatus(403)
    assert.equal(missingResponse.body().code, 'EMP.SENS.READ.FORBIDDEN')

    assert.equal(await countRevealLogs('EmployeeSpouse', 'employeeSpousePhone', recordId), before)
  })

  test('CA-7 — owner y root revelan lactancia sin slugs de categoría y escriben titular', async ({
    client,
    assert,
  }) => {
    const recordId = extra!.lactation.employeeLactationPeriodId
    const employeeId = fixture!.employee.employeeId

    for (const roleSlug of ['owner', 'root'] as const) {
      const bypassActor = await createSystemActor(
        roleSlug,
        `pii-reveal-expanded-${roleSlug}`,
        actor!.businessUnit.businessUnitId
      )
      try {
        const before = await countRevealLogs(
          'EmployeeLactationPeriod',
          'employeeLactationPeriodNotes',
          recordId
        )
        const response = await client
          .get(
            `/api/v1/pii/reveal/EmployeeLactationPeriod/employeeLactationPeriodNotes/${recordId}`
          )
          .loginAs(bypassActor.user)
          .header('X-Business-Unit-Id', buHeader(actor!))
        response.assertStatus(200)
        assert.equal(response.body().data.employeeLactationPeriodNotes, CLEAR_REMAINING.lactationNotes)
        assert.equal(
          await countRevealLogs(
            'EmployeeLactationPeriod',
            'employeeLactationPeriodNotes',
            recordId
          ),
          before + 1
        )

        const log = await lastRevealLog(
          'EmployeeLactationPeriod',
          'employeeLactationPeriodNotes',
          recordId
        )
        assert.isNotNull(log)
        const subjectRow = await db
          .from('pii_access_log_subjects')
          .where('pii_access_log_id', log!.piiAccessLogId)
          .first()
        assert.equal(Number(subjectRow!.employee_id), employeeId)
      } finally {
        await cleanupRevealLogs({ userId: bypassActor.user.userId })
        await cleanupSystemActor(bypassActor)
      }
    }
  })

  test('CA-8 — pantalla de origen inválida o ausente se guarda como null sin bloquear', async ({
    client,
    assert,
  }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-contacto-read'] },
    ])
    const recordId = extra!.emergency.employeeEmergencyContactId
    const invalidHeaders = [undefined, '', '<script>', 'x'.repeat(101)] as const

    for (const originHeader of invalidHeaders) {
      const before = await countRevealLogs(
        'EmployeeEmergencyContact',
        'employeeEmergencyContactPhone',
        recordId
      )
      const request = client
        .get(
          `/api/v1/pii/reveal/EmployeeEmergencyContact/employeeEmergencyContactPhone/${recordId}`
        )
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      if (originHeader !== undefined) {
        request.header('X-Origin-Module', originHeader)
      }
      const response = await request
      response.assertStatus(200)
      assert.equal(
        await countRevealLogs(
          'EmployeeEmergencyContact',
          'employeeEmergencyContactPhone',
          recordId
        ),
        before + 1
      )
      const log = await lastRevealLog(
        'EmployeeEmergencyContact',
        'employeeEmergencyContactPhone',
        recordId
      )
      assert.isNull(log!.originModule)
    }
  })

  test('CA-9 — falla al escribir asiento responde 500 sin entregar el claro', async ({
    client,
    assert,
  }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-contacto-read'] },
    ])
    const recordId = extra!.emergency.employeeEmergencyContactId
    const beforeLogs = await countRevealLogs(
      'EmployeeEmergencyContact',
      'employeeEmergencyContactPhone',
      recordId
    )
    const originalRecord = PiiAccessLogService.prototype.record
    PiiAccessLogService.prototype.record = async () => {
      throw new Error('fallo simulado de auditoría')
    }
    try {
      const response = await client
        .get(
          `/api/v1/pii/reveal/EmployeeEmergencyContact/employeeEmergencyContactPhone/${recordId}`
        )
        .setup((request) => {
          request.request.ok(() => true)
        })
        .loginAs(actor!.user)
        .header('X-Business-Unit-Id', buHeader(actor!))
      response.assertStatus(500)
      assert.notInclude(JSON.stringify(response.body()), CLEAR_FIXED.phone)
      assert.equal(
        await countRevealLogs(
          'EmployeeEmergencyContact',
          'employeeEmergencyContactPhone',
          recordId
        ),
        beforeLogs
      )
    } finally {
      PiiAccessLogService.prototype.record = originalRecord
    }
  })

  test('CA-10 — filtro por trabajador incluye revelados nuevos e históricos sin fila de titular', async ({
    client,
    assert,
  }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-contacto-read', 'sensitive-identificacion-read'] },
      { module: 'sensitive-data-access-log', slugs: ['read'] },
    ])
    const employeeId = fixture!.employee.employeeId

    const historicalLog = await PiiAccessLog.create({
      businessUnitId: actor!.businessUnit.businessUnitId,
      accessorUserId: actor!.user.userId,
      piiAccessLogModel: 'Person',
      piiAccessLogModelColumn: 'personCurp',
      piiAccessLogRecordId: fixture!.person.personId,
      piiAccessLogAccessorIp: '127.0.0.1',
      piiAccessLogAccessorUserAgent: 'qa-historical',
      piiAccessLogRequestId: null,
      piiAccessLogOriginModule: null,
    })

    const spouseId = extra!.spouse.employeeSpouseId
    await client
      .get(`/api/v1/pii/reveal/EmployeeSpouse/employeeSpousePhone/${spouseId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .header('X-Origin-Module', 'employees')

    await client
      .get(`/api/v1/pii/reveal/Person/personCurp/${fixture!.person.personId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
      .header('X-Origin-Module', 'employees')

    const listResponse = await client
      .get(`/api/v1/pii/access-logs?employeeId=${employeeId}`)
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    listResponse.assertStatus(200)

    const rows = listResponse.body().data.data as Array<{
      piiAccessLogId: number
      field?: { model?: string; column?: string }
      subject?: { employeeId: number }
      originModule?: string | null
    }>
    const spouseRow = rows.find((row) => row.field?.model === 'EmployeeSpouse')
    const personRows = rows.filter((row) => row.field?.model === 'Person')
    const historicalRow = personRows.find(
      (row) => row.piiAccessLogId === historicalLog.piiAccessLogId
    )
    const freshPersonRow = personRows.find(
      (row) => row.piiAccessLogId !== historicalLog.piiAccessLogId
    )

    assert.isDefined(spouseRow)
    assert.equal(spouseRow!.subject!.employeeId, employeeId)
    assert.equal(spouseRow!.originModule, 'employees')
    assert.isDefined(historicalRow)
    assert.equal(historicalRow!.subject!.employeeId, employeeId)
    assert.isDefined(freshPersonRow)
    assert.equal(freshPersonRow!.subject!.employeeId, employeeId)
    assert.equal(freshPersonRow!.originModule, 'employees')
  })

  test('CA-11 — biométrico responde 422 NOT_REVEALABLE con el detalle corregido', async ({
    client,
    assert,
  }) => {
    await grantAcrossModules(actor!.role.roleId, [
      { module: 'employees', slugs: ['sensitive-biometrico-read'] },
    ])
    const recordId = extra!.faceId.employeeBiometricFaceIdId
    const before = await countRevealLogs(
      'EmployeeBiometricFaceId',
      'employeeBiometricFaceIdPhotoUrl',
      recordId
    )

    const response = await client
      .get(
        `/api/v1/pii/reveal/EmployeeBiometricFaceId/employeeBiometricFaceIdPhotoUrl/${recordId}`
      )
      .loginAs(actor!.user)
      .header('X-Business-Unit-Id', buHeader(actor!))
    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.code, 'EMP.SENS.READ.NOT_REVEALABLE')
    assert.equal(body.key, 'el-dato-no-se-puede-revelar-por-esta-via')
    assert.equal(
      body.detail,
      'Este dato sensible no está disponible en el revelado individual.'
    )
    assert.equal(
      await countRevealLogs(
        'EmployeeBiometricFaceId',
        'employeeBiometricFaceIdPhotoUrl',
        recordId
      ),
      before
    )
  })
})
