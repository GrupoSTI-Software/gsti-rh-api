import type { HttpContext } from '@adonisjs/core/http'
import type { PermissionGateOptions } from '#constants/permission_gate'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { AdmsError } from '#exceptions/adms_error'
import AccessPoint from '#models/access_point'
import PermissionGateService from '#services/permission_gate_service'
import Employee from '#models/employee'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import { AccessPointScope } from '#modules/access-point/sharing/access_point_scope'

export type AccessPointRole = 'owner' | 'guest'

export interface ParticipantAccessPoint {
  accessPoint: AccessPoint
  role: AccessPointRole
  /** Scope del checador: responsable + invitadas vivas. */
  deviceScope: number[]
}

/**
 * Autorizacion unica de las rutas del canal ADMS hacia el Backoffice
 * (spec 11 y 13): el permiso se resuelve con `evaluateEnforced` y no con el
 * `permissionGate` de ruta.
 *
 * El motivo no depende de un modulo concreto: la decision no puede colgar del
 * interruptor de exigencia del modulo del que cuelgue la declaracion que se le
 * pase —`biometric-devices` en el canal ADMS, `employees` en los biometricos
 * del expediente (`device_biometrics.controller.ts`)—. Los dos exigen permisos
 * hoy; aun asi `evaluate` no sirve aqui, porque cortaria en
 * `module-not-enforced` —dejando el canal abierto a cualquier autenticado— si
 * alguien apagara ese interruptor en BD.
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
  throw accessPointNotFound(ctx)
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

function accessPointNotFound(ctx: HttpContext): AdmsError {
  return new AdmsError(
    ctx.i18n.formatMessage('adms_not_found_title'),
    ADMS_ERROR_CODES.AUTHZ_OUT_OF_SCOPE,
    404,
    'punto-acceso-no-encontrado',
    ctx.i18n.formatMessage('adms_not_found_message')
  )
}

/**
 * Como `resolveScopedAccessPoint`, pero admite el checador ajeno compartido con
 * la empresa de la peticion (VLRH-P0065, 6). Devuelve el rol y el scope del
 * checador: toda operacion sobre el aparato corre dentro de ese scope, porque
 * sus PIN y su cola son de todos los participantes.
 *
 * La empresa del colaborador se sigue resolviendo con `resolveScopedEmployee`
 * en el scope de la peticion: compartir el aparato no da acceso a la gente de
 * otra empresa.
 */
export async function resolveParticipantAccessPoint(
  ctx: HttpContext,
  accessPointId: number
): Promise<ParticipantAccessPoint> {
  const scope = ctx.businessUnitScope ?? []
  if (scope.length === 0) throw accessPointNotFound(ctx)

  // La consulta se cierra con `first()` dentro del bypass: un builder devuelto
  // sin ejecutar correria fuera del contexto y truena (VLRH-A0036, M12).
  const accessPoint = await TenantContext.runUnscoped(
    () =>
      AccessPoint.query()
        .where('access_point_id', accessPointId)
        .whereNull('access_point_deleted_at')
        .first(),
    TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING
  )
  if (!accessPoint) throw accessPointNotFound(ctx)

  const deviceScope = await AccessPointScope.participants(
    accessPoint.accessPointId,
    accessPoint.businessUnitId
  )
  const owner = scope.includes(accessPoint.businessUnitId)
  const guest = !owner && deviceScope.some((id) => scope.includes(id))
  if (!owner && !guest) throw accessPointNotFound(ctx)

  return { accessPoint, role: owner ? 'owner' : 'guest', deviceScope }
}

/**
 * El checador solo para su responsable: escrituras de configuracion (reloj,
 * perfil, secreto, IP, avance). La invitada recibe 403 y no 404 porque ya sabe
 * que el aparato existe: lo ve en su lista.
 */
export async function resolveOwnedAccessPoint(
  ctx: HttpContext,
  accessPointId: number
): Promise<AccessPoint> {
  const participant = await resolveParticipantAccessPoint(ctx, accessPointId)
  if (participant.role === 'owner') return participant.accessPoint
  throw sharedReadOnly(ctx)
}

/**
 * Para el catalogo de equipos (`PUT`/`DELETE /api/access-points/:id`), que
 * conserva su propio 404 para lo que no encuentra: solo corta a la invitada
 * con el 403 de solo lectura. Un aparato ajeno o inexistente no lanza nada
 * aqui y sigue su camino hacia el 404 de siempre.
 */
export async function rejectSharedGuest(ctx: HttpContext, accessPointId: number): Promise<void> {
  let participant: ParticipantAccessPoint
  try {
    participant = await resolveParticipantAccessPoint(ctx, accessPointId)
  } catch (error) {
    if (error instanceof AdmsError && error.httpStatus === 404) return
    throw error
  }
  if (participant.role === 'guest') throw sharedReadOnly(ctx)
}

function sharedReadOnly(ctx: HttpContext): AdmsError {
  return new AdmsError(
    ctx.i18n.formatMessage('access_point_shared_read_only_title'),
    ADMS_ERROR_CODES.AUTHZ_FORBIDDEN,
    403,
    'solo-lectura-checador-compartido',
    ctx.i18n.formatMessage('access_point_shared_read_only_message')
  )
}

/**
 * El colaborador de la peticion sobre un checador concreto: se resuelve en el
 * scope de la peticion y ademas su empresa tiene que participar del aparato.
 * Un aparato compartido solo atiende a la gente de sus participantes; para
 * cualquier otra empresa ese checador no existe.
 */
export async function resolveParticipantEmployee(
  ctx: HttpContext,
  participant: ParticipantAccessPoint,
  employeeId: number
): Promise<Employee> {
  const employee = await resolveScopedEmployee(ctx, employeeId)
  if (participant.deviceScope.includes(employee.businessUnitId as number)) return employee
  throw accessPointNotFound(ctx)
}

/**
 * Lo que una empresa puede leer del checador: la responsable, todo el scope
 * del aparato; la invitada, solo lo suyo (su personal, sus comandos). Para
 * lecturas por fila de empleado o de comando, no para agregados del aparato.
 */
export function readScopeOf(ctx: HttpContext, participant: ParticipantAccessPoint): number[] {
  if (participant.role === 'owner') return participant.deviceScope
  const scope = ctx.businessUnitScope ?? []
  return participant.deviceScope.filter((id) => scope.includes(id))
}
