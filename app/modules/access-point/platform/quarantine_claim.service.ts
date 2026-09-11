import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import AccessPoint from '#models/access_point'
import AdmsQuarantinedDevice from '#models/adms_quarantined_device'
import BusinessUnit from '#models/business_unit'
import PlatformDevice from '#models/platform_device'
import PlatformDeviceService from '#services/platform_device_service'
import PlatformDeviceAssignmentService from '#services/platform_device_assignment_service'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import type { DeviceCommandPort } from '#modules/device-commands/device_command_port'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import { PLATFORM_DEVICE_ERROR_CODES } from '#constants/platform_device_error_codes'
import { generateChannelSecret } from '#modules/adms/channel/channel_secret'
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
  /**
   * Direccion propia del equipo, la parte secreta.
   *
   * Se entrega UNA vez, aqui: quien instala el checador la teclea en el menu
   * del aparato junto con el resto de la direccion. Despues se consulta desde
   * la ficha del equipo, que es otra HU.
   */
  channelSecret: string
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
/** Estado en el que estaba el punto de acceso antes de revivirlo. */
interface RevivedAccessPoint {
  accessPointId: number
  deletedAt: DateTime | null
  active: number
}

export default class PlatformQuarantineClaimService {
  constructor(
    private readonly devices: PlatformDeviceService = new PlatformDeviceService(),
    private readonly assignments: PlatformDeviceAssignmentService = new PlatformDeviceAssignmentService(),
    private readonly commands: DeviceCommandPort = new DeviceCommandService()
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

    /**
     * Desde aqui hasta la asignacion, cualquier fallo tiene que devolver el
     * punto de acceso a su baja: la revivificacion ya ocurrio y sin esto queda
     * vivo y activo en una empresa que nunca llego a reclamarlo. `createOrReuse`
     * lanza por su cuenta --serie ya tomada, modelo inexistente-- y estaba
     * fuera de todo try.
     */
    let device: PlatformDevice
    let created: boolean
    try {
      const reused = await this.createOrReuseDevice(serial, input.platformDeviceModelId)
      device = reused.device
      created = reused.created
    } catch (error) {
      if (revived) await this.undoRevive(revived)
      throw error
    }

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
      await this.compensate(device, input.createdByUserId, created)
      if (revived) await this.undoRevive(revived)
      throw error
    }

    /**
     * La direccion propia del equipo, para entregarsela a quien lo instala.
     *
     * El punto de acceso ya nace con ella --lo pone un hook del modelo, para
     * que las tres vias de alta la tengan-- asi que aqui solo se lee. Se
     * genera unicamente si el punto de acceso venia de antes de este cambio y
     * no tiene: sin eso, ese equipo se quedaria en convivencia para siempre y
     * sin canal el dia del corte.
     */
    const channelSecret = await this.readOrAssignChannelSecret(
      assignment.accessPoint.accessPointId,
      now
    )

    await this.markClaimed(
      row,
      tenant.businessUnitId,
      assignment.accessPoint.accessPointId,
      input.createdByUserId,
      now
    )

    await this.askDeviceToIntroduceItself(
      assignment.accessPoint.accessPointId,
      tenant.businessUnitId,
      input.createdByUserId
    )

