import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { ADMS_MAX_BODY_BYTES, ADMS_OK } from '#modules/adms/adms.constants'
import { getBusinessTimeZone } from '#utils/business_date'
import UploadProgressRepositoryMysql from '#modules/access-point/upload-progress/upload_progress.repository.mysql'
import type { UploadProgressRepository } from '#modules/access-point/upload-progress/upload_progress.repository'
import DeviceProfileRepositoryMysql from '#modules/access-point/device-profile/device_profile.repository.mysql'
import type { DeviceProfileRepository } from '#modules/access-point/device-profile/device_profile.repository'
import BusinessUnit from '#models/business_unit'
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
    private readonly profiles: DeviceProfileRepository = new DeviceProfileRepositoryMysql()
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
  async getRequest(_request: AdmsRequest): Promise<ChannelReply> {
    return { status: 200, body: ADMS_OK }
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
      table: tableOverride !== undefined ? tableOverride : (request.query.table ?? null),
      stamp: request.query.Stamp ?? null,
      contentType: request.ctx.request.header('content-type') ?? null,
      body,
      bytes,
    }
  }

  /**
   * Zona del dispositivo, si no la de la empresa, si no la del sistema. Solo
   * para `TimeZone=` del bloque CA.
   */
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
