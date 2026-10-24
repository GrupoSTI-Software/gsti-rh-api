import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import PlatformBillingSetting from '#models/platform_billing_setting'
import BillingGracePeriodService, {
  billingGraceSettingCache,
} from '#services/billing_grace_period_service'
import {
  BILLING_GRACE_DAYS_DEFAULT,
  BILLING_GRACE_DAYS_MAX,
  BILLING_GRACE_DAYS_MIN,
} from '../../../app/helpers/contracted_employees_rules.js'

test.group('BillingGracePeriodService', (group) => {
  let service: BillingGracePeriodService
  let actorUser: User

  group.each.setup(async () => {
    service = new BillingGracePeriodService()
    await db.from('platform_billing_settings').delete()
    billingGraceSettingCache.invalidate()
    const person = await db.from('people').first()
    const role = await db.from('roles').first()

    let personId = person?.person_id
    if (!personId) {
      const insertedPeople = await db.table('people').insert({ person_first_name: 'Test' })
      personId = insertedPeople[0]
    }

    let roleId = role?.role_id
    if (!roleId) {
      const insertedRoles = await db.table('roles').insert({ role_name: 'Admin Test' })
      roleId = insertedRoles[0]
    }

    actorUser = await User.firstOrCreate(
      { userEmail: 'admin-service-test@valanserh.com' },
      {
        userEmail: 'admin-service-test@valanserh.com',
        userPassword: 'secretPassword123',
        isPlatformAdmin: true,
        userActive: 1,
        personId,
        roleId,
      }
    )
  })

  group.each.teardown(async () => {
    await db.from('platform_billing_settings').delete()
    billingGraceSettingCache.invalidate()
    if (actorUser) {
      await actorUser.delete()
    }
  })

  test('U-1: Sin filas devuelve el default con la bandera apagada', async ({ assert }) => {
    const setting = await service.getEffectiveSetting()
    assert.equal(setting.graceDays, 10)
    assert.isFalse(setting.restrictionEnabled)
    assert.isNull(setting.restrictionEnabledOn)
    assert.equal(setting.source, 'default')
    assert.isNull(setting.platformBillingSettingId)
    assert.isNull(setting.updatedAt)
    assert.isNull(setting.updatedBy)
  })

  test('U-2: Primera escritura inserta fila aunque coincida con los días por defecto', async ({ assert }) => {
    const { setting, changed } = await service.updateSetting(
      { graceDays: 10, restrictionEnabled: false },
      actorUser.userId,
      '2026-11-01'
    )

    assert.isTrue(changed)
    assert.equal(setting.source, 'configured')
    assert.isNotNull(setting.platformBillingSettingId)
    assert.equal(setting.graceDays, 10)
    assert.isFalse(setting.restrictionEnabled)

    const count = await PlatformBillingSetting.query().count('* as total')
    assert.equal(Number(count[0].$extras.total), 1)
  })

  test('U-3: Encender fija la fecha de encendido a la fecha proporcionada', async ({ assert }) => {
    await service.updateSetting(
      { graceDays: 10, restrictionEnabled: false },
      actorUser.userId,
      '2026-11-01'
    )

    const { setting } = await service.updateSetting(
      { graceDays: 10, restrictionEnabled: true },
      actorUser.userId,
      '2026-11-01'
    )

    assert.isTrue(setting.restrictionEnabled)
    assert.equal(setting.restrictionEnabledOn, '2026-11-01')
  })

  test('U-4: Arrastre: Cambiar solo días de gracia mantiene la fecha de encendido original', async ({ assert }) => {
    await service.updateSetting(
      { graceDays: 10, restrictionEnabled: true },
      actorUser.userId,
      '2026-11-01'
    )

    const { setting } = await service.updateSetting(
      { graceDays: 15, restrictionEnabled: true },
      actorUser.userId,
      '2026-11-05'
    )

    assert.equal(setting.graceDays, 15)
    assert.isTrue(setting.restrictionEnabled)
    assert.equal(setting.restrictionEnabledOn, '2026-11-01') // NO 2026-11-05
  })

  test('U-5: Apagar limpia la fecha de encendido', async ({ assert }) => {
    await service.updateSetting(
      { graceDays: 15, restrictionEnabled: true },
      actorUser.userId,
      '2026-11-01'
    )

    const { setting } = await service.updateSetting(
      { graceDays: 15, restrictionEnabled: false },
      actorUser.userId,
      '2026-11-07'
    )

    assert.isFalse(setting.restrictionEnabled)
    assert.isNull(setting.restrictionEnabledOn)
  })

  test('U-6: Re-encender establece una nueva fecha de encendido', async ({ assert }) => {
    await service.updateSetting({ graceDays: 15, restrictionEnabled: true }, actorUser.userId, '2026-11-01')
    await service.updateSetting({ graceDays: 15, restrictionEnabled: false }, actorUser.userId, '2026-11-07')

    const { setting } = await service.updateSetting(
      { graceDays: 15, restrictionEnabled: true },
      actorUser.userId,
      '2026-11-09'
    )

    assert.isTrue(setting.restrictionEnabled)
    assert.equal(setting.restrictionEnabledOn, '2026-11-09') // NO 2026-11-01
  })

  test('U-7: Sin cambios devuelve changed=false y no inserta una nueva fila', async ({ assert }) => {
    await service.updateSetting({ graceDays: 15, restrictionEnabled: true }, actorUser.userId, '2026-11-09')

    const { changed } = await service.updateSetting(
      { graceDays: 15, restrictionEnabled: true },
      actorUser.userId,
      '2026-11-10'
    )

    assert.isFalse(changed)
    const count = await PlatformBillingSetting.query().count('* as total')
    assert.equal(Number(count[0].$extras.total), 1)
  })

  test('U-8: Historial retorna los elementos en orden descendente', async ({ assert }) => {
    await service.updateSetting({ graceDays: 10, restrictionEnabled: false }, actorUser.userId, '2026-11-01')
    await service.updateSetting({ graceDays: 10, restrictionEnabled: true }, actorUser.userId, '2026-11-02')
    await service.updateSetting({ graceDays: 15, restrictionEnabled: true }, actorUser.userId, '2026-11-03')

    const history = await service.listSettingHistory(1, 20)
    assert.equal(history.meta.total, 3)
    assert.equal(history.data.length, 3)
    assert.isTrue(history.data[0].platformBillingSettingId > history.data[1].platformBillingSettingId)
  })

  test('U-9/U-10: La caché sirve el valor guardado e invalida tras actualizar', async ({ assert }) => {
    await service.updateSetting({ graceDays: 10, restrictionEnabled: false }, actorUser.userId, '2026-11-01')

    const first = await service.getEffectiveSetting()
    assert.equal(first.graceDays, 10)

    await service.updateSetting({ graceDays: 20, restrictionEnabled: false }, actorUser.userId, '2026-11-02')

    const second = await service.getEffectiveSetting()
    assert.equal(second.graceDays, 20)
  })

  test('U-11: TTL de la caché limpia la entrada a los 60 segundos', async ({ assert }) => {
    const dummySetting: any = { graceDays: 10, restrictionEnabled: false }
    billingGraceSettingCache.set(dummySetting, 1000)

    assert.isDefined(billingGraceSettingCache.get(1000 + 59_999))
    assert.isUndefined(billingGraceSettingCache.get(1000 + 60_000))
  })

  test('U-13: Verificación de constantes de negocio', async ({ assert }) => {
    assert.equal(BILLING_GRACE_DAYS_DEFAULT, 10)
    assert.equal(BILLING_GRACE_DAYS_MIN, 1)
    assert.equal(BILLING_GRACE_DAYS_MAX, 30)
  })
})