    return {
      quarantinedDeviceId: row.admsQuarantinedDeviceId,
      serialNumber: serial,
      platformDeviceId: device.platformDeviceId,
      platformDeviceAssignmentId: assignment.assignmentId,
      accessPointId: assignment.accessPoint.accessPointId,
      accessPointName: assignment.accessPoint.accessPointName,
      accessPointOutcome: assignment.accessPointOutcome,
      revivedDeletedAccessPoint: revived !== null,
      channelSecret,
    }
  }

  /** La direccion propia del equipo, generandola si el alta es anterior al hook. */
  async readOrAssignChannelSecret(accessPointId: number, now: DateTime): Promise<string> {
    const existing = await TenantContext.runUnscoped(
      () =>
        AccessPoint.query().where('access_point_id', accessPointId).first(),
      UNSCOPED_REASON
    )
    if (existing?.accessPointChannelSecret) return existing.accessPointChannelSecret

    return this.rotateChannelSecret(accessPointId, now)
  }

  /**
   * Le da al equipo una direccion nueva.
   *
   * Se llama por causa --al retirar un checador de un cliente, o ante sospecha
   * de filtracion-- y nunca por calendario: rotar significa volver a teclear en
   * el aparato, y una rotacion automatica sin nadie enfrente lo deja hablando a
   * una direccion que ya no existe.
   */
  async rotateChannelSecret(accessPointId: number, now: DateTime): Promise<string> {
    const secret = generateChannelSecret()
    await TenantContext.runUnscoped(async () => {
      const point = await AccessPoint.query()
        .where('access_point_id', accessPointId)
        .firstOrFail()
      point.accessPointChannelSecret = secret
      point.accessPointChannelSecretSetAt = now
      await point.save()
    }, UNSCOPED_REASON)
    return secret
  }

  /**
   * Le pide al equipo que se presente, con un `INFO` en la cola.
   *
   * Hace falta porque el aparato hizo su saludo MIENTRAS estaba en cuarentena:
   * ahi el canal le respondio un `OK` seco -- el rechazo silencioso de una serie
   * que no conocia -- y el equipo se quedo sondeando comandos sin recibir nunca
   * la configuracion. Ya reclamado, no vuelve a saludar por su cuenta: se queda
   * pidiendo ordenes para siempre y su perfil nunca se llena.
   *
   * `INFO` lo desbloquea: el equipo contesta con el volcado de sus opciones, y
   * de ahi salen la plataforma y las versiones. Sin plataforma, sus checadas se
   * leen con una disposicion que puede no ser la suya.
   *
   * No lanza. El reclamo ya esta hecho y es valido; si esto falla, el operador
   * siempre puede mandar el `INFO` a mano.
   */
  private async askDeviceToIntroduceItself(
    accessPointId: number,
    businessUnitId: number,
    userId: number | null
  ): Promise<void> {
    try {
      await TenantContext.run([businessUnitId], () =>
        this.commands.enqueue({
          accessPointId,
          businessUnitId,
          kind: DEVICE_COMMAND_KIND.INFO,
          fields: {},
          correlationKey: 'info:presentacion-al-reclamar',
          requestedByUserId: userId,
        })
      )
    } catch (error) {
      logger.warn(
        { accessPointId, error: (error as Error).message.slice(0, 200) },
        'Reclamo de cuarentena: no se pudo encolar el INFO de presentacion'
      )
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

  /**
   * Ver el comentario del llamador: la UNIQUE de serie no sabe de bajas.
   *
   * Solo revive lo que era de ESTA empresa. La fila muerta arrastra todo lo que
   * ese aparato registro --checadas, padron, comandos, incidentes, avance de
   * subida-- y esas filas hijas llevan su propia empresa: cambiarle la empresa
   * al punto de acceso las dejaba a todas apuntando a la anterior, con las
   * checadas de una empresa colgando de un checador de otra. Un aparato que
   * cambia de dueno se retira del inventario primero; aqui se rechaza de frente
   * en vez de reasignarlo en silencio.
   */
  private async reviveDeletedIfAny(
    serial: string,
    businessUnitId: number
  ): Promise<RevivedAccessPoint | null> {
    return TenantContext.runUnscoped(async () => {
      const dead = await AccessPoint.query()
        .withTrashed()
        .whereNotNull('access_point_deleted_at')
        .where('access_point_serial_number', serial)
        .first()
      if (!dead) return null

      if (dead.businessUnitId !== businessUnitId) {
        throw new PlatformDeviceServiceError(
          `La serie ${serial} pertenecio a otra empresa`,
          PLATFORM_DEVICE_ERROR_CODES.SERIAL_TAKEN_BY_OTHER_TENANT,
          409,
          PLATFORM_DEVICE_ERROR_CODES.SERIAL_TAKEN_BY_OTHER_TENANT,
          'Ese checador estuvo dado de alta en otra empresa y conserva su historial. Retiralo del inventario de esa empresa antes de entregarlo a esta.'
        )
      }

      logger.info(
        {
          serialNumber: serial,
          accessPointId: dead.accessPointId,
          businessUnitId,
        },
        'Reclamo de cuarentena: se revive el punto de acceso dado de baja que tenia esa serie'
      )
      const previous = {
        accessPointId: dead.accessPointId,
        deletedAt: dead.deletedAt,
        active: dead.accessPointActive,
      }
      dead.deletedAt = null
      dead.accessPointActive = 1
      await dead.save()
      return previous
    }, UNSCOPED_REASON)
  }

  /**
   * Devuelve a su baja el punto de acceso que se revivio.
   *
   * Se revive ANTES de crear la unidad y la asignacion --si no, el alta choca
   * contra la UNIQUE de la serie con un 500 que no explica nada-- asi que un
   * fallo posterior lo dejaba vivo y activo en una empresa que nunca llego a
   * reclamarlo.
   */
  private async undoRevive(revived: RevivedAccessPoint): Promise<void> {
    try {
      await TenantContext.runUnscoped(async () => {
        const row = await AccessPoint.query()
          .withTrashed()
          .where('access_point_id', revived.accessPointId)
          .first()
        if (!row) return
        row.deletedAt = revived.deletedAt
        row.accessPointActive = revived.active
        await row.save()
      }, UNSCOPED_REASON)
    } catch (error) {
      logger.error(
        {
          accessPointId: revived.accessPointId,
          error: (error as Error).message.slice(0, 200),
        },
        'Reclamo de cuarentena: no se pudo devolver a su baja el punto de acceso revivido'
      )
    }
  }

  /**
   * Si la serie ya esta en el inventario -- porque alguien la dio de alta antes
   * de que el aparato llamara -- se reusa esa unidad en vez de duplicarla.
   *
   * Solo si esta DISPONIBLE. Una unidad asignada o retirada no se puede
   * colocar, y pasarsela a la asignacion produce un mensaje que habla de
   * tenants y fechas cuando el problema es otro. Aqui se dice el estado real.
   */
  private async createOrReuseDevice(
    serial: string,
    modelId: number
  ): Promise<{ device: PlatformDevice; created: boolean }> {
    const existing = await PlatformDevice.query()
      .where('platform_device_serial_number', serial)
      .whereNull('platform_device_deleted_at')
      .first()

    if (existing) {
      if (existing.platformDeviceStockStatus === 'disponible') {
        return { device: existing, created: false }
      }
      throw new PlatformDeviceServiceError(
        `La unidad ${existing.platformDeviceId} de la serie ${serial} esta ${existing.platformDeviceStockStatus}`,
        PLATFORM_DEVICE_ERROR_CODES.ASSIGN_NOT_AVAILABLE,
        409,
        PLATFORM_DEVICE_ERROR_CODES.ASSIGN_NOT_AVAILABLE,
        existing.platformDeviceStockStatus === 'asignada'
          ? 'Esa serie ya esta entregada a una empresa. Hay que cerrar esa entrega antes de volver a colocarla.'
          : 'Esa serie esta retirada del inventario. Hay que reactivarla antes de poder entregarla.'
      )
    }

    const nueva = await this.devices.create({
      platformDeviceSerialNumber: serial,
      platformDeviceModelId: modelId,
      /** Lo que lo distingue de nuestro stock. Sin costo ni fecha, por R6. */
      platformDeviceOrigin: 'del_cliente',
    })
    const device = await PlatformDevice.query()
      .where('platform_device_id', nueva.platformDeviceId)
      .firstOrFail()
    return { device, created: true }
  }

  /**
   * Deshace el alta de la unidad. Se BORRA la fila, no se retira.
   *
   * Retirarla parecia lo prudente y era lo contrario: la serie es UNICA en el
   * inventario, asi que una unidad retirada con esa serie bloquea para siempre
   * cualquier reclamo futuro del mismo aparato -- y como la retirada es un
   * estado terminal, hay que ir a mano a resucitarla. Compensar significa dejar
   * el mundo como estaba.
   *
   * Se usa `forceDelete` y no `delete`: el modelo tiene baja logica, y el indice
   * unico no sabe de `platform_device_deleted_at`, asi que una fila con baja
   * logica seguiria secuestrando la serie exactamente igual que la retirada.
   *
   * Es seguro porque la fila se acaba de crear en esta misma llamada: no tiene
   * asignaciones, ni historial, ni nada que colgara de ella. Solo se borra la
   * que creo este reclamo (`justCreated`), nunca una que ya existia.
   */
  private async compensate(
    device: PlatformDevice,
    userId: number | null,
    justCreated: boolean
  ): Promise<void> {
    if (!justCreated) return
    try {
      await device.forceDelete()
      logger.warn(
        { platformDeviceId: device.platformDeviceId, userId },
        'Reclamo de cuarentena: la asignacion fallo y la unidad recien creada se deshizo'
      )
    } catch (error) {
      logger.error(
        {
          platformDeviceId: device.platformDeviceId,
          error: (error as Error).message.slice(0, 200),
        },
        'Reclamo de cuarentena: no se pudo deshacer la unidad creada; queda huerfana'
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
