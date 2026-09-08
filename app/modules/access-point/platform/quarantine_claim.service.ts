import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import AccessPoint from '#models/access_point'
import AdmsQuarantinedDevice from '#models/adms_quarantined_device'
import BusinessUnit from '#models/business_unit'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceService from '#services/platform_device_service'
import PlatformDeviceAssignmentService from '#services/platform_device_assignment_service'
import { PLATFORM_DEVICE_ERROR_CODES } from '#constants/platform_device_error_codes'
import { PlatformDeviceServiceError } from '#exceptions/platform_device_service_error'
import { TenantContext } from '#utils/tenant_context'

const UNSCOPED_REASON =
  'reclamo de cuarentena: la fila no pertenece a ninguna empresa hasta que se asigna'

export interface ClaimFromQuarantineInput {
  quarantinedDeviceId: number
  tenantPublicId: string
  platformDeviceModelId: number
  deliveredAt: Date
  createdByUserId: number | null
  now?: DateTime
}

export interface ClaimFromQuarantineResult {
  quarantinedDeviceId: number
  serialNumber: string
  platformDeviceId: number
  platformDeviceAssignmentId: number
  accessPointId: number
  accessPointName: string
  /** `created` si el punto de acceso nacio aqui, `adopted` si ya existia. */
  accessPointOutcome: 'created' | 'adopted'
  /** Verdadero si hubo que revivir una fila dada de baja con esa serie. */
  revivedDeletedAccessPoint: boolean
}

/**
 * Reclama un checador que aparecio solo y lo entrega a un cliente
 * (spec ADMS 9.3, re-alineado el 2026-09-08).
 *
 * El caso real: el cliente avisa que ya tiene el aparato, lo conecta, y como no
 * entro por nuestro inventario cae en cuarentena. Desde el panel se le asigna la
 * empresa y queda listo. El cliente NUNCA registra sus dispositivos: esto es
 * interno de GSTI.
 *
 * El aparato entra al inventario con `origin = 'del_cliente'`, que es lo que lo
 * distingue de nuestro stock: no lleva costo ni fecha de adquisicion, no cuenta
 * como existencia colocable, su regimen es `propiedad_cliente` y al devolverlo
 * se retira solo en vez de volver a nuestras existencias.
 */
export default class PlatformQuarantineClaimService {
  constructor(
    private readonly devices: PlatformDeviceService = new PlatformDeviceService(),
    private readonly assignments: PlatformDeviceAssignmentService = new PlatformDeviceAssignmentService()
  ) {}

  async claim(input: ClaimFromQuarantineInput): Promise<ClaimFromQuarantineResult> {
    const now = input.now ?? DateTime.utc()
    const row = await this.requirePendingRow(input.quarantinedDeviceId)
    const serial = row.admsQuarantinedDeviceSerial
    const tenant = await this.requireTenant(input.tenantPublicId)

    /**
     * Antes de nada: una fila dada de baja con esta serie la secuestra.
     *
     * `access_point_serial_number` es UNIQUE de una sola columna y no sabe de
     * `access_point_deleted_at`, y el borrado del backoffice no anula la serie.
     * La precarga filtra las borradas, asi que no la ve y va derecho a crear:
     * el INSERT choca contra la UNIQUE y sale un 500 que no explica nada.
     *
     * Revivirla aqui es lo correcto ademas de lo practico: es el MISMO aparato
     * volviendo, y conservar su fila conserva la explicacion de las checadas
     * que registro antes.
     */
    const revived = await this.reviveDeletedIfAny(serial, tenant.businessUnitId)

    const device = await this.createOrReuseDevice(serial, input.platformDeviceModelId)

    let assignment: Awaited<ReturnType<PlatformDeviceAssignmentService['createAssignment']>>
    try {
      assignment = await this.assignments.createAssignment({
        platformDeviceId: device.platformDeviceId,
        tenantPublicId: input.tenantPublicId,
        deliveredAt: input.deliveredAt,
        /** Forzado: un aparato del cliente no puede tener otro regimen. */
        tenureRegime: 'propiedad_cliente',
        createdByUserId: input.createdByUserId ?? undefined,
      })
    } catch (error) {
      /**
       * La asignacion abre su propia transaccion, asi que no se puede envolver
       * todo desde fuera sin cambiarle la firma. Se compensa: la unidad recien
       * creada se retira. Dejarla viva seria peor que no haberla creado -- un
       * `del_cliente` sin cliente contradice la regla de existencias.
       */
      await this.compensate(device, input.createdByUserId, now)
      throw error
    }

    await this.markClaimed(
      row,
      tenant.businessUnitId,
      assignment.accessPoint.accessPointId,
      input.createdByUserId,
      now
    )

    return {
      quarantinedDeviceId: row.admsQuarantinedDeviceId,
      serialNumber: serial,
      platformDeviceId: device.platformDeviceId,
      platformDeviceAssignmentId: assignment.assignmentId,
      accessPointId: assignment.accessPoint.accessPointId,
      accessPointName: assignment.accessPoint.accessPointName,
      accessPointOutcome: assignment.accessPointOutcome,
      revivedDeletedAccessPoint: revived,
    }
  }

