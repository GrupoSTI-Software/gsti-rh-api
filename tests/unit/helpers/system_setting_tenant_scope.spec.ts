import { test } from '@japa/runner'
import logger from '@adonisjs/core/services/logger'
import BusinessUnit from '#models/business_unit'
import SystemSetting from '#models/system_setting'
import {
  findSystemSettingInScope,
  isTenantScopeActive,
  scopedSystemSettingIds,
} from '#helpers/system_setting_tenant_scope'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import {
  TENANT_SCOPE_BLOCK_LOG_CODE,
  TENANT_SCOPE_BLOCK_MODE,
  type TenantScopeBlockPayload,
} from '#utils/tenant_scope_block_log'

test.group('system_setting_tenant_scope — D3 (USRH1789600808831 / N10)', (group) => {
  let unitA: BusinessUnit
  let unitB: BusinessUnit
  let settingA: SystemSetting
  let settingB: SystemSetting
  let globalSettingId: number | null = null

  group.setup(async () => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    unitA = await BusinessUnit.create({
      businessUnitName: `Sys setting scope A ${stamp}`,
      businessUnitSlug: `sys-setting-scope-a-${stamp}`,
      businessUnitLegalName: `Sys setting scope A legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
    unitB = await BusinessUnit.create({
      businessUnitName: `Sys setting scope B ${stamp}`,
      businessUnitSlug: `sys-setting-scope-b-${stamp}`,
      businessUnitLegalName: `Sys setting scope B legal ${stamp}`,
      businessUnitActive: 1,
      businessUnitOrigin: 'platform',
    })
    settingA = await SystemSetting.create({
      businessUnitId: unitA.businessUnitId,
      systemSettingTradeName: `Trade A ${stamp}`,
      systemSettingSidebarColor: '#111111',
      systemSettingActive: 1,
      systemSettingMonthlyConversionFactor: 30.4,
    })
    settingB = await SystemSetting.create({
      businessUnitId: unitB.businessUnitId,
      systemSettingTradeName: `Trade B ${stamp}`,
      systemSettingSidebarColor: '#222222',
      systemSettingActive: 1,
      systemSettingMonthlyConversionFactor: 30.4,
    })
    const globalRow = await SystemSetting.query()
      .whereNull('business_unit_id')
      .whereNull('system_setting_deleted_at')
      .first()
    globalSettingId = globalRow?.systemSettingId ?? null
  })

  group.teardown(async () => {
    await SystemSetting.query()
      .whereIn('system_setting_id', [settingA.systemSettingId, settingB.systemSettingId])
      .delete()
    await BusinessUnit.query()
      .whereIn('business_unit_id', [unitA.businessUnitId, unitB.businessUnitId])
      .delete()
  })

  test('sin contexto registra bloqueo muestreado en system_settings (N10.4)', async ({
    assert,
  }) => {
    const emitted: TenantScopeBlockPayload[] = []
    const originalDebug = logger.debug.bind(logger)
    const originalInfo = logger.info.bind(logger)
    const originalWarn = logger.warn.bind(logger)
    const capture = (...args: unknown[]) => {
      const payload = args[0]
      if (
        payload &&
        typeof payload === 'object' &&
        'table' in payload &&
        (payload as TenantScopeBlockPayload).table === 'system_settings'
      ) {
        emitted.push(payload as TenantScopeBlockPayload)
      }
    }
    ;(logger as unknown as { debug: (...args: unknown[]) => void }).debug = capture
    ;(logger as unknown as { info: (...args: unknown[]) => void }).info = capture
    ;(logger as unknown as { warn: (...args: unknown[]) => void }).warn = capture

    try {
      assert.isFalse(TenantContext.isActive())
      await findSystemSettingInScope(settingA.systemSettingId)
    } finally {
      ;(logger as unknown as { debug: typeof logger.debug }).debug = originalDebug
      ;(logger as unknown as { info: typeof logger.info }).info = originalInfo
      ;(logger as unknown as { warn: typeof logger.warn }).warn = originalWarn
    }

    assert.isAbove(emitted.length, 0)
    const sample = emitted[0]
    assert.equal(sample.code, TENANT_SCOPE_BLOCK_LOG_CODE)
    assert.equal(sample.mode, TENANT_SCOPE_BLOCK_MODE)
    assert.equal(sample.table, 'system_settings')
  })

  test('sin contexto isTenantScopeActive es true salvo bypass (N10.1)', ({ assert }) => {
    assert.isTrue(isTenantScopeActive())
  })

  test('sin contexto: global visible, de tenant null; scopedSystemSettingIds solo globales (N10.1)', async ({
    assert,
  }) => {
    assert.isFalse(TenantContext.isActive())

    const foundGlobal =
      globalSettingId === null ? null : await findSystemSettingInScope(globalSettingId)
    if (globalSettingId !== null) {
      assert.isNotNull(foundGlobal)
      assert.isNull(foundGlobal!.businessUnitId)
    }

    assert.isNull(await findSystemSettingInScope(settingB.systemSettingId))

    const rows = await SystemSetting.query()
      .whereNull('system_setting_deleted_at')
      .whereIn('system_setting_id', scopedSystemSettingIds())
      .select('business_unit_id')
    for (const row of rows) {
      assert.isNull(row.businessUnitId)
    }
  })

  test('con run([A]): A y global visibles, B null (N10.2)', async ({ assert }) => {
    const scope = [unitA.businessUnitId]
    const foundA = await TenantContext.run(scope, () =>
      findSystemSettingInScope(settingA.systemSettingId)
    )
    const foundB = await TenantContext.run(scope, () =>
      findSystemSettingInScope(settingB.systemSettingId)
    )
    assert.isNotNull(foundA)
    assert.equal(foundA!.systemSettingId, settingA.systemSettingId)
    assert.isNull(foundB)

    if (globalSettingId !== null) {
      const foundGlobal = await TenantContext.run(scope, () =>
        findSystemSettingInScope(globalSettingId!)
      )
      assert.isNotNull(foundGlobal)
    }
  })

  test('runUnscoped desactiva isTenantScopeActive y ve A, B y global (N10.3)', async ({
    assert,
  }) => {
    await TenantContext.runUnscoped(async () => {
      assert.isFalse(isTenantScopeActive())
      assert.isNotNull(await findSystemSettingInScope(settingA.systemSettingId))
      assert.isNotNull(await findSystemSettingInScope(settingB.systemSettingId))
      if (globalSettingId !== null) {
        assert.isNotNull(await findSystemSettingInScope(globalSettingId))
      }
    }, TENANT_UNSCOPED_REASON.TEST_FIXTURE)
  })
})
