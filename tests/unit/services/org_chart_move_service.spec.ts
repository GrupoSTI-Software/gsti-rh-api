import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import OrgChartMoveService from '#services/org_chart_move_service'
import { ensureRole } from '#tests/helpers/ensure_role'

/**
 * Tests unitarios — OrgChartMoveService.assertCanUpdateOrganizationChart, bypass
 * de `owner` (USRH1783712837561, regresión de acceso §10 del spec).
 *
 * El self-service nacía antes como `super-administrador`, que ya tenía acceso
 * implícito aquí vía `ORG_CHART_ADMIN_SLUGS`. `owner` debe conservarlo.
 */

function getI18nStub(): I18n {
  return { formatMessage: (key: string) => key } as unknown as I18n
}

test.group('OrgChartMoveService.assertCanUpdateOrganizationChart — bypass de owner', () => {
  test('permite a owner actualizar el organigrama sin fila en role_system_permission', async ({
    assert,
  }) => {
    const ownerRole = await ensureRole('owner')
    const service = new OrgChartMoveService(getI18nStub())

    const canUpdate = await service.assertCanUpdateOrganizationChart(ownerRole.roleId)

    assert.isTrue(canUpdate, 'owner debe quedar en ORG_CHART_ADMIN_SLUGS igual que super-administrador')
  })

  test('retorna false cuando no se recibe roleId', async ({ assert }) => {
    const service = new OrgChartMoveService(getI18nStub())
    const canUpdate = await service.assertCanUpdateOrganizationChart(null)
    assert.isFalse(canUpdate)
  })
})
