import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { ADMS_HOT_SESSION_MINUTES,
  ADMS_CONTENT_TYPE_MAX_LENGTH,
  ADMS_MAX_BODY_BYTES,
  ADMS_OK,
  isValidStamp,
  isValidUploadTable,
} from '#modules/adms/adms.constants'
import { getBusinessTimeZone } from '#utils/business_date'
import UploadProgressRepositoryMysql from '#modules/access-point/upload-progress/upload_progress.repository.mysql'
import type { UploadProgressRepository } from '#modules/access-point/upload-progress/upload_progress.repository'
import DeviceProfileRepositoryMysql from '#modules/access-point/device-profile/device_profile.repository.mysql'
import type { DeviceProfileRepository } from '#modules/access-point/device-profile/device_profile.repository'
import BusinessUnit from '#models/business_unit'
import CommandDispatchService from '#modules/device-commands/dispatch/command_dispatch.service'
import IncidentService from '#modules/adms/raw/incident.service'
import AdmsChannelService, { type ChannelReply, type UploadInput } from './adms_channel.service.js'
import AdmsHandshakeService from './adms_handshake.service.js'
import { readRawBody } from './adms_raw_body.js'
import type { ResolvedAdmsDevice } from './adms_device_resolver.service.js'

/** Lo que la pasarela ya extrajo de la peticion antes de llamar al controlador. */
export interface AdmsRequest {
  ctx: HttpContext
  device: ResolvedAdmsDevice
  method: string
  path: string
  query: Record<string, string>
  rawQuery: string | null
}

/**
 * Un metodo por ruta del canal (spec v2, 4.1). Ningun metodo escribe la
 * respuesta: devuelve `{ status, body }` y la pasarela la manda en texto plano.
 * Corre dentro de `TenantContext.run([businessUnitId])`.
 */
export default class AdmsChannelController {
  constructor(
    private readonly channel: AdmsChannelService = new AdmsChannelService(),
    private readonly handshake: AdmsHandshakeService = new AdmsHandshakeService(),
    private readonly progress: UploadProgressRepository = new UploadProgressRepositoryMysql(),
    private readonly profiles: DeviceProfileRepository = new DeviceProfileRepositoryMysql(),
    private readonly dispatch: CommandDispatchService = new CommandDispatchService(),
    private readonly incidents: IncidentService = new IncidentService()
  ) {}

  /** `GET /iclock/cdata?SN=&options=all`: bloque de saludo con los stamps del dispositivo. */
  async handshakeGet(request: AdmsRequest): Promise<ChannelReply> {
    const stamps = await this.progress.stampsFor(request.device.accessPointId)
    return { status: 200, body: this.handshake.buildHandshake(stamps) }
  }

  /** `POST /iclock/cdata?SN=&table=<T>&Stamp=<s>`: crudo, procesar, acusar. */
  async upload(request: AdmsRequest): Promise<ChannelReply> {
    const body = await this.readBody(request)
    if (!body.ok) {
      return this.channel.rejectOversize(request.device, request.query.table ?? null, body.bytes)
    }
    return this.channel.receiveUpload(this.uploadInput(request, body.body, body.bytes))
  }

  /** `POST /iclock/registry`: codigo estable por dispositivo; no marca dialecto. */
  async registry(request: AdmsRequest): Promise<ChannelReply> {
    const body = await this.readBody(request)
    if (!body.ok) return this.channel.rejectOversize(request.device, 'registry', body.bytes)
    await this.channel.receiveUpload(this.uploadInput(request, body.body, body.bytes, 'registry'))
    const code = this.handshake.registryCodeFor(request.device.accessPointId)
    await this.profiles.setRegistryCode(
      request.device.accessPointId,
      request.device.businessUnitId,
      code
    )
    return { status: 200, body: `RegistryCode=${code}` }
  }

  /** `POST /iclock/push`: bloque de opciones del dialecto CA; marca dialecto. */
  async push(request: AdmsRequest): Promise<ChannelReply> {
    const body = await this.readBody(request)
    if (!body.ok) return this.channel.rejectOversize(request.device, 'push', body.bytes)
    await this.channel.receiveUpload(this.uploadInput(request, body.body, body.bytes, 'push'))
    await this.channel.detectDialect(request.device, 'rtlog')
    const offset = await this.timezoneOffsetHours(request.device)
    return {
      status: 200,
      body: this.handshake.buildCaPushOptions(offset, String(request.device.accessPointId)),
    }
  }

