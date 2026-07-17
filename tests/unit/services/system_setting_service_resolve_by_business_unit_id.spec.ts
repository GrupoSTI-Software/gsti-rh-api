import { test } from '@japa/runner'
import BusinessUnit from '#models/business_unit'
import SystemSetting from '#models/system_setting'
import SystemSettingService from '#services/system_setting_service'
import { SystemSettingResolutionError } from '#exceptions/system_setting_resolution_error'
import { SYSTEM_SETTING_RESOLUTION_ERROR_CODES } from '#constants/system_setting_resolution_error_codes'

/**
 * Tests unitarios de `SystemSettingService.resolveByBusinessUnitId()`
 * (USRH1783712837584).
 *
 * Cubre los criterios de aceptación núcleo: resolución por relación formal
 * (`business_unit_id`), fail-closed cuando la empresa no tiene configuración
 * propia, y aislamiento estricto entre dos empresas con configuraciones
 * distintas (sin fallback cruzado a "cualquier activa").
 *
 * Convenciones: sin transacción de test; identificadores únicos por
 * timestamp; cleanup explícito en `group.teardown`.
 */
test.group('SystemSettingService.resolveByBusinessUnitId', (group) => {
  const service = new SystemSettingService()
  let businessUnitWithSettings: BusinessUnit | null = null
  let businessUnitWithoutSettings: BusinessUnit | null = null
  let businessUnitB: BusinessUnit | null = null
  let systemSettingA: SystemSetting | null = null
  let systemSettingB: SystemSetting | null = null

  group.setup(async () => {
    const stamp = Date.now()

    businessUnitWithSettings = new BusinessUnit()
    businessUnitWithSettings.businessUnitName = `Resolve BU A ${stamp}`
    businessUnitWithSettings.businessUnitSlug = `resolve-bu-a-${stamp}`
    businessUnitWithSettings.businessUnitLegalName = `Resolve BU A Legal ${stamp}`
    businessUnitWithSettings.businessUnitActive = 1
    await businessUnitWithSettings.save()

    businessUnitB = new BusinessUnit()
    businessUnitB.businessUnitName = `Resolve BU B ${stamp}`
    businessUnitB.businessUnitSlug = `resolve-bu-b-${stamp}`
    businessUnitB.businessUnitLegalName = `Resolve BU B Legal ${stamp}`
    businessUnitB.businessUnitActive = 1
    await businessUnitB.save()

    businessUnitWithoutSettings = new BusinessUnit()
    businessUnitWithoutSettings.businessUnitName = `Resolve BU Sin Config ${stamp}`
    businessUnitWithoutSettings.businessUnitSlug = `resolve-bu-sin-config-${stamp}`
    businessUnitWithoutSettings.businessUnitLegalName = `Resolve BU Sin Config Legal ${stamp}`
    businessUnitWithoutSettings.businessUnitActive = 1
    await businessUnitWithoutSettings.save()

    systemSettingA = new SystemSetting()
    systemSettingA.businessUnitId = businessUnitWithSettings.businessUnitId
    systemSettingA.systemSettingTradeName = `Trade A ${stamp}`
    systemSettingA.systemSettingSidebarColor = '#111111'
    systemSettingA.systemSettingActive = 1
    systemSettingA.systemSettingBusinessUnits = businessUnitWithSettings.businessUnitSlug
    systemSettingA.systemSettingMonthlyConversionFactor = 30.4
    await systemSettingA.save()

    systemSettingB = new SystemSetting()
    systemSettingB.businessUnitId = businessUnitB.businessUnitId
    systemSettingB.systemSettingTradeName = `Trade B ${stamp}`
    systemSettingB.systemSettingSidebarColor = '#222222'
    systemSettingB.systemSettingActive = 1
    systemSettingB.systemSettingBusinessUnits = businessUnitB.businessUnitSlug
    systemSettingB.systemSettingMonthlyConversionFactor = 30.4
    await systemSettingB.save()
  })

  group.teardown(async () => {
    const businessUnitIds = [
      businessUnitWithSettings?.businessUnitId,
      businessUnitB?.businessUnitId,
      businessUnitWithoutSettings?.businessUnitId,
    ].filter((id): id is number => !!id)

    if (businessUnitIds.length > 0) {
      await SystemSetting.query().withTrashed().whereIn('business_unit_id', businessUnitIds).delete()
      await BusinessUnit.query().whereIn('business_unit_id', businessUnitIds).delete()
    }
  })

  test('empresa con registro propio: devuelve exactamente ese registro', async ({ assert }) => {
    if (!businessUnitWithSettings || !systemSettingA) {
      assert.fail('El setup del grupo no preparó la empresa con configuración')
      return
    }

    const resolved = await service.resolveByBusinessUnitId(businessUnitWithSettings.businessUnitId)

    assert.equal(resolved.systemSettingId, systemSettingA.systemSettingId)
    assert.equal(resolved.businessUnitId, businessUnitWithSettings.businessUnitId)
    assert.equal(resolved.systemSettingTradeName, systemSettingA.systemSettingTradeName)
  })

  test('empresa sin registro propio: lanza SystemSettingResolutionError con código NOT_FOUND_TENANT', async ({
    assert,
  }) => {
    if (!businessUnitWithoutSettings) {
      assert.fail('El setup del grupo no preparó la empresa sin configuración')
      return
    }

    try {
      await service.resolveByBusinessUnitId(businessUnitWithoutSettings.businessUnitId)
      assert.fail('Se esperaba que resolveByBusinessUnitId lanzara SystemSettingResolutionError')
    } catch (error) {
      assert.instanceOf(error, SystemSettingResolutionError)
      assert.equal(
        (error as SystemSettingResolutionError).errorCode,
        SYSTEM_SETTING_RESOLUTION_ERROR_CODES.NOT_FOUND_TENANT
      )
      assert.equal((error as SystemSettingResolutionError).httpStatus, 404)
    }
  })

  test('empresa A vs B con configuraciones distintas: cada resolución devuelve solo la suya (sin cruce)', async ({
    assert,
  }) => {
    if (!businessUnitWithSettings || !businessUnitB || !systemSettingA || !systemSettingB) {
      assert.fail('El setup del grupo no preparó ambas empresas')
      return
    }

    const resolvedA = await service.resolveByBusinessUnitId(businessUnitWithSettings.businessUnitId)
    const resolvedB = await service.resolveByBusinessUnitId(businessUnitB.businessUnitId)

    assert.equal(resolvedA.systemSettingId, systemSettingA.systemSettingId)
    assert.equal(resolvedB.systemSettingId, systemSettingB.systemSettingId)
    assert.notEqual(resolvedA.systemSettingId, resolvedB.systemSettingId)
    assert.equal(resolvedA.systemSettingTradeName, systemSettingA.systemSettingTradeName)
    assert.equal(resolvedB.systemSettingTradeName, systemSettingB.systemSettingTradeName)
  })
})
