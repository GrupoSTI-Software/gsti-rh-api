import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Role from '#models/role'
import ShiftException from '#models/shift_exception'
import { ROLE_SCOPE_ERROR_CODES } from '#constants/role_scope_error_codes'
import { TenantContext } from '#utils/tenant_context'
import {
  cleanupEmployeeFixture,
  createEmployeeFixture,
  type EmployeeFixture,
} from '#tests/helpers/employee_fixture'
import {
  cleanupTenantActor,
  createTenantActor,
  grantModulePermissions,
  type TenantActor,
} from '#tests/helpers/tenant_actor'

/**
 * Los días que un rol alcanza a modificar ya topaban la captura manual de
 * checadas. Las excepciones de turno y los cambios de turno escriben igual
 * sobre un día del pasado, así que llevan el mismo tope: el backoffice deja de
 * ofrecer el botón, pero el endpoint también tiene que cerrarse.
 */

const MODULE_SLUG = 'employees'
/** Permisos que el actor necesita para llegar a los endpoints bajo prueba. */
const PERMISSIONS = ['add-exception', 'manage-shift-change'] as const

let actor: TenantActor
let employeeFixture: EmployeeFixture
let publicId: string

/** Deja el rol del actor con los días de alcance que el caso necesita. */
async function withRoleManagementDays(days: number | null): Promise<number | null> {
  const role = await Role.query().where('role_id', actor.user.roleId).firstOrFail()
  const previous = role.roleManagementDays
  role.roleManagementDays = days
  await role.save()
  return previous
}

test.group('Alcance por rol sobre el día registrado', (group) => {
  group.setup(async () => {
    actor = await createTenantActor('role-scope')
    await grantModulePermissions(actor, MODULE_SLUG, PERMISSIONS)
    employeeFixture = await createEmployeeFixture(actor.businessUnit.businessUnitId, 'scope')
    publicId = String(actor.businessUnit.businessUnitPublicId)
  })

  group.teardown(async () => {
    await TenantContext.runUnscoped(async () => {
      // El alta de una excepción deja calendario clasificado colgado del
      // colaborador, y su FK impide borrarlo mientras exista.
      for (const table of ['shift_exceptions', 'employee_assist_calendars']) {
        await db.from(table).where('employee_id', employeeFixture.employee.employeeId).delete()
      }
    }, 'limpieza del spec de alcance por rol')
    await cleanupEmployeeFixture(employeeFixture)
    await cleanupTenantActor(actor)
  })

  test('una excepción más vieja que el alcance del rol se rechaza', async ({ client, assert }) => {
    const previous = await withRoleManagementDays(3)

    try {
      const response = await client
        .post('/api/shift-exception')
        .json({
          employeeId: employeeFixture.employee.employeeId,
          exceptionTypeId: 1,
          shiftExceptionsDate: DateTime.utc().minus({ days: 30 }).toISODate(),
          shiftExceptionsDescription: 'fuera de alcance',
        })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', publicId)

      response.assertStatus(422)
      assert.equal(response.body().code, ROLE_SCOPE_ERROR_CODES.VAL_DAY_OUT_OF_ROLE_SCOPE)
      assert.equal(response.body().key, 'fecha-fuera-del-alcance-del-rol')

      // El corte ocurre antes de escribir: no queda rastro del intento.
      const saved = await TenantContext.runUnscoped(
        async () =>
          ShiftException.query()
            .where('employee_id', employeeFixture.employee.employeeId)
            .count('* as total'),
        'conteo de excepciones tras el rechazo'
      )
      assert.equal(Number(saved[0].$extras.total), 0)
    } finally {
      await withRoleManagementDays(previous)
    }
  })

  test('un rol sin días declarados alcanza cualquier fecha', async ({ client }) => {
    const previous = await withRoleManagementDays(null)

    try {
      const response = await client
        .post('/api/shift-exception')
        .json({
          employeeId: employeeFixture.employee.employeeId,
          exceptionTypeId: 1,
          shiftExceptionsDate: DateTime.utc().minus({ days: 30 }).toISODate(),
          shiftExceptionsDescription: 'dentro de alcance',
        })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', publicId)

      // Lo que importa es que NO corte por alcance; el resto del alta puede
      // fallar por sus propias reglas y eso es asunto de otro spec.
      if (response.status() === 422) {
        response.assertBodyContains({ code: ROLE_SCOPE_ERROR_CODES.VAL_DAY_OUT_OF_ROLE_SCOPE })
        throw new Error('el rol sin tope no debería cortar por alcance')
      }
    } finally {
      await withRoleManagementDays(previous)
    }
  })

  test('un cambio de turno más viejo que el alcance se rechaza', async ({ client, assert }) => {
    const previous = await withRoleManagementDays(3)

    try {
      const stale = DateTime.utc().minus({ days: 30 }).toISODate()
      const response = await client
        .post('/api/employee-shift-changes')
        .json({
          employeeIdFrom: employeeFixture.employee.employeeId,
          shiftIdFrom: 1,
          employeeShiftChangeDateFrom: stale,
          employeeShiftChangeDateFromIsRestDay: false,
          employeeIdTo: employeeFixture.employee.employeeId,
          shiftIdTo: 1,
          employeeShiftChangeDateTo: stale,
          employeeShiftChangeDateToIsRestDay: false,
          employeeShiftChangeChangeThisShift: true,
        })
        .loginAs(actor.user)
        .header('X-Business-Unit-Id', publicId)

      response.assertStatus(422)
      assert.equal(response.body().code, ROLE_SCOPE_ERROR_CODES.VAL_DAY_OUT_OF_ROLE_SCOPE)
    } finally {
      await withRoleManagementDays(previous)
    }
  })
})
