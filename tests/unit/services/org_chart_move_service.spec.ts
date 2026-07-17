import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import OrgChartMoveService from '#services/org_chart_move_service'
import RoleSeeder from '#database/seeders/0006_role_seeder'
import Role from '#models/role'

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

async function getOwnerRole(): Promise<Role> {
  await new RoleSeeder({} as never).run()
  const role = await Role.query().whereNull('role_deleted_at').where('role_slug', 'owner').first()
  if (!role) {
    throw new Error('El rol "owner" debería existir tras correr el seeder 0006.')
  }
  return role
}

test.group('OrgChartMoveService.assertCanUpdateOrganizationChart — bypass de owner', () => {
  test('permite a owner actualizar el organigrama sin fila en role_system_permission', async ({
    assert,
  }) => {
    const ownerRole = await getOwnerRole()
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
