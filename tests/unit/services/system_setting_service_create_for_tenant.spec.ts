import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import SystemSetting from '#models/system_setting'
import SystemSettingService from '#services/system_setting_service'

/**
 * Tests unitarios de `SystemSettingService.createForTenant()` (USRH1783712837572).
 *
 * Cubre directamente los criterios de aceptación de creación idempotente y
 * revive-tras-soft-delete, sin pasar por el flujo HTTP de signup (eso lo cubre
 * `tests/functional/signup_system_settings.spec.ts`).
 *
 * Convenciones: sin transacción de test (cada llamada a `createForTenant` abre
 * su propia transacción real, como en producción); identificadores únicos por
 * timestamp; cleanup explícito en `group.teardown`.
 */

const BASE_SYSTEM_SETTING_ID = 1

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

  test('crea la configuración copiando el contenido del registro base y ligada por business_unit_id', async ({
    assert,
  }) => {
    if (!businessUnit) {
      assert.fail('El setup del grupo no preparó la unidad de negocio de prueba')
      return
    }

    const base = await SystemSetting.query().where('system_setting_id', BASE_SYSTEM_SETTING_ID).firstOrFail()

    const created = await db.transaction(async (trx) => {
      return service.createForTenant(businessUnit!.businessUnitId, businessUnit!.businessUnitSlug, trx)
    })

    assert.equal(created.businessUnitId, businessUnit.businessUnitId)
    assert.equal(created.systemSettingBusinessUnits, businessUnit.businessUnitSlug)
    assert.equal(created.systemSettingTradeName, base.systemSettingTradeName)
    assert.equal(
      created.systemSettingToleranceCountPerAbsence,
      base.systemSettingToleranceCountPerAbsence
    )
    assert.equal(created.systemSettingMonthlyConversionFactor, base.systemSettingMonthlyConversionFactor)
    assert.notEqual(created.systemSettingId, base.systemSettingId)

    const rows = await SystemSetting.query().where('business_unit_id', businessUnit.businessUnitId)
    assert.lengthOf(rows, 1, 'Debe existir exactamente una fila de system_settings para el tenant')
  })

  test('reintentar para el mismo business_unit_id es idempotente (no duplica)', async ({ assert }) => {
    if (!businessUnit) {
      assert.fail('El setup del grupo no preparó la unidad de negocio de prueba')
      return
    }

    await db.transaction(async (trx) => {
      return service.createForTenant(businessUnit!.businessUnitId, businessUnit!.businessUnitSlug, trx)
    })

    const rows = await SystemSetting.query().where('business_unit_id', businessUnit.businessUnitId)
    assert.lengthOf(rows, 1, 'Un reintento no debe crear una segunda fila para el mismo tenant')
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
      return service.createForTenant(businessUnit!.businessUnitId, businessUnit!.businessUnitSlug, trx)
    })

    assert.isNull(revived.deletedAt, 'La fila revivida no debe seguir marcada como soft-deleted')
    assert.equal(revived.businessUnitId, businessUnit.businessUnitId)
    assert.equal(revived.systemSettingId, trashed.systemSettingId, 'Debe reutilizar la misma fila, no crear otra')

    const rows = await SystemSetting.query().withTrashed().where('business_unit_id', businessUnit.businessUnitId)
    assert.lengthOf(rows, 1, 'Debe seguir existiendo una sola fila (revivida) para el tenant')
  })
})
