import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import SystemModule from '#models/system_module'
import { SENSITIVE_MASK, maskSensitiveValue } from '#helpers/sensitive_mask'
import { maskSensitiveDtoValue } from '#helpers/sensitive_serialize'
import EvidenceService from '#modules/consent/evidence/evidence.service'
import {
  buHeader,
  cleanupActor,
  cleanupSensitiveFixture,
  createActor,
  createSensitiveFixture,
  employeePerson,
  expectNeverDenied,
  grantOnly,
  type SensitiveFixture,
  type TenantActor,
} from './employees/sensitive_read_by_category_support.js'
import {
  personUpdateBase,
  reloadPerson,
  RFC_ORIGINAL,
} from './employees/sensitive_write_by_category_support.js'
import {
  assertMaskCorruptionRejected,
  assertMaskEchoAccepted,
  MASK_CORRUPT_B,
  MASK_ECHO_LEGACY_RFC,
  MASK_ECHO_RFC,
} from './employees/sensitive_mask_echo_support.js'

function bankBody(body: Record<string, unknown>) {
  const data = body.data as Record<string, unknown> | undefined
  const bank = data?.employeeBank as Record<string, unknown> | undefined
  if (!bank) throw new Error('employeeBank ausente en la respuesta')
  return bank
}

test.group('Máscara fija sin pistas — USRH1789328027039', (group) => {
  let actor: TenantActor
  let fixture: SensitiveFixture

  group.setup(async () => {
    const employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
    actor = await createActor('mask-fixed-http')
    await grantOnly(actor.role.roleId, [])
    fixture = await createSensitiveFixture(actor.businessUnit.businessUnitId, 'mask-fixed')
  })

  group.teardown(async () => {
    await cleanupSensitiveFixture(fixture)
    await cleanupActor(actor)
    const employeesModule = await SystemModule.query()
      .where('system_module_slug', 'employees')
      .firstOrFail()
    employeesModule.systemModulePermissionEnforcementActive = false
    await employeesModule.save()
  })

  test('CA-1: identificación tapada con máscara fija sin pistas', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employees/${fixture.employee.employeeId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))

    expectNeverDenied(response, assert)
    const person = employeePerson(response.body())
    for (const field of ['personCurp', 'personRfc', 'personImssNss'] as const) {
      assert.equal(person[field], SENSITIVE_MASK)
      assert.notInclude(String(person[field]), fixture.clear.curp.slice(-4))
      assert.notInclude(String(person[field]), fixture.clear.rfc.slice(-4))
      assert.notInclude(String(person[field]), fixture.clear.nss.slice(-4))
    }
  })

  test('CA-2: contacto tapado con máscara fija sin @ ni dominio', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employees/${fixture.employee.employeeId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))

    expectNeverDenied(response, assert)
    const person = employeePerson(response.body())
    assert.equal(person.personEmail, SENSITIVE_MASK)
    assert.equal(person.personPhone, SENSITIVE_MASK)
    assert.notInclude(String(person.personEmail), '@')
  })

  test('CA-3: vacío y blanco no se enmascaran en serialización', ({ assert }) => {
    assert.equal(maskSensitiveValue(null), null)
    assert.equal(maskSensitiveValue(''), '')
    assert.equal(maskSensitiveValue('   '), '   ')
    assert.equal(
      maskSensitiveDtoValue('EmployeeMedicalCondition', 'employeeMedicalConditionDiagnosis', ''),
      ''
    )
    assert.equal(
      maskSensitiveDtoValue('EmployeeMedicalCondition', 'employeeMedicalConditionDiagnosis', '   '),
      '   '
    )
  })

  test('CA-4: con identificación concedida sigue enmascarado en GET', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['sensitive-identificacion-read'])
    const response = await client
      .get(`/api/employees/${fixture.employee.employeeId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))

    expectNeverDenied(response, assert)
    const person = employeePerson(response.body())
    assert.equal(person.personCurp, SENSITIVE_MASK)
    assert.equal(person.personRfc, SENSITIVE_MASK)
    assert.equal(person.personImssNss, SENSITIVE_MASK)
    await grantOnly(actor.role.roleId, [])
  })

  test('CA-5: cuentas bancarias sin *LastNumbers en JSON', async ({ client, assert }) => {
    const response = await client
      .get(`/api/employee-banks/${fixture.bank.employeeBankId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))

    expectNeverDenied(response, assert)
    const bank = bankBody(response.body())
    assert.notProperty(bank, 'employeeBankAccountClabeLastNumbers')
    assert.notProperty(bank, 'employeeBankAccountNumberLastNumbers')
    assert.notProperty(bank, 'employeeBankAccountCardNumberLastNumbers')
    assert.equal(bank.employeeBankAccountClabe, SENSITIVE_MASK)
  })

  test('CA-6: evidencia sin revealAllowed enmascara ip y userAgent', async ({ assert }) => {
    const service = new EvidenceService({
      async findEvidence() {
        return {
          rows: [
            {
              userConsentId: 1,
              userId: 10,
              employeeId: null,
              legalDocumentId: 1,
              legalDocument: { legalDocumentType: 'biometric_consent', legalDocumentVersion: '1' },
              userConsentDocumentVersion: '1',
              userConsentAcceptedAt: null,
              userConsentIp: '203.0.113.10',
              userConsentUserAgent: 'Mozilla/5.0 Safari',
              userConsentChannel: 'digital',
              userConsentSignedAt: null,
              userConsentEvidenceFile: null,
              user: {
                person: { personFirstname: 'Ana', personLastname: 'Torres', personSecondLastname: '' },
                businessUnits: [],
              },
              employee: null,
              registeredBy: null,
            },
          ],
          meta: { total: 1, perPage: 20, currentPage: 1, lastPage: 1 },
        }
      },
      async findAllForExport() {
        return []
      },
    } as never)

    const page = await service.getEvidence({}, { page: 1, perPage: 20 }, false)
    assert.equal(page.data[0].ip, SENSITIVE_MASK)
    assert.equal(page.data[0].userAgent, SENSITIVE_MASK)
  })

  test('CA-7: eco fijo o heredado al guardar no cambia el RFC', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write'])
    for (const echo of [MASK_ECHO_RFC, MASK_ECHO_LEGACY_RFC]) {
      const response = await client
        .put(`/api/persons/${fixture.person.personId}`)
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', buHeader(actor))
        .json(personUpdateBase(fixture.person, { personRfc: echo }))

      assertMaskEchoAccepted(response, assert)
      const reloaded = await reloadPerson(fixture.person.personId)
      assert.equal(reloaded.personRfc, RFC_ORIGINAL)
    }
  })

  test('CA-8: valor con • que no es eco responde 422', async ({ client, assert }) => {
    await grantOnly(actor.role.roleId, ['tab-persona-write'])
    const response = await client
      .put(`/api/persons/${fixture.person.personId}`)
      .loginAs(actor.user)
      .header('X-Business-Unit-Id', buHeader(actor))
      .json(personUpdateBase(fixture.person, { personRfc: MASK_CORRUPT_B }))

    assertMaskCorruptionRejected(response, assert)
    const reloaded = await reloadPerson(fixture.person.personId)
    assert.equal(reloaded.personRfc, RFC_ORIGINAL)
  })

  test('CA-11: maskSensitiveValue solo se invoca desde serialización y evidencia', ({ assert }) => {
    const callers: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!entry.endsWith('.ts')) continue
        const rel = full.replace(`${process.cwd()}/`, '')
        if (rel === 'app/helpers/sensitive_mask.ts') continue
        if (readFileSync(full, 'utf-8').includes('maskSensitiveValue(')) {
          callers.push(rel)
        }
      }
    }
    walk(join(process.cwd(), 'app'))
    assert.deepEqual(callers.sort(), [
      'app/helpers/sensitive_serialize.ts',
      'app/modules/consent/evidence/evidence.service.ts',
    ])
  })
})
