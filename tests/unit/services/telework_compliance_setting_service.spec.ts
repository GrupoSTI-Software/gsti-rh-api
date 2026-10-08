import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import Person from '#models/person'
import User from '#models/user'
import TeleworkComplianceSettingService from '#services/telework_compliance_setting_service'
import { TeleworkComplianceSettingServiceError } from '#exceptions/telework_compliance_setting_service_error'
import { TELEWORK_COMPLIANCE_DEFAULTS } from '#constants/telework_compliance_setting'
import { TenantContext } from '#utils/tenant_context'
import { ensureRole } from '#tests/helpers/ensure_role'
import type { TeleworkComplianceSettingEffective } from '../../../app/interfaces/telework_compliance_setting_interface.js'

/**
 * Spec unitario del servicio de ajustes de teletrabajo por empresa
 * (VLRH-H1791306074375, Task 2).
 *
 * Cubre CA-1 a CA-13 y los Review Focus 3 y 5 del plan. `getEffective` se llama
 * directamente, sin envolver (japa corre fuera de HTTP): esa es la prueba de
 * CA-10. Todo lo que toca el modelo (`upsert` y los conteos de verificación) va
 * envuelto en `TenantContext.run([businessUnitId], …)` para que el mixin no
 * lance `TenantContextMissingException`.
 *
 * Fixtures tomados del molde `tests/functional/telework_policy.spec.ts`: actores
 * con email único por timestamp y cleanup explícito en `group.teardown`.
 */

const TEST_PASSWORD = 'TeleworkSettingsTest123!'

interface TestActor {
  user: User
  person: Person
}

async function createTestActor(emailPrefix: string, secondLastname = 'Actor'): Promise<TestActor> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = `${emailPrefix}-${stamp}@gsti-tests.local`

  const person = new Person()
  person.personFirstname = 'TeleworkSettings'
  person.personLastname = 'Test'
  person.personSecondLastname = secondLastname
  person.personEmail = email
  await person.save()

  const user = new User()
  user.userEmail = email
  user.userPassword = TEST_PASSWORD
  user.userActive = 1
  const role = await ensureRole('root')
  user.roleId = role.roleId
  user.personId = person.personId
  user.userEmailType = 'institutional'
  await user.save()

  return { user, person }
}

async function cleanupTestActor(actor: TestActor | null): Promise<void> {
  if (!actor) return
  await actor.user.related('businessUnits').detach()
  await User.query().where('user_id', actor.user.userId).delete()
  await Person.query().where('person_id', actor.person.personId).delete()
}

async function createTestBusinessUnit(prefix: string): Promise<BusinessUnit> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const businessUnit = new BusinessUnit()
  businessUnit.businessUnitName = `TeleworkSettings ${prefix} ${stamp}`
  businessUnit.businessUnitSlug = `telework-settings-${prefix}-${stamp}`
  businessUnit.businessUnitLegalName = `TeleworkSettings ${prefix} Legal ${stamp}`
  businessUnit.businessUnitActive = 1
  await businessUnit.save()
  return businessUnit
}

async function countSettings(businessUnitId: number): Promise<number> {
  const row = await db
    .from('telework_compliance_settings')
    .where('business_unit_id', businessUnitId)
    .count('* as total')
    .first()
  return Number(row?.total ?? 0)
}

interface RawSettingRow {
  telework_compliance_setting_created_by_user_id: number
  telework_compliance_setting_updated_by_user_id: number
  telework_compliance_setting_internet_allowance_default: string | null
}

async function readRawSetting(businessUnitId: number): Promise<RawSettingRow | undefined> {
  return db
    .from('telework_compliance_settings')
    .where('business_unit_id', businessUnitId)
    .first() as Promise<RawSettingRow | undefined>
}