  private async requirePendingRow(quarantinedDeviceId: number): Promise<AdmsQuarantinedDevice> {
    const row = await TenantContext.runUnscoped(
      () =>
        AdmsQuarantinedDevice.query()
          .where('adms_quarantined_device_id', quarantinedDeviceId)
          .first(),
      UNSCOPED_REASON
    )
    if (!row) {
      throw new PlatformDeviceServiceError(
        `Cuarentena ${quarantinedDeviceId} no encontrada`,
        PLATFORM_DEVICE_ERROR_CODES.QUARANTINE_NOT_FOUND,
        404,
        PLATFORM_DEVICE_ERROR_CODES.QUARANTINE_NOT_FOUND,
        'No se encontro ese equipo en espera.'
      )
    }
    /**
     * Solo `pending`. Una fila `claimed` ya tiene dueño y reclamarla otra vez
     * crearia una segunda unidad para el mismo aparato; una `dismissed` la
     * descarto alguien a proposito y revivirla en silencio borraria esa decision.
     */
    if (row.admsQuarantinedDeviceStatus !== 'pending') {
      throw new PlatformDeviceServiceError(
        `Cuarentena ${quarantinedDeviceId} en estado ${row.admsQuarantinedDeviceStatus}`,
        PLATFORM_DEVICE_ERROR_CODES.QUARANTINE_NOT_PENDING,
        409,
        PLATFORM_DEVICE_ERROR_CODES.QUARANTINE_NOT_PENDING,
        `Ese equipo ya no esta en espera: su estado es "${row.admsQuarantinedDeviceStatus}".`
      )
    }
    return row
  }

  private async requireTenant(tenantPublicId: string): Promise<BusinessUnit> {
    const tenant = await TenantContext.runUnscoped(
      () =>
        BusinessUnit.query()
          .where('business_unit_public_id', tenantPublicId)
          .whereNull('business_unit_deleted_at')
          .first(),
      UNSCOPED_REASON
    )
    if (tenant) return tenant
    throw new PlatformDeviceServiceError(
      `Tenant ${tenantPublicId} no encontrado`,
      PLATFORM_DEVICE_ERROR_CODES.TENANT_NOT_FOUND,
      404,
      PLATFORM_DEVICE_ERROR_CODES.TENANT_NOT_FOUND,
      'La empresa no existe en el sistema.'
    )
  }

  /** Ver el comentario del llamador: la UNIQUE de serie no sabe de bajas. */
  private async reviveDeletedIfAny(serial: string, businessUnitId: number): Promise<boolean> {
    return TenantContext.runUnscoped(async () => {
      const dead = await AccessPoint.query()
        .withTrashed()
        .whereNotNull('access_point_deleted_at')
        .where('access_point_serial_number', serial)
        .first()
      if (!dead) return false

      logger.info(
        {
          serialNumber: serial,
          accessPointId: dead.accessPointId,
          previousBusinessUnitId: dead.businessUnitId,
          businessUnitId,
        },
        'Reclamo de cuarentena: se revive el punto de acceso dado de baja que tenia esa serie'
      )
      dead.deletedAt = null
      dead.businessUnitId = businessUnitId
      dead.accessPointActive = 1
      await dead.save()
      return true
    }, UNSCOPED_REASON)
  }

  /**
   * Si la serie ya esta en el inventario -- porque alguien la dio de alta antes
   * de que el aparato llamara -- se reusa esa unidad en vez de duplicarla.
   */
  private async createOrReuseDevice(
    serial: string,
    modelId: number
  ): Promise<PlatformDevice> {
    const existing = await PlatformDevice.query()
      .where('platform_device_serial_number', serial)
      .whereNull('platform_device_deleted_at')
      .first()
    if (existing) return existing

    const created = await this.devices.create({
      platformDeviceSerialNumber: serial,
      platformDeviceModelId: modelId,
      /** Lo que lo distingue de nuestro stock. Sin costo ni fecha, por R6. */
      platformDeviceOrigin: 'del_cliente',
    })
    const device = await PlatformDevice.query()
      .where('platform_device_id', created.platformDeviceId)
      .firstOrFail()
    return device
  }

  private async compensate(
    device: PlatformDevice,
    userId: number | null,
    now: DateTime
  ): Promise<void> {
    try {
      device.platformDeviceStockStatus = 'retirada'
      device.platformDeviceRetireReason = 'del_cliente'
      device.platformDeviceRetiredAt = now.toFormat('yyyy-MM-dd')
      device.platformDeviceActive = 0
      await device.save()
      logger.warn(
        { platformDeviceId: device.platformDeviceId, userId },
        'Reclamo de cuarentena: la asignacion fallo y la unidad se retiro'
      )
    } catch (error) {
      logger.error(
        {
          platformDeviceId: device.platformDeviceId,
          error: (error as Error).message.slice(0, 200),
        },
        'Reclamo de cuarentena: no se pudo compensar la unidad creada'
      )
    }
  }

  private async markClaimed(
    row: AdmsQuarantinedDevice,
    businessUnitId: number,
    accessPointId: number | null,
    userId: number | null,
    now: DateTime
  ): Promise<void> {
    await TenantContext.runUnscoped(async () => {
      row.admsQuarantinedDeviceStatus = 'claimed'
      row.claimedBusinessUnitId = businessUnitId
      row.claimedAccessPointId = accessPointId
      row.admsQuarantinedDeviceResolvedByUserId = userId
      row.admsQuarantinedDeviceResolvedAt = now
      await row.save()
    }, UNSCOPED_REASON)
  }
}
