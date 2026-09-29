import { test } from '@japa/runner'
import type { Assert } from '@japa/assert'
import type { ApiClient, ApiResponse } from '@japa/api-client'
import db from '@adonisjs/lucid/services/db'
import CareerPathCandidate from '#models/career_path_candidate'
import Person from '#models/person'
import { opaqueEmployeeSlug } from '#tests/helpers/employee_fixture'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'
import {
  assertModuleEnforced,
  businessUnitHeaders,
  cleanupTenantActor,
  createBypassActor,
  createTenantActor,
  grantModulePermissions,
  required,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Bandeja de rutas de carrera con la exigencia encendida: listar y ver el
 * detalle piden `hr-career-path:read`; cambiar estatus (aprobar, rechazar,
 * desactivar) pide `hr-career-path:update`. Antes las tres rutas colgaban de la
 * pestaña Ruta de carrera de Empleados: quien proponía desde el expediente
 * también aprobaba por API. El caso de los permisos de la pestaña cuida que no
 * vuelvan a abrir la bandeja.
 *
 * El cambio de estatus se prueba con `desactivado`: no envía correo al
 * proponente ni mueve el puesto del empleado, así el caso solo mide el gate.
 */

const MODULE = 'hr-career-path'

type HttpMethod = 'get' | 'put'

interface GateRequest {
  method: HttpMethod
  url: string
  body?: Record<string, unknown>
}

interface InboxFixture {
  actor: TenantActor
  person: Person
  departmentId: number
  positionIds: number[]
  employeeId: number
}

const uniqueStamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

async function createInboxFixture(actor: TenantActor): Promise<InboxFixture> {
  const businessUnitId = actor.businessUnit.businessUnitId
  const stamp = uniqueStamp()
  const now = new Date()
  const person = await Person.create({
    personFirstname: 'Candidato',
    personLastname: 'Bandeja',
    personSecondLastname: 'Gate',
    personEmail: `bandeja-ruta-${stamp}@gsti-tests.local`,
  })
  const [departmentId] = await db.table('departments').insert({
    department_sync_id: stamp,
    department_code: `DEP-${stamp}`,
    department_name: `Departamento bandeja ${stamp}`,
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    department_active: 1,
    department_created_at: now,
  })
  const positionIds: number[] = []
  for (const suffix of ['origen', 'destino']) {
    const [positionId] = await db.table('positions').insert({
      position_sync_id: `${stamp}-${suffix}`,
      position_code: `POS-${stamp}-${suffix}`,
      position_name: `Puesto ${suffix}`,
      company_id: businessUnitId,
      business_unit_id: businessUnitId,
      position_active: 1,
      position_created_at: now,
    })
    positionIds.push(Number(positionId))
  }
  const [employeeId] = await db.table('employees').insert({
    employee_slug: opaqueEmployeeSlug(),
    employee_sync_id: `EMP-${stamp}`,
    employee_code: `EMP-${stamp}`,
    employee_first_name: 'Candidato',
    employee_last_name: 'Bandeja',
    employee_second_last_name: 'Gate',
    company_id: businessUnitId,
    business_unit_id: businessUnitId,
    payroll_business_unit_id: businessUnitId,
    department_id: Number(departmentId),
    position_id: positionIds[0],
    person_id: person.personId,
    employee_type_id: 1,
    employee_work_schedule: 'Onsite',
    employee_business_email: `bandeja-ruta-work-${stamp}@gsti-tests.local`,
    employee_created_at: now,
  })

  return {
    actor,
    person,
    departmentId: Number(departmentId),
    positionIds,
    employeeId: Number(employeeId),
  }
}

/** Candidato propuesto por el propio actor, como lo deja la pestaña del expediente. */
async function createCandidateFixture(fixture: InboxFixture): Promise<CareerPathCandidate> {
  return CareerPathCandidate.create({
    businessUnitId: fixture.actor.businessUnit.businessUnitId,
    employeeId: fixture.employeeId,
    originPositionId: fixture.positionIds[0],
    targetPositionId: fixture.positionIds[1],
    careerPathCandidateIsOverride: false,
    careerPathOverrideReasonId: null,
    careerPathCandidateJustification: 'Fixture bandeja gate',
    careerPathCandidateStatus: 'propuesto',
    proposedBy: fixture.actor.user.userId,
    reviewedBy: null,
    careerPathCandidateRejectionReason: '',
  })
}

/** Historial, candidatos, empleado y catálogos referencian al usuario y a la empresa: van antes que el actor. */
async function cleanupInboxFixture(fixture: InboxFixture | null): Promise<void> {
  if (!fixture) return
  const candidates: { career_path_candidate_id: number }[] = await db
    .from('career_path_candidates')
    .where('employee_id', fixture.employeeId)
    .select('career_path_candidate_id')
  const candidateIds = candidates.map((candidate) => candidate.career_path_candidate_id)
  if (candidateIds.length > 0) {
    await db
      .from('career_path_candidate_status_histories')
      .whereIn('career_path_candidate_id', candidateIds)
      .delete()
    await db.from('career_path_candidates').whereIn('career_path_candidate_id', candidateIds).delete()
  }
  await db.from('employees').where('employee_id', fixture.employeeId).delete()
  await db.from('positions').whereIn('position_id', fixture.positionIds).delete()
  await db.from('departments').where('department_id', fixture.departmentId).delete()
  await Person.query().where('person_id', fixture.person.personId).delete()
  await cleanupTenantActor(fixture.actor)
}

const indexRequest: GateRequest = { method: 'get', url: '/api/career-path-candidates' }

const showRequest = (candidate: CareerPathCandidate): GateRequest => ({
  method: 'get',
  url: `/api/career-path-candidates/${candidate.careerPathCandidateId}`,
})

const deactivateRequest = (candidate: CareerPathCandidate): GateRequest => ({
  method: 'put',
  url: `/api/career-path-candidates/${candidate.careerPathCandidateId}`,
  body: { careerPathCandidateStatus: 'desactivado' },
})

function send(client: ApiClient, actor: TenantActor, request: GateRequest) {
  const pending = client[request.method](request.url)
    .loginAs(actor.user)
    .headers(businessUnitHeaders(actor))
  return request.body ? pending.json(request.body) : pending
}

/** Negativa del gate con el método y la URL en el mensaje, para ubicar la ruta que falló. */
function assertDeniedFor(assert: Assert, response: ApiResponse, request: GateRequest): void {
  const label = `${request.method.toUpperCase()} ${request.url}`
  assert.equal(response.status(), 403, label)
  assert.equal(response.body()?.key, PERMISSION_GATE_ERROR_CODES.DENIED, label)
}

async function candidateStatus(candidate: CareerPathCandidate): Promise<string | undefined> {
  const row = await db
    .from('career_path_candidates')
    .where('career_path_candidate_id', candidate.careerPathCandidateId)
    .first()
  return row?.career_path_candidate_status
}

test.group('Bandeja de rutas de carrera — permissionGate con exigencia encendida', (group) => {
  let fixture: InboxFixture | null = null

  group.setup(async () => {
    await assertModuleEnforced(MODULE)
  })

  group.each.setup(async () => {
    fixture = await createInboxFixture(await createTenantActor('bandeja-ruta-gate'))
  })

  group.each.teardown(async () => {
    await cleanupInboxFixture(fixture)
    fixture = null
  })

  test('sin concesiones: listar, ver y cambiar estatus responden PERM.DENIED y el estatus no cambia', async ({
    client,
    assert,
  }) => {
    const current = required(fixture, 'el fixture')
    await grantModulePermissions(current.actor, MODULE, [])
    const candidate = await createCandidateFixture(current)

    for (const request of [indexRequest, showRequest(candidate), deactivateRequest(candidate)]) {
      assertDeniedFor(assert, await send(client, current.actor, request), request)
    }
    assert.equal(await candidateStatus(candidate), 'propuesto')
  })

  test('los permisos de la pestaña Ruta de carrera del expediente ya no abren la bandeja', async ({
    client,
    assert,
  }) => {
    const current = required(fixture, 'el fixture')
    await grantModulePermissions(current.actor, 'employees', [
      'tab-ruta-carrera-read',
      'tab-ruta-carrera-write',
      'tab-ruta-carrera-delete',
    ])
    const candidate = await createCandidateFixture(current)

    for (const request of [indexRequest, showRequest(candidate), deactivateRequest(candidate)]) {
      assertDeniedFor(assert, await send(client, current.actor, request), request)
    }
    assert.equal(await candidateStatus(candidate), 'propuesto')
  })

  test('read abre listar y ver el detalle, no cambiar estatus', async ({ client, assert }) => {
    const current = required(fixture, 'el fixture')
    await grantModulePermissions(current.actor, MODULE, ['read'])
    const candidate = await createCandidateFixture(current)

    const listed = await send(client, current.actor, indexRequest)
    assert.equal(listed.status(), 200, JSON.stringify(listed.body()))
    const shown = await send(client, current.actor, showRequest(candidate))
    assert.equal(shown.status(), 200, JSON.stringify(shown.body()))

    const request = deactivateRequest(candidate)
    assertDeniedFor(assert, await send(client, current.actor, request), request)
    assert.equal(await candidateStatus(candidate), 'propuesto')
  })

  test('update abre cambiar estatus y no listar ni ver el detalle', async ({ client, assert }) => {
    const current = required(fixture, 'el fixture')
    await grantModulePermissions(current.actor, MODULE, ['update'])
    const candidate = await createCandidateFixture(current)

    const updated = await send(client, current.actor, deactivateRequest(candidate))
    assert.equal(updated.status(), 200, JSON.stringify(updated.body()))
    assert.equal(await candidateStatus(candidate), 'desactivado')

    for (const request of [indexRequest, showRequest(candidate)]) {
      assertDeniedFor(assert, await send(client, current.actor, request), request)
    }
  })

  test('owner y root listan la bandeja sin concesiones (bypass standard)', async ({
    client,
    assert,
  }) => {
    for (const slug of ['owner', 'root'] as const) {
      const bypass = await createInboxFixture(await createBypassActor(slug, `bandeja-ruta-${slug}`))
      try {
        const response = await send(client, bypass.actor, indexRequest)
        assert.equal(response.status(), 200, `${slug}: ${JSON.stringify(response.body())}`)
      } finally {
        await cleanupInboxFixture(bypass)
      }
    }
  })
})
