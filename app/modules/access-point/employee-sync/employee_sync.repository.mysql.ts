import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { AdmsError } from '#exceptions/adms_error'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import AccessPointEmployee from '#models/access_point_employee'
import {
  ACCESS_POINT_EMPLOYEE_SYNC_STATUS,
  type AccessPointEmployeeSyncStatus,
} from '#models/access_point_employee'
import AccessPointEmployeeEvent from '#models/access_point_employee_event'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'
import { TenantContext } from '#utils/tenant_context'
import { canTransition, PIN_QUARANTINE_STATUSES } from './employee_sync_state.js'
import type { EmployeeSyncRepository, SyncEventInput } from './employee_sync.repository.js'

/**
 * Lectura del espacio de PIN de un aparato, sin filtro de empresa.
 *
 * En un checador compartido (VLRH-P0065) el numero lo ocupan todas las
 * empresas que lo usan o lo usaron: tambien una invitada ya revocada cuya baja
 * el aparato aun no confirma. Con el mixin, el scope del que pregunta dejaba
 * fuera esos vinculos y el numero se daba por libre. La consulta se cierra
 * dentro del bypass: un builder sin ejecutar correria fuera de el (M12).
 */
function pinSpaceOf<T>(read: () => Promise<T>): Promise<T> {
  return TenantContext.runUnscoped(read, TENANT_UNSCOPED_REASON.ACCESS_POINT_SHARING)
}

/**
 * El indice unico de la base rechazo el numero.
 *
 * Es la red de seguridad frente a la carrera que el candado del aparato no cubre: el canal
 * crea pivotes por su cuenta cuando ve un PIN suelto. Se traduce a un conflicto
 * legible en lugar de dejar salir un error interno.
 */
function isDuplicatePin(error: unknown): boolean {
  return (error as { code?: string })?.code === 'ER_DUP_ENTRY'
}

/** Adaptador Lucid del pivote empleado por dispositivo. */
export default class EmployeeSyncRepositoryMysql implements EmployeeSyncRepository {
  /**
   * Transaccion con la fila del aparato bloqueada (`FOR UPDATE`).
   *
   * Hubo un cerrojo con nombre (`GET_LOCK`) para las altas: el insert del
   * pivote se hacia desde otra conexion y esperaba por la llave foranea el
   * candado que tenia la propia transaccion del cerrojo. Hoy todo lo que lee
   * y escribe la operacion va por `trx`, asi que la fila del aparato basta
   * para serializar a todos los que escriben PIN, con una sola conexion por
   * operacion.
   */
  async inDeviceTransaction<T>(
    accessPointId: number,
    fn: (trx: TransactionClientContract) => Promise<T>
  ): Promise<T> {
    return db.transaction(async (trx) => {
      // Constructor crudo sobre `trx`: sin mixin, la fila se bloquea aunque sea de otra empresa.
      await trx
        .from('access_points')
        .where('access_point_id', accessPointId)
        .select('access_point_id')
        .forUpdate()
        .first()
      return fn(trx)
    })
  }

  async findPivot(
    accessPointId: number,
    employeeId: number,
    trx?: TransactionClientContract
  ): Promise<AccessPointEmployee | null> {
    return AccessPointEmployee.query(trx ? { client: trx } : undefined)
      .where('access_point_id', accessPointId)
      .where('employee_id', employeeId)
      .first()
  }

  async findPivotWithTrashed(
    accessPointId: number,
    employeeId: number,
    trx?: TransactionClientContract
  ): Promise<AccessPointEmployee | null> {
    return AccessPointEmployee.query(trx ? { client: trx } : undefined)
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
  async findByPin(
    accessPointId: number,
    pin: string,
    trx?: TransactionClientContract
  ): Promise<AccessPointEmployee[]> {
    // El PIN es del aparato, no de una empresa: ver `pinSpaceOf`.
    return pinSpaceOf(() =>
      AccessPointEmployee.query(trx ? { client: trx } : undefined)
        .withTrashed()
        .where('access_point_id', accessPointId)
        .where('access_point_employee_pin', pin)
        .where((group) => {
          group
            .whereNull('access_point_employee_deleted_at')
            .orWhereIn('access_point_employee_sync_status', [...PIN_QUARANTINE_STATUSES])
        })
        .exec()
    )
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

  async listTakenPins(
    accessPointId: number,
    exceptPivotId?: number,
    trx?: TransactionClientContract
  ): Promise<string[]> {
    const query = AccessPointEmployee.query(trx ? { client: trx } : undefined)
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

    // El PIN es del aparato, no de una empresa: ver `pinSpaceOf`.
    const rows = await pinSpaceOf(() => query.select('access_point_employee_pin').exec())

    return rows.map((row) => row.accessPointEmployeePin).filter((pin) => pin.length > 0)
  }

  async listLiveByEmployee(employeeId: number): Promise<AccessPointEmployee[]> {
    return AccessPointEmployee.query().where('employee_id', employeeId)
  }

  async save(pivot: AccessPointEmployee, trx?: TransactionClientContract): Promise<void> {
    if (trx) pivot.useTransaction(trx)
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

  async recordEvent(input: SyncEventInput, trx?: TransactionClientContract): Promise<void> {
    const event = new AccessPointEmployeeEvent()
    if (trx) event.useTransaction(trx)
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

  async detach(pivot: AccessPointEmployee, trx?: TransactionClientContract): Promise<void> {
    // SoftDeletes: conserva el historial. Con `trx` (o si se leyo con ella), borra en ella.
    if (trx) pivot.useTransaction(trx)
    await pivot.delete()
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

    /**
     * La maquina decide, tambien cuando quien empuja es el canal.
     *
     * Esta via la usan el despacho y el acuse, que hasta ahora escribian el
     * estado a ciegas: un `user_upsert` rezagado --uno que salio antes de la
     * baja y llego despues-- movia el pivote de `revoked` a `sent` y luego a
     * `confirmed`, dejando dentro del checador a quien acababa de salir. Un
     * comando que llega tarde no puede deshacer un estado terminal; se ignora
     * y quien llama decide si eso merece aviso.
     */
    if (
      pivot.accessPointEmployeeSyncStatus !== status &&
      !canTransition(pivot.accessPointEmployeeSyncStatus, status)
    ) {
      return null
    }

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
