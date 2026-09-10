import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { AdmsError } from '#exceptions/adms_error'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import AccessPointEmployee from '#models/access_point_employee'
import {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
  type AccessPointEmployeeSyncStatus,
} from '#models/access_point_employee'
import AccessPointEmployeeEvent from '#models/access_point_employee_event'
import { PIN_QUARANTINE_STATUSES } from './employee_sync_state.js'
import type { EmployeeSyncRepository, SyncEventInput } from './employee_sync.repository.js'

/** Prefijo del cerrojo por equipo. Con nombre, no sobre una fila. */
const DEVICE_LOCK_PREFIX = 'valanserh:access-point:'

/**
 * Espera maxima por el cerrojo. Cinco segundos: una alta tarda milisegundos, y
 * quedarse mas tiempo significa que algo esta atorado, no que haya cola.
 */
const DEVICE_LOCK_TIMEOUT_SECONDS = 5

/**
 * El indice unico de la base rechazo el numero.
 *
 * Es la red de seguridad frente a la carrera que el cerrojo no cubre: el canal
 * crea pivotes por su cuenta cuando ve un PIN suelto. Se traduce a un conflicto
 * legible en lugar de dejar salir un error interno.
 */
function isDuplicatePin(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ER_DUP_ENTRY'
}

/** Adaptador Lucid del pivote empleado por dispositivo. */
export default class EmployeeSyncRepositoryMysql implements EmployeeSyncRepository {
  /**
   * Serializa las altas de un mismo equipo con un cerrojo con nombre.
   *
   * Antes bloqueaba la fila de `access_points` con `FOR UPDATE`. Dejo de
   * servir cuando `access_point_employees` gano su llave foranea hacia esa
   * tabla: al insertar el pivote, InnoDB pide un candado compartido sobre la
   * fila padre, y esa fila la tenia tomada en exclusiva la propia transaccion
   * del cerrojo. El alta se quedaba esperandose a si misma hasta el tiempo
   * limite -- no fallaba, se colgaba, que es peor.
   *
   * `GET_LOCK` cumple lo mismo sin tocar ninguna fila: es un nombre, no un
   * registro, asi que ninguna llave foranea lo cruza. La transaccion se
   * conserva solo para fijar la conexion, porque el cerrojo vive en ella.
   */
  async withDeviceLock<T>(accessPointId: number, fn: () => Promise<T>): Promise<T> {
    const name = `${DEVICE_LOCK_PREFIX}${accessPointId}`
    return db.transaction(async (trx) => {
      const result = await trx.rawQuery('SELECT GET_LOCK(?, ?) AS obtained', [
        name,
        DEVICE_LOCK_TIMEOUT_SECONDS,
      ])
      const obtained = Number(result?.[0]?.[0]?.obtained ?? 0)
      if (obtained !== 1) {
        throw new AdmsError(
          'El equipo esta ocupado con otra alta',
          ADMS_ERROR_CODES.SYS_INTERNAL,
          409,
          'equipo-ocupado',
          'Otra operacion sobre este checador sigue en curso. Intenta de nuevo en unos segundos.'
        )
      }
      try {
        return await fn()
      } finally {
        await trx.rawQuery('SELECT RELEASE_LOCK(?)', [name])
      }
    })
  }

  async findPivot(accessPointId: number, employeeId: number): Promise<AccessPointEmployee | null> {
    return AccessPointEmployee.query()
      .where('access_point_id', accessPointId)
      .where('employee_id', employeeId)
      .first()
  }

  async findPivotWithTrashed(
    accessPointId: number,
    employeeId: number
  ): Promise<AccessPointEmployee | null> {
    return AccessPointEmployee.query()
      .withTrashed()
      .where('access_point_id', accessPointId)
      .where('employee_id', employeeId)
      .first()
  }

  /**
   * Quien ocupa ese PIN en el equipo.
   *
   * Cuenta toda fila viva -- tambien la de una baja ya confirmada, porque el
   * numero no se recicla -- y ademas las de cuarentena aunque su asignacion se
   * haya borrado logicamente, que es cuando el aparato todavia no aplica la
   * baja.
   */
  async findByPin(accessPointId: number, pin: string): Promise<AccessPointEmployee[]> {
    return AccessPointEmployee.query()
      .withTrashed()
      .where('access_point_id', accessPointId)
      .where('access_point_employee_pin', pin)
      .where((group) => {
        group
          .whereNull('access_point_employee_deleted_at')
          .orWhereIn('access_point_employee_sync_status', [...PIN_QUARANTINE_STATUSES])
      })
  }

