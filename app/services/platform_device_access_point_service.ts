import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import logger from '@adonisjs/core/services/logger'
import AccessPoint from '#models/access_point'
import { TenantContext } from '#utils/tenant_context'
import { PLATFORM_DEVICE_ACCESS_POINT_RUN_UNSCOPED_REASON } from '../constants/platform_device_access_point.js'
import { PLATFORM_DEVICE_ERROR_CODES } from '../constants/platform_device_error_codes.js'
import { PlatformDeviceServiceError } from '../exceptions/platform_device_service_error.js'

export type AccessPointPreloadOutcome = 'created' | 'adopted'

export interface PreloadAccessPointInput {
  /** Tenant que recibe la unidad, resuelto desde tenantPublicId. Nunca del request. */
  businessUnitId: number
  platformDeviceId: number
  serialNumber: string | null
  /** Nombre del modelo del catálogo, para el nombre inicial propuesto. */
  modelName: string
  trx: TransactionClientContract
}

export interface PreloadedAccessPoint {
  accessPointId: number
  accessPointName: string
  accessPointSerialNumber: string | null
}

export interface PreloadAccessPointResult {
  outcome: AccessPointPreloadOutcome
  accessPoint: PreloadedAccessPoint
}

/**
 * Precarga el punto de acceso del tenant al asignarle una unidad del
 * inventario de plataforma (USRH1787189981879 · §10 del spec).
 *
 * Crea o adopta la fila de `access_points` del tenant, amarrándola a la
 * unidad por `platformDeviceId`. Debe invocarse **dentro** de la transacción
 * de `PlatformDeviceAssignmentService.createAssignment`, después de tomar el
 * `.forUpdate()` sobre `platform_devices`: si esta escritura falla, toda la
 * asignación revierte (CA-4).
 */
export default class PlatformDeviceAccessPointService {
  /**
   * @throws PlatformDeviceServiceError 422 — unidad sin número de serie.
   * @throws PlatformDeviceServiceError 409 — serie viva en otro tenant (colisión real o auto-descubrimiento).
   * @throws PlatformDeviceServiceError 500 — falla no tipada al materializar el access_point.
   */
  async preload(input: PreloadAccessPointInput): Promise<PreloadAccessPointResult> {
    return TenantContext.runUnscoped(
      () => this.preloadWithin(input),
      PLATFORM_DEVICE_ACCESS_POINT_RUN_UNSCOPED_REASON
    )
  }

  private async preloadWithin(input: PreloadAccessPointInput): Promise<PreloadAccessPointResult> {
    const { businessUnitId, platformDeviceId, modelName, trx } = input
    const serial = input.serialNumber?.trim()

    if (!serial) {
      throw new PlatformDeviceServiceError(
        'La unidad no tiene número de serie registrado',
        PLATFORM_DEVICE_ERROR_CODES.DEVICE_SERIAL_MISSING,
        422,
        PLATFORM_DEVICE_ERROR_CODES.DEVICE_SERIAL_MISSING,
        'La unidad no tiene un número de serie registrado; no se puede precargar el punto de acceso del cliente.'
      )
    }

    try {
      // Búsqueda deliberadamente global (sin filtro de tenant): es lo que
      // detecta la colisión entre empresas. NO se usa
      // AccessPointService.findBySerialNumber porque no acepta `trx`.
      const existing = await AccessPoint.query({ client: trx })
        .whereNull('access_point_deleted_at')
        .where('access_point_serial_number', serial)
        .first()

      if (existing) {
        return await this.resolveExisting(existing, businessUnitId, platformDeviceId, trx)
      }

      return await this.createNew(businessUnitId, platformDeviceId, serial, modelName, trx)
    } catch (error) {
      if (error instanceof PlatformDeviceServiceError) {
        throw error
      }
      throw new PlatformDeviceServiceError(
        'Falló la materialización del punto de acceso del tenant',
        PLATFORM_DEVICE_ERROR_CODES.ACCESS_POINT_PRELOAD_FAILED,
        500,
        PLATFORM_DEVICE_ERROR_CODES.ACCESS_POINT_PRELOAD_FAILED,
        'No fue posible registrar el equipo del lado del cliente. La entrega no se completó.'
      )
    }
  }

  /**
   * La fila ya existe (capturada por el cliente o creada por el anuncio
   * automático del aparato — el origen no cambia la decisión, RN10).
   */
  private async resolveExisting(
    existing: AccessPoint,
    businessUnitId: number,
    platformDeviceId: number,
    trx: TransactionClientContract
  ): Promise<PreloadAccessPointResult> {
    if (existing.businessUnitId !== businessUnitId) {
      // El tenant real de la colisión nunca se revela al cliente (RN9);
      // queda solo en el log del servidor.
      logger.warn(
        {
          serialNumber: existing.accessPointSerialNumber,
          occupantBusinessUnitId: existing.businessUnitId,
          occupantAccessPointId: existing.accessPointId,
          requestedBusinessUnitId: businessUnitId,
          likelyAutodiscovery: existing.platformDeviceId === null,
        },
        'Precarga de punto de acceso: serie ya registrada en otro tenant'
      )

      if (existing.platformDeviceId) {
        throw new PlatformDeviceServiceError(
          'Serie ya registrada como punto de acceso en otro tenant',
          PLATFORM_DEVICE_ERROR_CODES.SERIAL_TAKEN_BY_OTHER_TENANT,
          409,
          PLATFORM_DEVICE_ERROR_CODES.SERIAL_TAKEN_BY_OTHER_TENANT,
          'El número de serie ya está registrado como punto de acceso en otra empresa. Revisar la discrepancia antes de continuar.'
        )
      }

      throw new PlatformDeviceServiceError(
        'Serie ya registrada por auto-descubrimiento en otro tenant',
        PLATFORM_DEVICE_ERROR_CODES.SERIAL_TAKEN_BY_AUTODISCOVERY,
        409,
        PLATFORM_DEVICE_ERROR_CODES.SERIAL_TAKEN_BY_AUTODISCOVERY,
        'El número de serie parece haber sido registrado automáticamente por el propio equipo al conectarse, en otra empresa. Revisarlo en el tablero de discrepancias antes de continuar.'
      )
    }

    // Adopción idempotente: SOLO se puebla platformDeviceId. Nada del
    // cliente (nombre, IP, MAC, activo) se toca, sin importar si la fila
    // nació de su captura o del anuncio automático (RN2, RN10, CA-9).
    existing.useTransaction(trx)
    existing.platformDeviceId = platformDeviceId
    await existing.save()

    return {
      outcome: 'adopted',
      accessPoint: {
        accessPointId: existing.accessPointId,
        accessPointName: existing.accessPointName,
        accessPointSerialNumber: existing.accessPointSerialNumber,
      },
    }
  }

  private async createNew(
    businessUnitId: number,
    platformDeviceId: number,
    serial: string,
    modelName: string,
    trx: TransactionClientContract
  ): Promise<PreloadAccessPointResult> {
    const created = new AccessPoint()
    created.useTransaction(trx)
    created.businessUnitId = businessUnitId
    created.accessPointSerialNumber = serial
    created.accessPointDeviceName = modelName
    created.accessPointName = `${modelName} · ${serial.slice(-4)}`
    created.accessPointActive = 1
    created.accessPointStatus = 0
    created.platformDeviceId = platformDeviceId
    await created.save()

    return {
      outcome: 'created',
      accessPoint: {
        accessPointId: created.accessPointId,
        accessPointName: created.accessPointName,
        accessPointSerialNumber: created.accessPointSerialNumber,
      },
    }
  }
}
