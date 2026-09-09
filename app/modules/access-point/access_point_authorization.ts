import type { HttpContext } from '@adonisjs/core/http'
import type { PermissionGateOptions } from '#constants/permission_gate'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { AdmsError } from '#exceptions/adms_error'
import AccessPoint from '#models/access_point'
import PermissionGateService from '#services/permission_gate_service'
import Employee from '#models/employee'

/**
 * Autorizacion unica de las rutas del canal ADMS hacia el Backoffice
 * (spec 11 y 13): el permiso se resuelve con `evaluateEnforced` porque el
 * interruptor de exigencia del modulo esta apagado y `permissionGate` de ruta
 * dejaria pasar a cualquier autenticado.
 */
export async function ensureAccessPointPermission(
  ctx: HttpContext,
  declaration: PermissionGateOptions
): Promise<void> {
  const service = ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())
  const decision = await service.evaluateEnforced(ctx.auth.user, declaration)
  if (decision.reason === 'granted' || decision.reason === 'bypass') return
  throw new AdmsError(
    ctx.i18n.formatMessage('adms_forbidden_title'),
    ADMS_ERROR_CODES.AUTHZ_FORBIDDEN,
    403,
    'sin-permiso',
    ctx.i18n.formatMessage('adms_forbidden_message')
  )
}

/**
 * Resuelve todo `:accessPointId` dentro del alcance de la peticion antes de
 * cualquier escritura. Un equipo de otra empresa se comporta como inexistente:
 * responder 403 revelaria que la serie existe en otra parte.
 */
export async function resolveScopedAccessPoint(
  ctx: HttpContext,
  accessPointId: number
): Promise<AccessPoint> {
  const scope = ctx.businessUnitScope ?? []
  const accessPoint =
    scope.length === 0
      ? null
      : await AccessPoint.query()
          .where('access_point_id', accessPointId)
          .whereIn('business_unit_id', scope)
          .first()
  if (accessPoint) return accessPoint
  throw new AdmsError(
    ctx.i18n.formatMessage('adms_not_found_title'),
    ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
    404,
    'punto-acceso-no-encontrado',
    ctx.i18n.formatMessage('adms_not_found_message')
  )
}

/**
 * Lo mismo para todo `:employeeId`. Un colaborador de otra empresa se comporta
 * como inexistente por la misma razon: un 403 confirmaria que existe.
 *
 * Se lee con el scope explicito y no con el mixin: el mixin filtra lecturas,
 * pero una escritura que se apoye en el se cae en cuanto alguien la llame desde
 * un contexto sin scope (regla 13.3).
 */
export async function resolveScopedEmployee(
  ctx: HttpContext,
  employeeId: number
): Promise<Employee> {
  const scope = ctx.businessUnitScope ?? []
  const employee =
    scope.length === 0
      ? null
      : await Employee.query()
          .where('employee_id', employeeId)
          .whereIn('business_unit_id', scope)
          .first()
  if (employee) return employee
  throw new AdmsError(
    ctx.i18n.formatMessage('adms_not_found_title'),
    ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
    404,
    'colaborador-no-encontrado',
    ctx.i18n.formatMessage('adms_not_found_message')
  )
}
