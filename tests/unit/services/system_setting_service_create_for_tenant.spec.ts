import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import SystemSetting from '#models/system_setting'
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
      await SystemSetting.query().withTrashed().where('business_unit_id', businessUnit.businessUnitId).delete()
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
        businessUnit!.businessUnitId,
        businessUnit!.businessUnitSlug,
        businessUnit!.businessUnitName,
        trx
      )
    })

    assert.equal(created.businessUnitId, businessUnit.businessUnitId)
    assert.equal(created.systemSettingBusinessUnits, businessUnit.businessUnitSlug)

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
        businessUnit!.businessUnitId,
        businessUnit!.businessUnitSlug,
        businessUnit!.businessUnitName,
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

    const base = await SystemSetting.query().withTrashed().where('system_setting_id', 1).first()
    const wasDeleted = !base || !!base.deletedAt
    if (base && !base.deletedAt) {
      await base.delete()
    }

    try {
      const created = await db.transaction(async (trx) => {
        return service.createForTenant(
          isolatedUnit.businessUnitId,
          isolatedUnit.businessUnitSlug,
          isolatedUnit.businessUnitName,
          trx
        )
      })

      assert.equal(created.businessUnitId, isolatedUnit.businessUnitId)
      assert.equal(created.systemSettingTradeName, isolatedUnit.businessUnitName)
    } finally {
      // Restaura el base solo si este test lo soft-deleteó (no altera un base ya borrado en el entorno).
      if (!wasDeleted) {
        const current = await SystemSetting.query()
          .withTrashed()
          .where('system_setting_id', 1)
          .firstOrFail()
        if (current.deletedAt) {
          await current.restore()
        }
      }
      await SystemSetting.query()
        .withTrashed()
        .where('business_unit_id', isolatedUnit.businessUnitId)
        .delete()
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
        businessUnit!.businessUnitId,
        businessUnit!.businessUnitSlug,
        businessUnit!.businessUnitName,
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
