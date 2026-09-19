import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import ExceptionRequest from '#models/exception_request'
import type { ExceptionRequestErrorInterface } from '../interfaces/exception_request_error_interface.js'

/** Datos con los que se levanta una peticion de permiso de uno o varios dias. */
export interface CreateExceptionRequestsParams {
  /** Colaborador al que se le registra el permiso. */
  employeeId: number
  /** Tipo de permiso pedido. */
  exceptionTypeId: number
  /** Estatus inicial. La rama de autoservicio siempre manda `pending`. */
  exceptionRequestStatus: 'pending' | 'accepted' | 'refused'
  /** Motivo con las palabras de quien pide. */
  exceptionRequestDescription?: string
  /** Hora de entrada, cuando el tipo la pide. */
  exceptionRequestCheckInTime?: string | null
  /** Hora de salida, cuando el tipo la pide. */
  exceptionRequestCheckOutTime?: string | null
  /** Horas que cubre el permiso, cuando el tipo trabaja por horas. */
  exceptionRequestPeriodInHours?: number | null
  /** Primer dia pedido. */
  requestedDate: DateTime
  /** Dias consecutivos, contando el primero. */
  daysToApply: number
  /** Usuario que levanta la peticion. */
  userId: number
  /**
   * Verdadero cuando quien levanta la peticion es Recursos Humanos: entonces la
   * solicitud nace leida por RH y pendiente de lectura gerencial. Es la marca
   * que alimenta los contadores de no leidas del backoffice.
   */
  createdByHr: boolean
}

/** Resultado del alta: lo que quedo guardado y lo que no. */
export interface CreateExceptionRequestsResult {
  /** Lote que comparten las solicitudes creadas en esta llamada. */
  batchId: string
  /** Solicitudes efectivamente creadas, una por dia aceptado. */
  saved: ExceptionRequest[]
  /** Dias que no se pudieron registrar, con su motivo. */
  errors: ExceptionRequestErrorInterface[]
}

/**
 * Alta de solicitudes de permiso.
 *
 * Un permiso de varios dias se guarda como una solicitud por dia. No es un
 * detalle de implementacion: es lo que permite que la empresa autorice unos
 * dias y rechace otros de la misma peticion. Todas las filas comparten un
 * `batchId` que dice de donde vinieron —sirve para avisar una sola vez al
 * aprobador y para colgar el comprobante de todos los dias—, pero ese lote
 * nunca decide nada sobre la resolucion.
 *
 * El servicio no valida permisos ni pertenencia: eso lo hace el controlador,
 * que es quien conoce el alcance de la peticion y quien decide si el alta es de
 * autoservicio o a nombre de un tercero.
 */
export default class ExceptionRequestCreationService {
  /**
   * Crea una solicitud por cada dia pedido.
   *
   * Un dia que choca con una solicitud viva del mismo colaborador no detiene a
   * los demas: se reporta en `errors` y el resto sigue. Quien pide cinco dias y
   * ya tenia el tercero solicitado se queda con cuatro, no con cero.
   *
   * @param params - Datos del permiso y dias que cubre.
   * @returns El lote, las solicitudes creadas y los dias rechazados.
   */
  async create(params: CreateExceptionRequestsParams): Promise<CreateExceptionRequestsResult> {
    const batchId = randomUUID()
    const saved: ExceptionRequest[] = []
    const errors: ExceptionRequestErrorInterface[] = []

    for (let indice = 0; indice < params.daysToApply; indice += 1) {
      const fecha = params.requestedDate.plus({ days: indice }).toISODate()

      // Una fecha que no se puede escribir se reporta. Antes se saltaba en
      // silencio, y el alta respondia 201 sin nada guardado y sin un solo
      // motivo: el cliente no tenia como distinguir eso de un dia ocupado.
      if (!fecha) {
        errors.push({
          requestedDate: null,
          error: 'The requested date could not be interpreted',
          reason: 'invalid-date',
        })
        continue
      }

      try {
        if (await this.tieneSolicitudViva(params.employeeId, fecha)) {
          errors.push({
            requestedDate: fecha,
            error:
              'An exception request for the same date and time already exists and is not refused',
            reason: 'duplicate',
          })
          continue
        }

        const solicitud = await ExceptionRequest.create({
          exceptionRequestBatchId: batchId,
          employeeId: params.employeeId,
          exceptionTypeId: params.exceptionTypeId,
          exceptionRequestStatus: params.exceptionRequestStatus,
          exceptionRequestDescription: params.exceptionRequestDescription,
          exceptionRequestCheckInTime: params.exceptionRequestCheckInTime,
          exceptionRequestCheckOutTime: params.exceptionRequestCheckOutTime,
          exceptionRequestPeriodInHours: params.exceptionRequestPeriodInHours,
          requestedDate: fecha,
          exceptionRequestRhRead: params.createdByHr ? 1 : 0,
          exceptionRequestGerencialRead: params.createdByHr ? 0 : 1,
          userId: params.userId,
        })

        saved.push(solicitud)
      } catch (error: unknown) {
        // El mensaje va al log completo: al cliente se le devuelve para que
        // sepa que el dia no entro, pero el motivo tecnico de un INSERT que
        // falla se diagnostica aqui, no en el telefono del colaborador.
        logger.error('[exception-request-creation] No se pudo crear el dia', {
          employeeId: params.employeeId,
          exceptionTypeId: params.exceptionTypeId,
          requestedDate: fecha,
          error: error instanceof Error ? error.message : String(error),
        })

        errors.push({
          requestedDate: fecha,
          error: error instanceof Error ? error.message : String(error),
          reason: 'error',
        })
      }
    }

    return { batchId, saved, errors }
  }

  /**
   * Verdadero si el colaborador ya tiene una solicitud sin rechazar ese dia.
   *
   * Una rechazada no estorba: es justamente el caso de quien vuelve a pedir el
   * mismo dia con otro motivo. Una borrada tampoco: el borrado logico es como
   * se retira una solicitud, y si siguiera bloqueando la fecha, retirarla
   * dejaria al colaborador sin poder volver a pedir ese dia nunca. El resto del
   * modulo ya filtra por `exception_request_deleted_at`; esta consulta era la
   * unica que no lo hacia.
   */
  private async tieneSolicitudViva(employeeId: number, fecha: string): Promise<boolean> {
    const existente = await ExceptionRequest.query()
      .where('employee_id', employeeId)
      .where('requested_date', fecha)
      .whereNot('exception_request_status', 'refused')
      .whereNull('exception_request_deleted_at')
      .first()

    return existente !== null
  }
}
