import { test } from '@japa/runner'
import type { ApiClient } from '@japa/api-client'
import type { Assert } from '@japa/assert'
import SystemModule from '#models/system_module'
import { maskSensitiveValue, MASK_CHAR } from '#helpers/sensitive_mask'
import {
  TEST_PASSWORD,
  activateUser,
  bearerFromLogin,
  bearerGet,
  buHeader,
  cleanupActor,
  cleanupRemainingSensitiveFixture,
  cleanupSensitiveFixture,
  CLEAR_FIXED,
  CLEAR_REMAINING,
  createActor,
  createRemainingSensitiveFixture,
  createSensitiveFixture,
  emergencyBody,
  empresaRfcFromIndex,
  expectAmountNull,
  expectMaskedHealth,
  expectNeverDenied,
  expectNoClearRemaining,
  firstSalaryDaily,
  grantOnly,
  lactationNotesFromIndex,
  loginWeb,
  medicalConditionBody,
  prepareSensitiveJourney,
  rangeAmounts,
  spouseBody,
  traumaFromIndex,
  traumaFromShow,
  workDisabilityNoteBody,
  type RemainingSensitiveFixture,
  type SensitiveFixture,
  type TenantActor,
} from '../functional/employees/sensitive_read_by_category_support.js'

const FIVE_READS = [
  'sensitive-identificacion-read',
  'sensitive-contacto-read',
  'sensitive-financiero-read',
  'sensitive-salud-read',
  'sensitive-biometrico-read',
] as const

async function sessionToken(
  client: ApiClient,
  actor: TenantActor,
  assert: Assert
) {
  const login = await loginWeb(client, actor.user.userEmail, TEST_PASSWORD)
  expectNeverDenied(login, assert)
  return bearerFromLogin(login.body())
}

test.group('Lectura sensible — 15 columnas restantes — E2E Japa', (group) => {
  let employeesModule: SystemModule
  let actor: TenantActor | null = null
  let fixture: SensitiveFixture | null = null
  let extra: RemainingSensitiveFixture | null = null

  group.setup(async () => {
    employeesModule = await SystemModule.query()
      .whereNull('system_module_deleted_at')
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('sens15-e2e')
    await activateUser(actor.user)
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'e2e15')
    extra = await createRemainingSensitiveFixture(actor, fixture)
  })

  group.teardown(async () => {
    try {
      await cleanupRemainingSensitiveFixture(extra)
      await cleanupSensitiveFixture(fixture)
      await cleanupActor(actor)
    } finally {
      employeesModule.systemModulePermissionEnforcementActive = false
      await employeesModule.save()
    }
  })

  test('humo: login web y GET nota de incapacidad con Bearer responde 200', async ({
    client,
    assert,
  }) => {
    await prepareSensitiveJourney(actor!.role.roleId, ['read'])
    const token = await sessionToken(client, actor!, assert)
    const response = await bearerGet(
      client,
      `/api/work-disability-notes/${extra!.note.workDisabilityNoteId}`,
      token,
      actor!
    )
    expectNeverDenied(response, assert)
    expectMaskedHealth(
      workDisabilityNoteBody(response.body()).workDisabilityNoteDescription,
      assert
    )
  })
})