  async countConfirmedBefore(accessPointId: number, at: DateTime): Promise<number> {
    const rows = await AccessPointEmployee.query()
      .where('access_point_id', accessPointId)
      .where('access_point_employee_sync_status', ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED)
      .where((group) => {
        group
          .whereNull('access_point_employee_sync_confirmed_at')
          .orWhere(
            'access_point_employee_sync_confirmed_at',
            '<=',
            at.toSQL({ includeOffset: false }) ?? ''
          )
      })
      .count('* as total')

    return Number(rows[0].$extras.total ?? 0)
  }

  async listTakenPins(accessPointId: number, exceptPivotId?: number): Promise<string[]> {
    const query = AccessPointEmployee.query()
      .withTrashed()
      .where('access_point_id', accessPointId)
      .whereNot('access_point_employee_pin', '')
      .where((group) => {
        group
          .whereNull('access_point_employee_deleted_at')
          .orWhereIn('access_point_employee_sync_status', [...PIN_QUARANTINE_STATUSES])
      })

    /** Su propio vinculo no le quita su numero a nadie, menos a el mismo. */
    if (exceptPivotId !== undefined) {
      query.whereNot('access_point_employee_id', exceptPivotId)
    }

    const rows = await query.select('access_point_employee_pin')

    return rows.map((row) => row.accessPointEmployeePin).filter((pin) => pin.length > 0)
  }

  async listLiveByEmployee(employeeId: number): Promise<AccessPointEmployee[]> {
    return AccessPointEmployee.query().where('employee_id', employeeId)
  }

  async save(pivot: AccessPointEmployee): Promise<void> {
    try {
      await pivot.save()
      return
    } catch (error) {
      if (!isDuplicatePin(error)) throw error
      throw new AdmsError(
        'Ese PIN ya esta ocupado en este equipo',
        ADMS_ERROR_CODES.PIN_TAKEN,
        409,
        'pin-ocupado',
        'Otra operacion tomo ese numero primero. Intenta de nuevo para que se elija el siguiente libre.'
      )
    }
  }

  async recordEvent(input: SyncEventInput): Promise<void> {
    const event = new AccessPointEmployeeEvent()
    event.accessPointEmployeeId = input.accessPointEmployeeId
    event.businessUnitId = input.businessUnitId
    event.accessPointEmployeeEventKind = input.kind
    event.accessPointEmployeeEventFromStatus = input.fromStatus ?? null
    event.accessPointEmployeeEventToStatus = input.toStatus ?? null
    event.accessPointEmployeeEventFromPin = input.fromPin ?? null
    event.accessPointEmployeeEventToPin = input.toPin ?? null
    event.accessPointEmployeeEventActorUserId = input.actorUserId ?? null
    event.deviceCommandId = input.deviceCommandId ?? null
    event.accessPointEmployeeEventDetail = input.detail ?? null
    await event.save()
  }

  async findByCommandTarget(accessPointEmployeeId: number): Promise<AccessPointEmployee | null> {
    return AccessPointEmployee.query()
      .withTrashed()
      .where('access_point_employee_id', accessPointEmployeeId)
      .first()
  }

  async updateStatus(
    accessPointEmployeeId: number,
    status: AccessPointEmployeeSyncStatus
  ): Promise<AccessPointEmployee | null> {
    const pivot = await this.findByCommandTarget(accessPointEmployeeId)
    if (!pivot) return null
    pivot.accessPointEmployeeSyncStatus = status
    if (status === 'sent') pivot.accessPointEmployeeSyncSentAt = DateTime.utc()
    if (status === 'confirmed') pivot.accessPointEmployeeSyncConfirmedAt = DateTime.utc()
    if (status === 'failed' || status === 'revoke_failed') {
      pivot.accessPointEmployeeSyncFailedAt = DateTime.utc()
    }
    await pivot.save()
    return pivot
  }
}