/** Captura un error del servicio y falla si el error lanzado es de otro tipo. */
async function expectServiceError(
  fn: () => Promise<unknown>
): Promise<TeleworkComplianceSettingServiceError> {
  let caught: unknown
  try {
    await fn()
  } catch (error) {
    caught = error
  }
  if (!(caught instanceof TeleworkComplianceSettingServiceError)) {
    throw caught ?? new Error('Se esperaba TeleworkComplianceSettingServiceError')
  }
  return caught
}

/** Estrecha la unión discriminada: solo devuelve el id cuando hay fila. */
function readConfiguredId(effective: TeleworkComplianceSettingEffective): number | null {
  if (effective.isDefault) return null
  return effective.teleworkComplianceSettingId
}

test.group(
  'TeleworkComplianceSettingService — default virtual y lectura (CA-1, CA-10)',
  (group) => {
    const service = new TeleworkComplianceSettingService()
    let actor: TestActor
    let buA: BusinessUnit
    let buB: BusinessUnit

    group.setup(async () => {
      actor = await createTestActor('tws-read')
      buA = await createTestBusinessUnit('read-a')
      buB = await createTestBusinessUnit('read-b')
    })

    group.each.teardown(async () => {
      await db.from('telework_compliance_settings').where('business_unit_id', buA.businessUnitId).delete()
      await db.from('telework_compliance_settings').where('business_unit_id', buB.businessUnitId).delete()
    })

    group.teardown(async () => {
      for (const bu of [buA, buB]) {
        await db.from('telework_compliance_settings').where('business_unit_id', bu.businessUnitId).delete()
        await db.from('business_units').where('business_unit_id', bu.businessUnitId).delete()
      }
      await cleanupTestActor(actor)
    })

    test('Objetivo: CA-1 — empresa sin fila recibe el default virtual y la tabla sigue en 0', async ({
      assert,
    }) => {
      const effective = await service.getEffective(buA.businessUnitId)

      assert.deepEqual(effective, {
        isDefault: true,
        teleworkComplianceSettingId: null,
        revalidationPeriodMonths: 12,
        expirationNoticeDays: 30,
        electricityAllowanceDefault: null,
        internetAllowanceDefault: null,
        ownEquipmentFeeDefault: null,
        updatedAt: null,
        updatedByName: null,
      })
      assert.equal(await countSettings(buA.businessUnitId), 0)
    })

    test('Objetivo: CA-10 — getEffective corre sin TenantContext ni HttpContext y por empresa', async ({
      assert,
    }) => {
      assert.isFalse(TenantContext.isActive())

      // Alta envuelta para que el mixin del modelo no lance.
      await TenantContext.run([buA.businessUnitId], () =>
        service.upsert(
          {
            revalidationPeriodMonths: 6,
            expirationNoticeDays: 15,
            electricityAllowanceDefault: 350,
            internetAllowanceDefault: 500,
            ownEquipmentFeeDefault: 250,
          },
          buA.businessUnitId,
          actor.user.userId
        )
      )

      // Ambas lecturas, sin envolver: ninguna debe lanzar TenantContextMissingException.
      const effectiveA = await service.getEffective(buA.businessUnitId)
      const effectiveB = await service.getEffective(buB.businessUnitId)

      assert.isFalse(effectiveA.isDefault)
      assert.isTrue(effectiveB.isDefault)
      assert.deepEqual(effectiveB, {
        ...TELEWORK_COMPLIANCE_DEFAULTS,
        isDefault: true,
        teleworkComplianceSettingId: null,
        updatedAt: null,
        updatedByName: null,
      })
    })

    test('Objetivo: CA-10 — ids no enteros o <= 0 lanzan alcance-no-resuelto sin consultar', async ({
      assert,
    }) => {
      for (const invalidScope of [0, -1, 1.5]) {
        const error = await expectServiceError(() => service.getEffective(invalidScope))
        assert.equal(error.key, 'alcance-no-resuelto')
        assert.equal(error.errorCode, 'TWS.AUTH.002')
        assert.equal(error.httpStatus, 403)
      }
    })
  }
)

