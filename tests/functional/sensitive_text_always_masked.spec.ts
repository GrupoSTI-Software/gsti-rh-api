import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import SystemModule from '#models/system_module'
import { SENSITIVE_MASK } from '#helpers/sensitive_mask'
import { maskSensitiveDtoValue, sensitiveSerialize } from '#helpers/sensitive_serialize'
import {
  buHeader,
  cleanupActor,
  cleanupRemainingSensitiveFixture,
  cleanupSensitiveFixture,
  cleanupSystemActor,
  createActor,
  createRemainingSensitiveFixture,
  createSensitiveFixture,
  createSystemActor,
  employeeBankBody,
  employeePerson,
  empresaRfcFromShow,
  expectElevenMasked,
  expectMaskedHealth,
  expectNeverDenied,
  grantModuleAction,
  grantOnly,
  medicalConditionBody,
  restoreEmployeesGrants,
  snapshotAndClearEmployeesGrants,
  workDisabilityNoteBody,
  type RemainingSensitiveFixture,
  type SensitiveFixture,
  type TenantActor,
} from './employees/sensitive_read_by_category_support.js'
import {
  buHeader as repseBuHeader,
  cleanupRepseSensitiveMaskActors,
  cleanupRepseSensitiveMaskFixture,
  contratanteFromContrato,
  CONTRATOS_BASE,
  createRepseSensitiveMaskActors,
  createRepseSensitiveMaskFixture,
  contratoFromBody,
  empleadoFromAsignacion,
  type RepseSensitiveMaskActors,
  type RepseSensitiveMaskFixture,
} from './repse/repse_contratos_asignaciones_sensitive_mask_support.js'
import {
  buHeader as piiBuHeader,
  cleanupRevealLogs,
  countRevealLogs,
  grantAcrossModules,
  type TenantActor as PiiTenantActor,
} from './pii/pii_permission_gate_support.js'

const FIVE_READS = [
  'sensitive-identificacion-read',
  'sensitive-contacto-read',
  'sensitive-financiero-read',
  'sensitive-salud-read',
  'sensitive-biometrico-read',
] as const

