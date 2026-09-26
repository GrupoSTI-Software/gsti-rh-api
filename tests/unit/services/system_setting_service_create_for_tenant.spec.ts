import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import SystemSetting from '#models/system_setting'
import Tolerance from '#models/tolerance'
import SystemSettingService from '#services/system_setting_service'
import { SYSTEM_SETTING_MONTHLY_CONVERSION_FACTOR_DEFAULT } from '#constants/system_setting_defaults'

/**
 * Tests unitarios de `SystemSettingService.createForTenant()` (USRH1783712837572).
 *
 * Cubre los criterios de siembra de defaults propios de la empresa (ya no se
 * copia el registro base de GrupoSTI), creación idempotente y revive-tras-
 * soft-delete, sin pasar por el flujo HTTP de signup (eso lo cubre
 * `tests/functional/signup_system_settings.spec.ts`).
 *
 * Convenciones: sin transacción de test (cada llamada a `createForTenant` abre
 * su propia transacción real, como en producción); identificadores únicos por
 * timestamp; cleanup explícito en `group.teardown`.
 */


/**
 * Borra la configuración de una empresa y lo que cuelga de ella.
 *
 * Las tolerancias salen primero: desde que el alta las siembra, la FK impide
 * borrar la ficha mientras tenga tolerancias vivas.
 */
async function cleanupTenantSettings(businessUnitId: number): Promise<void> {
  const settings = await SystemSetting.query()
    .withTrashed()
    .where('business_unit_id', businessUnitId)

  if (settings.length > 0) {
    await Tolerance.query()
      .whereIn(
        'system_setting_id',
        settings.map((setting) => setting.systemSettingId)
      )
      .delete()
  }

  await SystemSetting.query().withTrashed().where('business_unit_id', businessUnitId).delete()
}