  /** `GET /iclock/getrequest`: un comando o `OK`. La rebanada 4 despacha; hoy `OK`. */
  async getRequest(request: AdmsRequest): Promise<ChannelReply> {
    const { device } = request
    const ipAnomalyOpen = await this.incidents.hasOpenIpAnomaly(device.accessPointId)
    const body = await this.dispatch.next({
      accessPointId: device.accessPointId,
      now: device.receivedAt,
      ipAnomalyOpen,
      hotSession: await this.hasHotSession(device),
      /**
       * La zona del EQUIPO, no la del negocio. El ajuste de reloj se recalcula
       * al despachar y sin esto saldria con la zona de la aplicacion: una sede
       * en Tijuana con la empresa en Ciudad de Mexico quedaria con una hora de
       * mas justo por haber corregido su reloj, y todas sus checadas se irian
       * a la franja equivocada.
       */
      deviceZone: device.timezone,
    })
    return { status: 200, body }
  }

  /** `GET /iclock/ping`: latido; el resolutor ya toco `access_point_last_connection`. */
  async ping(_request: AdmsRequest): Promise<ChannelReply> {
    return { status: 200, body: ADMS_OK }
  }

  /** `POST /iclock/devicecmd`: acuse crudo; la rebanada 4 correlaciona por ID. */
  async deviceCmd(request: AdmsRequest): Promise<ChannelReply> {
    const body = await this.readBody(request)
    if (!body.ok) return this.channel.rejectOversize(request.device, 'devicecmd', body.bytes)
    return this.channel.receiveDeviceCmd(
      this.uploadInput(request, body.body, body.bytes, 'devicecmd')
    )
  }

  /** `POST /iclock/<desconocido>`: crudo, incidente, acuse. */
  async unknownPost(request: AdmsRequest): Promise<ChannelReply> {
    const body = await this.readBody(request)
    if (!body.ok) return this.channel.rejectOversize(request.device, null, body.bytes)
    const table = request.path.replace(/^\/iclock\//, '') || null
    return this.channel.receiveUpload(this.uploadInput(request, body.body, body.bytes, table))
  }

  private async readBody(request: AdmsRequest) {
    return readRawBody(request.ctx.request.request, ADMS_MAX_BODY_BYTES)
  }

  private uploadInput(
    request: AdmsRequest,
    body: string,
    bytes: number,
    tableOverride?: string | null
  ): UploadInput {
    return {
      device: request.device,
      method: request.method,
      path: request.path,
      query: request.rawQuery,
      table: tableOverride !== undefined ? tableOverride : this.safeTable(request.query.table),
      stamp: isValidStamp(request.query.Stamp) ? request.query.Stamp : null,
      contentType:
        request.ctx.request.header('content-type')?.slice(0, ADMS_CONTENT_TYPE_MAX_LENGTH) ?? null,
      body,
      bytes,
    }
  }

  /**
   * Nada que venga del query entra a la base ni vuelve al equipo sin patron:
   * el nombre de tabla se guarda en una columna de ancho fijo y el `Stamp`
   * regresa dentro del bloque de saludo (spec 13, regla 13).
   */
  private safeTable(value: string | undefined): string | null {
    return isValidUploadTable(value) ? value : null
  }

  /**
   * Zona del dispositivo, si no la de la empresa, si no la del sistema. Solo
   * para `TimeZone=` del bloque CA.
   */
  /**
   * El equipo saludo hace poco desde ESTA misma direccion.
   *
   * Se apoya en el perfil, que ya guarda la ultima IP vista y cuando. Sin
   * lectura previa la sesion esta fria: un equipo del que no sabemos nada no
   * recibe biometricos, y en el peor caso los recibira en el siguiente sondeo,
   * unos segundos despues.
   */
  private async hasHotSession(device: ResolvedAdmsDevice): Promise<boolean> {
    const profile = await this.profiles.findByAccessPoint(device.accessPointId)
    const seenAt = profile?.accessPointProfileLastIpSeenAt ?? null
    const seenIp = profile?.accessPointProfileLastIpSeen ?? null
    if (seenAt === null || seenIp === null) return false
    if (seenIp !== device.ip) return false

    return device.receivedAt.diff(seenAt, 'minutes').minutes <= ADMS_HOT_SESSION_MINUTES
  }

  private async timezoneOffsetHours(device: ResolvedAdmsDevice): Promise<number> {
    let zone = device.timezone
    if (!zone) {
      const unit = await BusinessUnit.query()
        .where('business_unit_id', device.businessUnitId)
        .first()
      zone = unit?.businessUnitTimezone ?? getBusinessTimeZone()
    }
    const now = DateTime.now().setZone(zone)
    const offsetMinutes = now.isValid
      ? now.offset
      : DateTime.now().setZone(getBusinessTimeZone()).offset
    return Math.round(offsetMinutes / 60)
  }
}