async function getThreeSurfaces(
  client: ApiClient,
  actor: TenantActor,
  fixture: SensitiveFixture
) {
  const header = buHeader(actor)
  const employeeRes = await client
    .get(`/api/employees/${fixture.employee.employeeId}`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', header)
  const bankRes = await client
    .get(`/api/employee-banks/${fixture.bank.employeeBankId}`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', header)
  const medicalRes = await client
    .get(`/api/employee-medical-conditions/${fixture.medical.employeeMedicalConditionId}`)
    .loginAs(actor.user)
    .header('X-Business-Unit-Id', header)
  return { employeeRes, bankRes, medicalRes }
}

test.group('Texto sensible siempre tapado — USRH1789328027048', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor
  let fixture: SensitiveFixture
  let extra: RemainingSensitiveFixture

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()

    actor = await createActor('text-always-masked')
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'text-always-masked')
    extra = await createRemainingSensitiveFixture(actor, fixture)
  })

  group.teardown(async () => {
    await cleanupRemainingSensitiveFixture(extra)
    await cleanupSensitiveFixture(fixture)
    await cleanupActor(actor)
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
  })

  test('CA-1: las cinco lecturas, owner y root reciben las 11 tapadas en GET', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor.role.roleId, [...FIVE_READS])
    const granted = await getThreeSurfaces(client, actor, fixture)
    expectNeverDenied(granted.employeeRes, assert)
    expectElevenMasked(
      employeePerson(granted.employeeRes.body()),
      employeeBankBody(granted.bankRes.body()),
      medicalConditionBody(granted.medicalRes.body()),
      fixture.clear,
      assert
    )

    for (const roleSlug of ['owner', 'root'] as const) {
      const privileged = await createSystemActor(
        roleSlug,
        `text-always-${roleSlug}`,
        actor.businessUnit.businessUnitId
      )
      const snapshot = await snapshotAndClearEmployeesGrants(privileged.roleId)
      try {
        const { employeeRes, bankRes, medicalRes } = await getThreeSurfaces(
          client,
          { ...actor, user: privileged.user },
          fixture
        )
        expectNeverDenied(employeeRes, assert)
        expectElevenMasked(
          employeePerson(employeeRes.body()),
          employeeBankBody(bankRes.body()),
          medicalConditionBody(medicalRes.body()),
          fixture.clear,
          assert
        )
      } finally {
        await restoreEmployeesGrants(snapshot)
        await cleanupSystemActor(privileged)
      }
    }
  })

  test('CA-2: salud con categoría concedida sigue tapada en GET', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['sensitive-salud-read', 'read'])
    await grantModuleAction(actor.role.roleId, 'traumatic-event-reports', 'read')

    const noteRes = await client
      .get(`/api/work-disability-notes/${extra.note.workDisabilityNoteId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
    expectMaskedHealth(workDisabilityNoteBody(noteRes.body()).workDisabilityNoteDescription, assert)

    const traumaRes = await client
      .get(`/api/traumatic-event-reports/${extra.trauma.traumaticEventReportId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
    expectNeverDenied(traumaRes, assert)
    const trauma = traumaRes.body()?.data?.traumaticEventReport as Record<string, unknown>
    expectMaskedHealth(trauma.traumaticEventReportInvolvedPeople, assert)
    expectMaskedHealth(trauma.traumaticEventReportDescription, assert)

    const lactationRes = await client
      .get('/api/employee-lactation-periods')
      .qs({ employeeId: fixture.employee.employeeId, page: 1, limit: 10 })
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
    expectNeverDenied(lactationRes, assert)
    const lactationRows =
      (lactationRes.body()?.data?.employeeLactationPeriods?.data as Record<string, unknown>[]) ??
      []
    const lactationRow = lactationRows.find(
      (row) => row.employeeLactationPeriodId === extra.lactation.employeeLactationPeriodId
    )
    assert.exists(lactationRow)
    expectMaskedHealth(lactationRow!.employeeLactationPeriodNotes, assert)
  })

  test('CA-2: RFC de empresa contratante sigue tapado con identificación en GET', async ({
    client,
    assert,
  }) => {
    await grantOnly(actor.role.roleId, ['sensitive-identificacion-read'])
    await grantModuleAction(actor.role.roleId, 'repse-registrations', 'read')

    const empresaRes = await client
      .get(`/api/empresas-contratantes/${extra.empresa.empresaContratanteId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
    expectNeverDenied(empresaRes, assert)
    assert.equal(empresaRfcFromShow(empresaRes.body()), SENSITIVE_MASK)
  })

  test('CA-3: null y vacío no se enmascaran en serialización ni DTO', ({ assert }) => {
    const serializeCurp = sensitiveSerialize('Person', 'personCurp')
    assert.isNull(serializeCurp(null))
    assert.equal(serializeCurp(''), '')
    assert.equal(serializeCurp('   '), '   ')
    assert.equal(
      maskSensitiveDtoValue('EmployeeMedicalCondition', 'employeeMedicalConditionDiagnosis', ''),
      ''
    )
    assert.isNull(
      maskSensitiveDtoValue('EmployeeMedicalCondition', 'employeeMedicalConditionDiagnosis', null)
    )
  })

  test('CA-4: revelado sin salud responde 403 sin asiento', async ({ client, assert }) => {
    await grantAcrossModules(actor.role.roleId, [
      { module: 'employees', slugs: ['sensitive-identificacion-read'] },
    ])
    const recordId = extra.note.workDisabilityNoteId
    const before = await countRevealLogs(
      'WorkDisabilityNote',
      'workDisabilityNoteDescription',
      recordId
    )

    const response = await client
      .get(`/api/v1/pii/reveal/WorkDisabilityNote/workDisabilityNoteDescription/${recordId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', piiBuHeader(actor as PiiTenantActor))

    response.assertStatus(403)
    assert.equal(response.body().code, 'EMP.SENS.READ.FORBIDDEN')
    assert.equal(
      await countRevealLogs('WorkDisabilityNote', 'workDisabilityNoteDescription', recordId),
      before
    )
  })

  test('CA-5: owner sin slugs revela CURP y deja asiento en bitácora', async ({ client, assert }) => {
    const owner = await createSystemActor(
      'owner',
      'text-always-owner-reveal',
      actor.businessUnit.businessUnitId
    )
    const snapshot = await snapshotAndClearEmployeesGrants(owner.roleId)
    const recordId = fixture.person.personId
    try {
      const before = await countRevealLogs('Person', 'personCurp', recordId)
      const response = await client
        .get(`/api/v1/pii/reveal/Person/personCurp/${recordId}`)
        .loginAs(owner.user)
        .header('X-Business-Unit-Id', piiBuHeader(actor as PiiTenantActor))

      response.assertStatus(200)
      assert.equal(response.body().data.personCurp, fixture.clear.curp)
      assert.equal(await countRevealLogs('Person', 'personCurp', recordId), before + 1)
    } finally {
      await cleanupRevealLogs({ userId: owner.user.userId })
      await restoreEmployeesGrants(snapshot)
      await cleanupSystemActor(owner)
    }
  })
})

test.group('Texto sensible siempre tapado — REPSE contratos USRH1789328027048', (group) => {
  let repseActors: RepseSensitiveMaskActors
  let repseFixture: RepseSensitiveMaskFixture

  group.setup(async () => {
    repseActors = await createRepseSensitiveMaskActors('text-always-repse')
    repseFixture = await createRepseSensitiveMaskFixture(repseActors.sin.businessUnit, 'text-always-repse')
  })

  group.teardown(async () => {
    await cleanupRepseSensitiveMaskFixture(repseFixture)
    await cleanupRepseSensitiveMaskActors(repseActors)
  })

  test('CA-2: contrato REPSE con identificación sigue tapado en GET', async ({ client, assert }) => {
    const showResponse = await client
      .get(`${CONTRATOS_BASE}/${repseFixture.contratoId}`)
      .loginAs(repseActors.con.user)
      .header('X-Business-Unit-Id', repseBuHeader(repseActors.con))

    showResponse.assertStatus(200)
    assert.equal(contratanteFromContrato(contratoFromBody(showResponse.body())).rfc, SENSITIVE_MASK)
  })

  test('CA-2: asignación REPSE con identificación sigue tapada tras alta', async ({
    client,
    assert,
  }) => {
    const assignResponse = await client
      .post(`${CONTRATOS_BASE}/${repseFixture.contratoId}/asignaciones`)
      .loginAs(repseActors.con.user)
      .header('X-Business-Unit-Id', repseBuHeader(repseActors.con))
      .json({
        asignaciones: [
          {
            employeeId: repseFixture.employeeConNss.employee.employeeId,
            fechaInicio: '2026-04-01',
            porcentajeTiempo: 40,
          },
        ],
      })

    assignResponse.assertStatus(201)
    const created = (assignResponse.body().data.asignaciones as unknown[])[0] as Record<
      string,
      unknown
    >
    assert.equal(empleadoFromAsignacion(created).nss, SENSITIVE_MASK)
  })
})