test.group('SystemSettingService.createForTenant', (group) => {
  let businessUnit: BusinessUnit | null = null
  const service = new SystemSettingService()

  group.setup(async () => {
    const stamp = Date.now()
    businessUnit = new BusinessUnit()
    businessUnit.businessUnitName = `Tenant Settings Test ${stamp}`
    businessUnit.businessUnitSlug = `tenant-settings-test-${stamp}`
    businessUnit.businessUnitLegalName = `Tenant Settings Test Legal ${stamp}`
    businessUnit.businessUnitActive = 1
    await businessUnit.save()
  })

  group.teardown(async () => {
    if (businessUnit) {
      await cleanupTenantSettings(businessUnit.businessUnitId)
      await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
    }
  })

  test('siembra los defaults de la empresa nueva y la liga por business_unit_id', async ({
    assert,
  }) => {
    if (!businessUnit) {
      assert.fail('El setup del grupo no preparó la unidad de negocio de prueba')
      return
    }

    const created = await db.transaction(async (trx) => {
      return service.createForTenant(
        {
          businessUnitId: businessUnit!.businessUnitId,
          businessUnitSlug: businessUnit!.businessUnitSlug,
          businessUnitName: businessUnit!.businessUnitName,
        },
        trx
      )
    })

    assert.equal(created.businessUnitId, businessUnit.businessUnitId)

    // Identidad propia de la empresa, no la del registro base (GrupoSTI)
    assert.equal(created.systemSettingTradeName, businessUnit.businessUnitName)
    assert.isNull(created.systemSettingLogo)
    assert.isNull(created.systemSettingBanner)
    assert.isNull(created.systemSettingFavicon)
    assert.isNull(created.systemSettingEmployeeAplicationIcon)
    assert.equal(created.systemSettingSidebarColor, 'FFFFFF')

    // Defaults operativos
    assert.equal(created.systemSettingActive, 1)
    assert.equal(created.systemSettingToleranceCountPerAbsence, 3)
    assert.equal(created.systemSettingRestrictFutureVacation, 1)
    assert.equal(created.systemSettingBirthdayEmails, 0)
    assert.equal(created.systemSettingAnniversaryEmails, 0)
    assert.equal(created.systemSettingAttendanceFaultHrEmails, 0)
    assert.isNull(created.systemSettingMaxAbsencesBeforeAttendanceLock)
    assert.isNull(created.systemSettingMaxLateArrivalsBeforeAttendanceLock)
    assert.equal(created.systemSettingPeriodAbsencesBeforeAttendanceLock, 'monthly')
    assert.equal(created.systemSettingPeriodLateArrivalsBeforeAttendanceLock, 'monthly')
    assert.equal(
      Number(created.systemSettingMonthlyConversionFactor),
      SYSTEM_SETTING_MONTHLY_CONVERSION_FACTOR_DEFAULT
    )

    const rows = await SystemSetting.query().where('business_unit_id', businessUnit.businessUnitId)
    assert.lengthOf(rows, 1, 'Debe existir exactamente una fila de system_settings para el tenant')
  })

  test('los defaults quedan persistidos, no solo en la instancia devuelta', async ({ assert }) => {
    if (!businessUnit) {
      assert.fail('El setup del grupo no preparó la unidad de negocio de prueba')
      return
    }

    const persisted = await SystemSetting.query()
      .where('business_unit_id', businessUnit.businessUnitId)
      .firstOrFail()

    assert.equal(persisted.systemSettingTradeName, businessUnit.businessUnitName)
    assert.isNull(persisted.systemSettingLogo)
    assert.isNull(persisted.systemSettingBanner)
    assert.isNull(persisted.systemSettingFavicon)
    assert.isNull(persisted.systemSettingEmployeeAplicationIcon)
    assert.equal(persisted.systemSettingSidebarColor, 'FFFFFF')
    assert.equal(persisted.systemSettingToleranceCountPerAbsence, 3)
    assert.isNull(persisted.systemSettingMaxAbsencesBeforeAttendanceLock)
    assert.equal(
      Number(persisted.systemSettingMonthlyConversionFactor),
      SYSTEM_SETTING_MONTHLY_CONVERSION_FACTOR_DEFAULT
    )
  })

  test('reintentar para el mismo business_unit_id es idempotente (no duplica)', async ({ assert }) => {
    if (!businessUnit) {
      assert.fail('El setup del grupo no preparó la unidad de negocio de prueba')
      return
    }

    await db.transaction(async (trx) => {
      return service.createForTenant(
        {
          businessUnitId: businessUnit!.businessUnitId,
          businessUnitSlug: businessUnit!.businessUnitSlug,
          businessUnitName: businessUnit!.businessUnitName,
        },
        trx
      )
    })

    const rows = await SystemSetting.query().where('business_unit_id', businessUnit.businessUnitId)
    assert.lengthOf(rows, 1, 'Un reintento no debe crear una segunda fila para el mismo tenant')
  })

  test('no depende del registro base: provisiona aunque el id 1 esté soft-deleted', async ({
    assert,
  }) => {
    const stamp = Date.now()
    const isolatedUnit = new BusinessUnit()
    isolatedUnit.businessUnitName = `Tenant Settings NoBase ${stamp}`
    isolatedUnit.businessUnitSlug = `tenant-settings-nobase-${stamp}`
    isolatedUnit.businessUnitLegalName = `Tenant Settings NoBase Legal ${stamp}`
    isolatedUnit.businessUnitActive = 1
    await isolatedUnit.save()

    try {
      const created = await db.transaction(async (trx) => {
        return service.createForTenant(
          {
            businessUnitId: isolatedUnit.businessUnitId,
            businessUnitSlug: isolatedUnit.businessUnitSlug,
            businessUnitName: isolatedUnit.businessUnitName,
          },
          trx
        )
      })

      assert.equal(created.businessUnitId, isolatedUnit.businessUnitId)
      assert.equal(created.systemSettingTradeName, isolatedUnit.businessUnitName)
    } finally {
      await cleanupTenantSettings(isolatedUnit.businessUnitId)
      await BusinessUnit.query().where('business_unit_id', isolatedUnit.businessUnitId).delete()
    }
  })

  test('revive el registro tras soft-delete en vez de bloquear la reprovisión', async ({ assert }) => {
    if (!businessUnit) {
      assert.fail('El setup del grupo no preparó la unidad de negocio de prueba')
      return
    }

    const existing = await SystemSetting.query()
      .where('business_unit_id', businessUnit.businessUnitId)
      .firstOrFail()
    await existing.delete()

    const trashed = await SystemSetting.query()
      .withTrashed()
      .where('business_unit_id', businessUnit.businessUnitId)
      .firstOrFail()
    assert.isNotNull(trashed.deletedAt, 'La fila debe quedar soft-deleted antes de reprovisionar')

    const revived = await db.transaction(async (trx) => {
      return service.createForTenant(
        {
          businessUnitId: businessUnit!.businessUnitId,
          businessUnitSlug: businessUnit!.businessUnitSlug,
          businessUnitName: businessUnit!.businessUnitName,
        },
        trx
      )
    })

    assert.isNull(revived.deletedAt, 'La fila revivida no debe seguir marcada como soft-deleted')
    assert.equal(revived.businessUnitId, businessUnit.businessUnitId)
    assert.equal(revived.systemSettingId, trashed.systemSettingId, 'Debe reutilizar la misma fila, no crear otra')
    assert.equal(revived.systemSettingTradeName, businessUnit.businessUnitName)
    assert.equal(revived.systemSettingSidebarColor, 'FFFFFF')

    const rows = await SystemSetting.query().withTrashed().where('business_unit_id', businessUnit.businessUnitId)
    assert.lengthOf(rows, 1, 'Debe seguir existiendo una sola fila (revivida) para el tenant')
  })
})