test.group(
  'TeleworkComplianceSettingService — validación de reglas 3 a 5 (CA-5, CA-6, CA-7, CA-8)',
  (group) => {
    const service = new TeleworkComplianceSettingService()
    let actor: TestActor
    let businessUnit: BusinessUnit
    let buId: number

    const baseInput = {
      revalidationPeriodMonths: 6,
      expirationNoticeDays: 15,
      electricityAllowanceDefault: 350 as number | null,
      internetAllowanceDefault: 500 as number | null,
      ownEquipmentFeeDefault: 250 as number | null,
    }

    function upsertWith(overrides: Partial<typeof baseInput>) {
      const input = { ...baseInput, ...overrides }
      return TenantContext.run([buId], () => service.upsert(input, buId, actor.user.userId))
    }

    group.setup(async () => {
      actor = await createTestActor('tws-validate')
      businessUnit = await createTestBusinessUnit('validate')
      buId = businessUnit.businessUnitId
    })

    group.each.teardown(async () => {
      await db.from('telework_compliance_settings').where('business_unit_id', buId).delete()
    })

    group.teardown(async () => {
      await db.from('telework_compliance_settings').where('business_unit_id', buId).delete()
      await db.from('business_units').where('business_unit_id', buId).delete()
      await cleanupTestActor(actor)
    })

    test('Objetivo: CA-5 — periodicidad fuera de 1-12 o no entera se rechaza por campo', async ({
      assert,
    }) => {
      for (const invalidPeriod of [0, 13, 6.5]) {
        const error = await expectServiceError(() =>
          upsertWith({ revalidationPeriodMonths: invalidPeriod })
        )
        assert.equal(error.key, 'periodicidad-de-revalidacion-invalida')
        assert.equal(error.errorCode, 'TWS.VAL.002')
        assert.equal(error.httpStatus, 422)
        assert.equal(error.field, 'revalidationPeriodMonths')
      }
    })

    test('Objetivo: CA-6 — ventana de aviso fuera de contrato se rechaza por campo', async ({
      assert,
    }) => {
      const invalidCases = [
        { months: 6, days: 200 },
        { months: 6, days: 180 },
        { months: 6, days: 0 },
        { months: 1, days: 30 },
      ]

      for (const invalidCase of invalidCases) {
        const error = await expectServiceError(() =>
          upsertWith({
            revalidationPeriodMonths: invalidCase.months,
            expirationNoticeDays: invalidCase.days,
          })
        )
        assert.equal(error.key, 'ventana-de-aviso-invalida')
        assert.equal(error.errorCode, 'TWS.VAL.003')
        assert.equal(error.field, 'expirationNoticeDays')
      }

      // Bordes válidos: 6 con 179 y 1 con 29 resuelven.
      const validSix = await upsertWith({ revalidationPeriodMonths: 6, expirationNoticeDays: 179 })
      assert.isFalse(validSix.isDefault)

      const validOne = await upsertWith({ revalidationPeriodMonths: 1, expirationNoticeDays: 29 })
      assert.isFalse(validOne.isDefault)
    })

    test('Objetivo: Review Focus 5 — el borde de 12 meses (359 guarda, 360 no)', async ({
      assert,
    }) => {
      const valid = await upsertWith({ revalidationPeriodMonths: 12, expirationNoticeDays: 359 })
      assert.isFalse(valid.isDefault)

      const error = await expectServiceError(() =>
        upsertWith({ revalidationPeriodMonths: 12, expirationNoticeDays: 360 })
      )
      assert.equal(error.errorCode, 'TWS.VAL.003')
      assert.equal(error.field, 'expirationNoticeDays')
    })

    test('Objetivo: CA-7 — monto negativo, de más de dos decimales o sobre el tope se rechaza', async ({
      assert,
    }) => {
      for (const invalidAmount of [-1, 350.555, 100000000]) {
        const error = await expectServiceError(() =>
          upsertWith({ internetAllowanceDefault: invalidAmount })
        )
        assert.equal(error.key, 'monto-invalido')
        assert.equal(error.errorCode, 'TWS.VAL.004')
        assert.equal(error.httpStatus, 422)
        assert.equal(error.field, 'internetAllowanceDefault')
      }

      // El tope exacto resuelve.
      const atMax = await upsertWith({ internetAllowanceDefault: 99999999.99 })
      assert.isFalse(atMax.isDefault)
    })

    test('Objetivo: CA-8 — el primer campo inválido en el orden fijo gana', async ({ assert }) => {
      const error = await expectServiceError(() =>
        upsertWith({
          revalidationPeriodMonths: 13,
          expirationNoticeDays: 0,
          electricityAllowanceDefault: -1,
        })
      )

      assert.equal(error.errorCode, 'TWS.VAL.002')
      assert.equal(error.field, 'revalidationPeriodMonths')
    })

    test('Objetivo: CA-3 — los centavos no se pierden en el round-trip', async ({ assert }) => {
      await upsertWith({ electricityAllowanceDefault: 0.29 })

      const effective = await service.getEffective(buId)
      assert.isFalse(effective.isDefault)
      if (!effective.isDefault) {
        assert.equal(effective.electricityAllowanceDefault, 0.29)
        assert.isNumber(effective.electricityAllowanceDefault)
      }
    })
  }
)

