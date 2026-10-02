import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import Employee from '#models/employee'
import type User from '#models/user'
import VacationSetting from '#models/vacation_setting'
import { EMPLOYEE_VACATION_PERIOD_ERROR_CODES } from '#constants/employee_vacation_period_error_codes'
import SiteTimeZoneService from '#modules/attendance-time/site_time_zone.service'
import SystemSettingService from '#services/system_setting_service'
import { vacationPeriodDates } from './vacation_period_dates.js'

/**
 * Regla de la empresa "no adelantar vacaciones".
 *
 * Con `system_setting_restrict_future_vacation` activo no se registran días en
 * un período que todavía no inicia: sus días se ganan en el aniversario que lo
 * abre, y antes de eso no existen. El backoffice deshabilita el botón, pero la
 * regla vive aquí para que ningún cliente la brinque, y la comparten el alta
 * directa y la autorización de solicitudes.
 *
 * Root no está sujeto a la regla, igual que en el gestor anterior.
 */

/** Cuerpo de respuesta listo para devolver desde el controlador. */
export interface FutureVacationRejection {
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
const REJECTION_KEY = 'periodo-de-vacaciones-no-iniciado'
/** Base de las cadenas traducidas del rechazo. */
const I18N_BASE = 'vacation_period_not_started'
const ROOT_ROLE_SLUG = 'root'

/**
 * Último día de inicio de período admitido para registrar vacaciones.
 *
 * @param params.user - Cuenta que ejecuta la operación.
 * @param params.employeeId - Colaborador; su sitio decide qué día es hoy.
 * @param params.now - Instante de la operación. Por omisión, ahora.
 * @returns Hoy (`yyyy-MM-dd`, zona del sitio) cuando la empresa restringe y la
 *   cuenta no es root; `null` cuando no hay restricción.
 */
export async function resolveFutureVacationCutoff(params: {
  user: User | null | undefined
  employeeId: number
  now?: DateTime
}): Promise<string | null> {
  if (params.user?.role?.roleSlug === ROOT_ROLE_SLUG) return null

  const setting = await new SystemSettingService().resolveForActiveTenant()
  if (Number(setting?.systemSettingRestrictFutureVacation ?? 0) !== 1) return null

  const siteZone = await new SiteTimeZoneService().forEmployee(params.employeeId)
  return (params.now ?? DateTime.utc()).setZone(siteZone.zone).toISODate()
}

/**
 * Inicio del período que otorga los días de un `vacation_setting`.
 *
 * El catálogo se elige por años cumplidos al abrir el período, así que el
 * período empieza en el aniversario número `yearsOfService`.
 *
 * @param hireDate - Fecha de ingreso.
 * @param yearsOfService - Años de servicio del catálogo.
 * @returns El inicio, `yyyy-MM-dd`.
 */
export function vacationSettingPeriodStart(hireDate: DateTime, yearsOfService: number): string {
  return vacationPeriodDates(hireDate, hireDate.year + yearsOfService).periodStartsAt
}

/**
 * Verifica que el período del registro ya haya iniciado cuando la empresa no
 * permite adelantar vacaciones.
 *
 * @param params.user - Cuenta que ejecuta la operación.
 * @param params.employeeId - Colaborador del registro.
 * @param params.vacationSettingId - Período del registro; sin él no hay nada que validar.
 * @param params.i18n - Traductor de la petición.
 * @param params.now - Instante de la operación. Por omisión, ahora.
 * @returns El rechazo cuando el período aún no inicia, o `null` si procede.
 */
export async function assertVacationPeriodStarted(params: {
  user: User | null | undefined
  employeeId: number | null | undefined
  vacationSettingId: number | null | undefined
  i18n: I18n
  now?: DateTime
}): Promise<FutureVacationRejection | null> {
  if (!params.employeeId || !params.vacationSettingId) return null

  const cutoff = await resolveFutureVacationCutoff({
    user: params.user,
    employeeId: params.employeeId,
    now: params.now,
  })
  if (!cutoff) return null

  const [employee, setting] = await Promise.all([
    Employee.find(params.employeeId),
    VacationSetting.find(params.vacationSettingId),
  ])
  if (!employee?.employeeHireDate || !setting) return null

  const hireDate = DateTime.fromISO(employee.employeeHireDate.toString())
  if (!hireDate.isValid) return null

  const startsAt = vacationSettingPeriodStart(hireDate, setting.vacationSettingYearsOfService)
  if (startsAt <= cutoff) return null

  const startsAtLabel = DateTime.fromISO(startsAt)
    .setLocale(params.i18n.locale)
    .toLocaleString(DateTime.DATE_FULL)
  const detail = params.i18n.t(
    `${I18N_BASE}_message`,
    { startsAt: startsAtLabel },
    REJECTION_KEY
  )
  return {
    status: 422,
    body: {
      type: 'warning',
      title: params.i18n.t(`${I18N_BASE}_title`, undefined, REJECTION_KEY),
      message: detail,
      detail,
      key: REJECTION_KEY,
      code: EMPLOYEE_VACATION_PERIOD_ERROR_CODES.VAL_PERIOD_NOT_STARTED,
    },
  }
}