test.group('SystemSettingService.createForTenant — callers internos (CA-7)', () => {
  const service = new SystemSettingService()

  test('SignupDraftService.complete sigue invocando createForTenant', ({ assert }) => {
    const content = readFileSync(join(process.cwd(), 'app/services/signup_draft_service.ts'), 'utf-8')
    assert.include(content, 'await systemSettingService.createForTenant(')
  })

  test('AdditionalBusinessUnitService sigue invocando createForTenant', ({ assert }) => {
    const content = readFileSync(
      join(process.cwd(), 'app/services/additional_business_unit_service.ts'),
      'utf-8'
    )
    assert.include(content, 'await systemSettingService.createForTenant(')
  })

  test('camino signup: provisiona con la misma firma que SignupDraftService.complete', async ({
    assert,
  }) => {
    const stamp = Date.now()
    const businessUnit = await BusinessUnit.create({
      businessUnitName: `Signup Caller ${stamp}`,
      businessUnitSlug: `signup-caller-${stamp}`,
      businessUnitLegalName: `Signup Caller Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'self_service',
    })

    try {
      const created = await db.transaction(async (trx) => {
        return service.createForTenant(
          {
            businessUnitId: businessUnit.businessUnitId,
            businessUnitSlug: businessUnit.businessUnitSlug,
            businessUnitName: businessUnit.businessUnitName,
          },
          trx
        )
      })

      assert.equal(created.businessUnitId, businessUnit.businessUnitId)
      assert.equal(created.systemSettingTradeName, businessUnit.businessUnitName)
    } finally {
      await cleanupTenantSettings(businessUnit.businessUnitId)
      await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
    }
  })

  test('camino empresa adicional: provisiona con la misma firma que AdditionalBusinessUnitService', async ({
    assert,
  }) => {
    const stamp = Date.now()
    const businessUnit = await BusinessUnit.create({
      businessUnitName: `Additional BU Caller ${stamp}`,
      businessUnitSlug: `additional-bu-caller-${stamp}`,
      businessUnitLegalName: `Additional BU Caller Legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'self_service',
    })

    try {
      const created = await db.transaction(async (trx) => {
        return service.createForTenant(
          {
            businessUnitId: businessUnit.businessUnitId,
            businessUnitSlug: businessUnit.businessUnitSlug,
            businessUnitName: businessUnit.businessUnitName,
          },
          trx
        )
      })

      assert.equal(created.businessUnitId, businessUnit.businessUnitId)
    } finally {
      await cleanupTenantSettings(businessUnit.businessUnitId)
      await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
    }
  })
})
