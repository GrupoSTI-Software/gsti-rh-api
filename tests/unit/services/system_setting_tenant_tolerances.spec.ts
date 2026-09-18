import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import BusinessUnit from '#models/business_unit'
import SystemSetting from '#models/system_setting'
import Tolerance from '#models/tolerance'
import SystemSettingService from '#services/system_setting_service'
import { TENANT_TOLERANCE_DEFAULTS } from '#constants/system_setting_defaults'
import { TenantContext } from '#utils/tenant_context'

/**
 * Las tolerancias de asistencia son de cada empresa.
 *
 * Antes las tres (`Delay`, `Fault`, `TardinessTolerance`) colgaban del registro
 * base de plataforma (`system_setting_id = 1`, sembrado por
 * `0020_tolerance_seeder`) y el motor de asistencia las leía de ahí para TODOS
 * los clientes: quien ajustaba su tolerancia desde el backoffice creaba filas
 * que nadie miraba. Ese seeder se retiró y el alta de la empresa las siembra.
 */

const stamp = () => `${Date.now()}-${Math.floor(Math.random() * 100_000)}`

async function createBusinessUnit(label: string): Promise<BusinessUnit> {
  const token = stamp()

  return BusinessUnit.create({
    businessUnitName: `Tolerancias ${label} ${token}`,
    businessUnitSlug: `tolerancias-${label}-${token}`,
    businessUnitLegalName: `Tolerancias ${label} legal ${token}`,
    businessUnitActive: 1,
    businessUnitOrigin: 'platform',
  })
}

async function cleanup(businessUnit: BusinessUnit): Promise<void> {
  const settings = await SystemSetting.query()
    .withTrashed()
    .where('business_unit_id', businessUnit.businessUnitId)

  if (settings.length > 0) {
    await Tolerance.query()
      .whereIn(
        'system_setting_id',
        settings.map((setting) => setting.systemSettingId)
      )
      .delete()
    await SystemSetting.query()
      .withTrashed()
      .where('business_unit_id', businessUnit.businessUnitId)
      .delete()
  }

  await BusinessUnit.query().where('business_unit_id', businessUnit.businessUnitId).delete()
}

test.group('Tolerancias por empresa', () => {
  test('el alta de la empresa siembra sus tres tolerancias', async ({ assert }) => {
    const businessUnit = await createBusinessUnit('alta')

    try {
      const setting = await db.transaction(async (trx) =>
        new SystemSettingService().createForTenant(
          {
            businessUnitId: businessUnit.businessUnitId,
            businessUnitSlug: businessUnit.businessUnitSlug,
            businessUnitName: businessUnit.businessUnitName,
          },
          trx
        )
      )

      const tolerances = await Tolerance.query().where('system_setting_id', setting.systemSettingId)

      assert.lengthOf(tolerances, TENANT_TOLERANCE_DEFAULTS.length)
      assert.sameMembers(
        tolerances.map((tolerance) => tolerance.toleranceName),
        TENANT_TOLERANCE_DEFAULTS.map((tolerance) => tolerance.toleranceName)
      )

      for (const expected of TENANT_TOLERANCE_DEFAULTS) {
        const actual = tolerances.find((item) => item.toleranceName === expected.toleranceName)
        assert.equal(actual?.toleranceMinutes, expected.toleranceMinutes, expected.toleranceName)
      }
    } finally {
      await cleanup(businessUnit)
    }
  })

  test('reejecutar el alta no duplica ni pisa lo que la empresa ajustó', async ({ assert }) => {
    const businessUnit = await createBusinessUnit('idempotente')

    try {
      const setting = await db.transaction(async (trx) =>
        new SystemSettingService().createForTenant(
          {
            businessUnitId: businessUnit.businessUnitId,
            businessUnitSlug: businessUnit.businessUnitSlug,
            businessUnitName: businessUnit.businessUnitName,
          },
          trx
        )
      )

      // La empresa cambia su tolerancia de retardo desde el backoffice.
      const delay = await Tolerance.query()
        .where('system_setting_id', setting.systemSettingId)
        .where('tolerance_name', 'Delay')
        .firstOrFail()
      delay.toleranceMinutes = 25
      await delay.save()

      await db.transaction(async (trx) =>
        new SystemSettingService().createForTenant(
          {
            businessUnitId: businessUnit.businessUnitId,
            businessUnitSlug: businessUnit.businessUnitSlug,
            businessUnitName: businessUnit.businessUnitName,
          },
          trx
        )
      )

      const tolerances = await Tolerance.query().where('system_setting_id', setting.systemSettingId)
      const reloadedDelay = tolerances.find((item) => item.toleranceName === 'Delay')

      assert.lengthOf(tolerances, TENANT_TOLERANCE_DEFAULTS.length, 'no se duplican')
      assert.equal(reloadedDelay?.toleranceMinutes, 25, 'el valor ajustado por la empresa se respeta')
    } finally {
      await cleanup(businessUnit)
    }
  })

  test('cada empresa lee SU tolerancia, no la de la otra', async ({ assert }) => {
    const unitA = await createBusinessUnit('a')
    const unitB = await createBusinessUnit('b')
    const service = new SystemSettingService()

    try {
      const settingA = await db.transaction(async (trx) =>
        service.createForTenant(
          {
            businessUnitId: unitA.businessUnitId,
            businessUnitSlug: unitA.businessUnitSlug,
            businessUnitName: unitA.businessUnitName,
          },
          trx
        )
      )
      const settingB = await db.transaction(async (trx) =>
        service.createForTenant(
          {
            businessUnitId: unitB.businessUnitId,
            businessUnitSlug: unitB.businessUnitSlug,
            businessUnitName: unitB.businessUnitName,
          },
          trx
        )
      )

      // A sube su tolerancia de retardo; B se queda con el default.
      const delayA = await Tolerance.query()
        .where('system_setting_id', settingA.systemSettingId)
        .where('tolerance_name', 'Delay')
        .firstOrFail()
      delayA.toleranceMinutes = 45
      await delayA.save()

      const resolvedA = await TenantContext.run([unitA.businessUnitId], () =>
        service.resolveForActiveTenant()
      )
      const resolvedB = await TenantContext.run([unitB.businessUnitId], () =>
        service.resolveForActiveTenant()
      )

      const minutesOf = (setting: SystemSetting | null) =>
        setting?.systemSettingTolerances.find((item) => item.toleranceName === 'Delay')
          ?.toleranceMinutes

      assert.equal(resolvedA?.systemSettingId, settingA.systemSettingId)
      assert.equal(resolvedB?.systemSettingId, settingB.systemSettingId)
      assert.equal(minutesOf(resolvedA), 45, 'A lee la suya, la que ajustó')
      assert.equal(minutesOf(resolvedB), 10, 'B lee la suya, el default, no el 45 de A')
    } finally {
      await cleanup(unitA)
      await cleanup(unitB)
    }
  })

  test('sin empresa en contexto no se sirve la configuración de nadie', async ({ assert }) => {
    // El respaldo era caer al registro base de plataforma. Ya no existe, y caer
    // a él significaba servir la configuración de nadie como si fuera propia.
    const resolved = await new SystemSettingService().resolveForActiveTenant()

    assert.isNull(resolved)
  })
})
