import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import type User from '#models/user'
import { ROLE_SCOPE_ERROR_CODES } from '#constants/role_scope_error_codes'
import SiteTimeZoneService from '#modules/attendance-time/site_time_zone.service'
import {
  isDayWithinRoleManagementScope,
  resolveRoleManagementFloorForUser,
} from './role_management_scope.js'

/**
 * Guarda de alcance para lo que se registra sobre un día del pasado.
 *
 * La captura de checadas ya tenía su tope por rol. Las excepciones de turno y
 * los cambios de turno escriben igual sobre una fecha concreta y no lo tenían:
 * el backoffice dejaba de ofrecer el botón, pero el endpoint seguía aceptando
 * cualquier fecha. Esta guarda cierra eso con la misma regla.
 *
 * La fecha se juzga en la zona del sitio del colaborador afectado, que es donde
 * su jornada empieza, y no en la del servidor ni en la de quien captura.
 */

/** Cuerpo de respuesta listo para devolver desde el controlador. */
export interface DayScopeRejection {
  status: number
  body: {
    type: 'warning'
    title: string
    message: string
    detail: string
    key: string
    code: string
  }
}

/** Clave estable del rechazo, para que el cliente lo distinga del resto. */
const REJECTION_KEY = 'fecha-fuera-del-alcance-del-rol'
/** Base de las cadenas traducidas del rechazo. */
const I18N_BASE = 'role_scope_day_out_of_range'

/**
 * Verifica que el día quede dentro de los días que el rol puede modificar.
 *
 * @param params.user - Cuenta que ejecuta la operación.
 * @param params.employeeId - Colaborador afectado, dueño de la zona del sitio.
 * @param params.day - Fecha del registro, en cualquier forma que Luxon lea.
 * @param params.i18n - Traductor de la petición.
 * @param params.now - Instante de la operación. Por omisión, ahora.
 * @returns El rechazo cuando la fecha excede el alcance, o `null` si procede.
 */
export async function assertDayWithinRoleScope(params: {
  user: User | null | undefined
  employeeId: number | null | undefined
  day: string | Date | DateTime | null | undefined
  i18n: I18n
  now?: DateTime
}): Promise<DayScopeRejection | null> {
  const dayIso = toDayIso(params.day)
  if (!dayIso || !params.employeeId) return null

  const now = params.now ?? DateTime.utc()
  const siteZone = await new SiteTimeZoneService().forEmployee(params.employeeId)
  const floor = await resolveRoleManagementFloorForUser({
    user: params.user,
    zone: siteZone.zone,
    now,
  })

  if (isDayWithinRoleManagementScope(dayIso, floor, siteZone.zone)) return null

  const detail = params.i18n.t(`${I18N_BASE}_message`, undefined, REJECTION_KEY)

  return {
    status: 422,
    body: {
      type: 'warning',
      title: params.i18n.t(`${I18N_BASE}_title`, undefined, REJECTION_KEY),
      message: detail,
      detail,
      key: REJECTION_KEY,
      code: ROLE_SCOPE_ERROR_CODES.VAL_DAY_OUT_OF_ROLE_SCOPE,
    },
  }
}

/**
 * Normaliza a `YYYY-MM-DD` la fecha que cada endpoint recibe en su formato.
 *
 * Devuelve `null` cuando no hay fecha o es ilegible: la guarda no es quien
 * valida la forma del dato, y bloquear ahí escondería el error real que el
 * validador del endpoint sí sabe explicar.
 *
 * @param value - Fecha tal como llega del payload.
 */
function toDayIso(value: string | Date | DateTime | null | undefined): string | null {
  if (!value) return null

  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toUTC().toISODate()
  }
  if (DateTime.isDateTime(value)) {
    return value.toUTC().toISODate()
  }

  const parsed = DateTime.fromISO(value, { zone: 'utc' })
  if (parsed.isValid) return parsed.toISODate()

  const fallback = DateTime.fromJSDate(new Date(value))
  return fallback.isValid ? fallback.toUTC().toISODate() : null
}

/**
 * Misma verificación sobre varios colaboradores a la vez.
 *
 * La aplicación masiva de excepciones escribe una sola fecha sobre muchas
 * personas, y cada una puede trabajar en un sitio con zona distinta. Se rechaza
 * en cuanto una queda fuera: la acción es una sola y aplicarla a medias dejaría
 * al usuario sin saber a quién alcanzó.
 *
 * @param params.user - Cuenta que ejecuta la operación.
 * @param params.employeeIds - Colaboradores afectados.
 * @param params.day - Fecha del registro.
 * @param params.i18n - Traductor de la petición.
 * @param params.now - Instante de la operación. Por omisión, ahora.
 * @returns El rechazo cuando la fecha excede el alcance, o `null` si procede.
 */
export async function assertDayWithinRoleScopeForEmployees(params: {
  user: User | null | undefined
  employeeIds: number[]
  day: string | Date | DateTime | null | undefined
  i18n: I18n
  now?: DateTime
}): Promise<DayScopeRejection | null> {
  const dayIso = toDayIso(params.day)
  if (!dayIso || params.employeeIds.length === 0) return null

  const now = params.now ?? DateTime.utc()
  const zones = await new SiteTimeZoneService().forEmployees(params.employeeIds)

  // El piso depende del rol y de la zona, así que se calcula una vez por zona
  // distinta y no una por colaborador.
  const distinctZones = new Set([...zones.values()].map((site) => site.zone))

  for (const zone of distinctZones) {
    const floor = await resolveRoleManagementFloorForUser({ user: params.user, zone, now })
    if (!isDayWithinRoleManagementScope(dayIso, floor, zone)) {
      const detail = params.i18n.t(`${I18N_BASE}_message`, undefined, REJECTION_KEY)
      return {
        status: 422,
        body: {
          type: 'warning',
          title: params.i18n.t(`${I18N_BASE}_title`, undefined, REJECTION_KEY),
          message: detail,
          detail,
          key: REJECTION_KEY,
          code: ROLE_SCOPE_ERROR_CODES.VAL_DAY_OUT_OF_ROLE_SCOPE,
        },
      }
    }
  }

  return null
}