test.group('TeleworkComplianceSettingService — escritura (CA-2, CA-13)', (group) => {
  const service = new TeleworkComplianceSettingService()
  let actorCreate: TestActor
  let actorUpdate: TestActor
  let businessUnit: BusinessUnit
  let buId: number

  group.setup(async () => {
    actorCreate = await createTestActor('tws-write-create')
    actorUpdate = await createTestActor('tws-write-update')
    businessUnit = await createTestBusinessUnit('write')
    buId = businessUnit.businessUnitId
  })

  group.each.teardown(async () => {
    await db.from('telework_compliance_settings').where('business_unit_id', buId).delete()
  })

  group.teardown(async () => {
    await db.from('telework_compliance_settings').where('business_unit_id', buId).delete()
    await db.from('business_units').where('business_unit_id', buId).delete()
    await cleanupTestActor(actorCreate)
    await cleanupTestActor(actorUpdate)
  })

  test('Objetivo: CA-2 — el alta crea una fila y la edición reusa la misma', async ({ assert }) => {
    const expectedName = `${actorCreate.person.personFirstname} ${actorCreate.person.personLastname} ${actorCreate.person.personSecondLastname}`

    const created = await TenantContext.run([buId], () =>
      service.upsert(
        {
          revalidationPeriodMonths: 6,
          expirationNoticeDays: 15,
          electricityAllowanceDefault: 350,
          internetAllowanceDefault: 500,
          ownEquipmentFeeDefault: 250,
        },
        buId,
        actorCreate.user.userId
      )
    )

    assert.isFalse(created.isDefault)
    if (!created.isDefault) {
      assert.isNumber(created.teleworkComplianceSettingId)
      assert.match(created.updatedAt, /^\d{4}-\d{2}-\d{2}T/)
      assert.equal(created.updatedByName, expectedName)
      assert.equal(created.electricityAllowanceDefault, 350)
      assert.equal(created.internetAllowanceDefault, 500)
      assert.equal(created.ownEquipmentFeeDefault, 250)
    }
    assert.equal(await countSettings(buId), 1)

    const rawAfterCreate = await readRawSetting(buId)
    assert.equal(
      Number(rawAfterCreate!.telework_compliance_setting_created_by_user_id),
      actorCreate.user.userId
    )
    const createdByBefore = rawAfterCreate!.telework_compliance_setting_created_by_user_id

    const edited = await TenantContext.run([buId], () =>
      service.upsert(
        {
          revalidationPeriodMonths: 6,
          expirationNoticeDays: 15,
          electricityAllowanceDefault: 350,
          internetAllowanceDefault: null,
          ownEquipmentFeeDefault: 250,
        },
        buId,
        actorUpdate.user.userId
      )
    )

    assert.equal(await countSettings(buId), 1)
    assert.isFalse(edited.isDefault)
    if (!edited.isDefault) {
      assert.isNull(edited.internetAllowanceDefault)
    }

    const rawAfterUpdate = await readRawSetting(buId)
    assert.equal(
      rawAfterUpdate!.telework_compliance_setting_created_by_user_id,
      createdByBefore,
      'created_by queda intacto tras la edición'
    )
    assert.equal(
      Number(rawAfterUpdate!.telework_compliance_setting_updated_by_user_id),
      actorUpdate.user.userId
    )
  })

  test('Objetivo: CA-13 — dos upsert concurrentes dejan una sola fila', async ({ assert }) => {
    const results = await Promise.all([
      TenantContext.run([buId], () =>
        service.upsert(
          {
            revalidationPeriodMonths: 3,
            expirationNoticeDays: 10,
            electricityAllowanceDefault: 100,
            internetAllowanceDefault: 200,
            ownEquipmentFeeDefault: 300,
          },
          buId,
          actorCreate.user.userId
        )
      ),
      TenantContext.run([buId], () =>
        service.upsert(
          {
            revalidationPeriodMonths: 4,
            expirationNoticeDays: 20,
            electricityAllowanceDefault: 400,
            internetAllowanceDefault: 500,
            ownEquipmentFeeDefault: 600,
          },
          buId,
          actorUpdate.user.userId
        )
      ),
    ])

    assert.lengthOf(results, 2)
    for (const result of results) {
      assert.isFalse(result.isDefault)
    }
    assert.equal(await countSettings(buId), 1)
  })

  test('Objetivo: Review Focus 3 — updatedByName arma nombre, apellidos y updatedAt ISO', async ({
    assert,
  }) => {
    const secondLastname = 'Segundo'
    const actorWithSecondLastname = await createTestActor('tws-second-lastname', secondLastname)
    const ownBu = await createTestBusinessUnit('write-second-lastname')

    try {
      const effective = await TenantContext.run([ownBu.businessUnitId], () =>
        service.upsert(
          {
            revalidationPeriodMonths: 6,
            expirationNoticeDays: 15,
            electricityAllowanceDefault: 1,
            internetAllowanceDefault: 1,
            ownEquipmentFeeDefault: 1,
          },
          ownBu.businessUnitId,
          actorWithSecondLastname.user.userId
        )
      )

      assert.isFalse(effective.isDefault)
      if (!effective.isDefault) {
        assert.equal(
          effective.updatedByName,
          `${actorWithSecondLastname.person.personFirstname} ${actorWithSecondLastname.person.personLastname} ${secondLastname}`
        )
        assert.match(effective.updatedAt, /^\d{4}-\d{2}-\d{2}T/)
      }
    } finally {
      await db
        .from('telework_compliance_settings')
        .where('business_unit_id', ownBu.businessUnitId)
        .delete()
      await db.from('business_units').where('business_unit_id', ownBu.businessUnitId).delete()
      await cleanupTestActor(actorWithSecondLastname)
    }
  })
})

test.group('TeleworkComplianceSettingService — contrato de tipos (CA-12)', () => {
  test('Objetivo: CA-12 — la unión discriminada exige estrechar para leer el id', ({ assert }) => {
    const effective: TeleworkComplianceSettingEffective = {
      ...TELEWORK_COMPLIANCE_DEFAULTS,
      isDefault: true,
      teleworkComplianceSettingId: null,
      updatedAt: null,
      updatedByName: null,
    }

    // @ts-expect-error `isDefault: true` no expone un id numérico: hay que estrechar.
    const unsafeId: number = effective.teleworkComplianceSettingId

    assert.isNull(effective.teleworkComplianceSettingId)
    assert.isNull(unsafeId)
    assert.isNull(readConfiguredId(effective))
  })
})
