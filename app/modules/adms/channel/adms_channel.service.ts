import type { DateTime } from 'luxon'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import {
  ADMS_CA_TABLES,
  ADMS_DIALECT,
  ADMS_INCIDENT_KIND,
  ADMS_MAX_LINES_PER_UPLOAD,
  ADMS_OK,
  ADMS_RAW_STATUS,
  ADMS_STAMP_TABLES,
  ADMS_TA_TABLES,
  ADMS_UPLOAD_TABLE,
  admsAck,
  countNonEmptyLines,
  type AdmsDialect,
  type AdmsRawStatus,
} from '#modules/adms/adms.constants'
import RawMessageRepositoryMysql from '#modules/adms/raw/raw_message.repository.mysql'
import type { RawMessageRepository } from '#modules/adms/raw/raw_message.repository'
import IncidentService from '#modules/adms/raw/incident.service'
import UploadProgressRepositoryMysql from '#modules/access-point/upload-progress/upload_progress.repository.mysql'
import type { UploadProgressRepository } from '#modules/access-point/upload-progress/upload_progress.repository'
import DeviceProfileRepositoryMysql from '#modules/access-point/device-profile/device_profile.repository.mysql'
import type { DeviceProfileRepository } from '#modules/access-point/device-profile/device_profile.repository'
import type { ResolvedAdmsDevice } from './adms_device_resolver.service.js'

export interface UploadInput {
  device: ResolvedAdmsDevice
  method: string
  path: string
  query: string | null
  table: string | null
  stamp: string | null
  contentType: string | null
  body: string
  bytes: number
}

export interface ChannelReply {
  status: number
  body: string
}

/** Resultado de un procesador de tabla. Las rebanadas 2 a 4 los implementan. */
export interface TableProcessingResult {
  status: AdmsRawStatus
  error: string | null
}

const PAYLOAD_TOO_LARGE: ChannelReply = { status: 413, body: 'PAYLOAD TOO LARGE' }
const UNKNOWN_TABLE_DEDUPE_MINUTES = 60
const DIALECT_CA_DEDUPE_MINUTES = 24 * 60

/**
 * Orden inmutable de una subida (spec v2, 4.3): crudo, conteo, procesar por
 * tabla, cerrar crudo y avanzar stamp, acusar. Cualquier fallo de persistencia
 * lanza y la pasarela responde 500 sin acuse. Esta rebanada no parsea: deja el
 * crudo en `received` para que las rebanadas 2 a 4 enganchen sus procesadores.
 */
export default class AdmsChannelService {
  constructor(
    private readonly rawMessages: RawMessageRepository = new RawMessageRepositoryMysql(),
    private readonly incidents: IncidentService = new IncidentService(),
    private readonly progress: UploadProgressRepository = new UploadProgressRepositoryMysql(),
    private readonly profiles: DeviceProfileRepository = new DeviceProfileRepositoryMysql()
  ) {}

  async receiveUpload(input: UploadInput): Promise<ChannelReply> {
    const now = input.device.receivedAt
    const lineCount = countNonEmptyLines(input.body)
    const rawMessageId = await this.persistRaw(input, lineCount, now)

    if (lineCount > ADMS_MAX_LINES_PER_UPLOAD) {
      await this.rawMessages.finish(rawMessageId, {
        status: ADMS_RAW_STATUS.UNPARSED,
        ack: null,
        error: `lines=${lineCount} > ${ADMS_MAX_LINES_PER_UPLOAD}`,
        processedAt: now,
      })
      await this.incidents.record({
        kind: ADMS_INCIDENT_KIND.OVERSIZE_UPLOAD,
        severity: 'error',
        code: ADMS_ERROR_CODES.SIZE_LINES,
        title: 'Subida con demasiadas lineas',
        detail:
          'El equipo mando mas lineas de las que el canal acepta en una sola subida; el crudo queda para reproceso.',
        key: 'subida-excedida',
        serial: input.device.serial,
        accessPointId: input.device.accessPointId,
        businessUnitId: input.device.businessUnitId,
        rawMessageId,
        context: { table: input.table ?? undefined, lines: lineCount, bytes: input.bytes },
        now,
      })
      return PAYLOAD_TOO_LARGE
    }

    await this.detectDialect(input.device, input.table)

    const processing = await this.processTable(input, rawMessageId)
    const ack = admsAck(lineCount)
    await this.rawMessages.finish(rawMessageId, {
      status: processing.status,
      ack,
      error: processing.error,
      processedAt: now,
    })

    const stampTables: readonly string[] = ADMS_STAMP_TABLES
    if (input.table && input.stamp && stampTables.includes(input.table)) {
      await this.progress.advance({
        accessPointId: input.device.accessPointId,
        businessUnitId: input.device.businessUnitId,
        table: input.table,
        value: input.stamp,
        lines: lineCount,
        now,
      })
    }

    return { status: 200, body: ack }
  }

  /** Acuse de comando: se guarda crudo (tabla `devicecmd`); la rebanada 4 correlaciona. */
  async receiveDeviceCmd(input: UploadInput): Promise<ChannelReply> {
    const now = input.device.receivedAt
    const rawMessageId = await this.persistRaw(
      { ...input, table: 'devicecmd' },
      countNonEmptyLines(input.body),
      now
    )
    await this.rawMessages.finish(rawMessageId, {
      status: ADMS_RAW_STATUS.RECEIVED,
      ack: ADMS_OK,
      error: null,
      processedAt: now,
    })
    return { status: 200, body: ADMS_OK }
  }

  /** Cuerpo por encima del tope: sin crudo (no cabe), incidente y 413. */
  async rejectOversize(
    device: ResolvedAdmsDevice,
    table: string | null,
    bytes: number
  ): Promise<ChannelReply> {
    await this.incidents.record({
      kind: ADMS_INCIDENT_KIND.OVERSIZE_BODY,
      severity: 'error',
      code: ADMS_ERROR_CODES.SIZE_BODY,
      title: 'Cuerpo de subida excedido',
      detail:
        'El equipo mando un cuerpo mayor al tope del canal; se rechaza sin acuse para que reintente o se revise el equipo.',
      key: 'cuerpo-excedido',
      serial: device.serial,
      accessPointId: device.accessPointId,
      businessUnitId: device.businessUnitId,
      context: { table: table ?? undefined, bytes },
      now: device.receivedAt,
    })
    return PAYLOAD_TOO_LARGE
  }

  /** Dialecto por lo que sube el equipo (spec 4.5). `registry` no lo marca. */
  async detectDialect(
    device: ResolvedAdmsDevice,
    table: string | null
  ): Promise<AdmsDialect | null> {
    if (!table) return null
    const isCa = ADMS_CA_TABLES.includes(table) || table.startsWith(ADMS_UPLOAD_TABLE.TABLEDATA)
    const isTa = ADMS_TA_TABLES.includes(table)
    if (!isCa && !isTa) return null
    const dialect = isCa ? ADMS_DIALECT.CA : ADMS_DIALECT.TA
    const profile = await this.profiles.ensure(device.accessPointId, device.businessUnitId)
    const previous = profile.accessPointProfileDialect
    await this.profiles.setDialect(device.accessPointId, device.businessUnitId, dialect)
    if (dialect === ADMS_DIALECT.CA && previous !== ADMS_DIALECT.CA) {
      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.DIALECT_CA,
          severity: 'warning',
          code: ADMS_ERROR_CODES.DEV_SERIAL_UNKNOWN,
          title: 'Checador en modo PUSH de CA',
          detail:
            'El equipo sube en el dialecto de control de acceso. Sigue ingiriendo checadas, pero los comandos clasicos fallaran hasta fijar Tipo de dispositivo = PUSH de T&A en la instalacion.',
          key: 'checador-en-modo-ca',
          serial: device.serial,
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          context: { table },
          now: device.receivedAt,
        },
        { dedupeMinutes: DIALECT_CA_DEDUPE_MINUTES }
      )
    }
    return dialect
  }

  /**
   * Punto de enganche de los procesadores por tabla. En esta rebanada ninguna
   * tabla se interpreta: el crudo queda `received` y una tabla desconocida deja
   * incidente `unknown_table`. Las rebanadas 2 (options), 3 (ATTLOG, OPERLOG
   * con USER) y 6 (FP, BIODATA) sustituyen las ramas.
   */
  protected async processTable(
    input: UploadInput,
    rawMessageId: number
  ): Promise<TableProcessingResult> {
    const known: readonly string[] = [
      ADMS_UPLOAD_TABLE.OPTIONS,
      ADMS_UPLOAD_TABLE.ATTLOG,
      ADMS_UPLOAD_TABLE.OPERLOG,
      ADMS_UPLOAD_TABLE.BIODATA,
      ADMS_UPLOAD_TABLE.RTLOG,
      ADMS_UPLOAD_TABLE.RTSTATE,
      ADMS_UPLOAD_TABLE.TABLEDATA,
    ]
    if (input.table && known.includes(input.table)) {
      return { status: ADMS_RAW_STATUS.RECEIVED, error: null }
    }
    await this.incidents.record(
      {
        kind: ADMS_INCIDENT_KIND.UNKNOWN_TABLE,
        severity: 'info',
        code: ADMS_ERROR_CODES.VAL_LINE_UNPARSEABLE,
        title: 'Tabla desconocida',
        detail:
          'El equipo subio una tabla que el canal no atiende; el crudo queda guardado y acusado.',
        key: 'tabla-desconocida',
        serial: input.device.serial,
        accessPointId: input.device.accessPointId,
        businessUnitId: input.device.businessUnitId,
        rawMessageId,
        context: { table: input.table ?? undefined, lines: countNonEmptyLines(input.body) },
        now: input.device.receivedAt,
      },
      { dedupeMinutes: UNKNOWN_TABLE_DEDUPE_MINUTES }
    )
    return { status: ADMS_RAW_STATUS.UNPARSED, error: 'tabla desconocida' }
  }

  private async persistRaw(
    input: UploadInput,
    lineCount: number,
    now: DateTime
  ): Promise<number> {
    return this.rawMessages.insertReceived({
      accessPointId: input.device.accessPointId,
      businessUnitId: input.device.businessUnitId,
      serial: input.device.serial,
      remoteIp: input.device.ip,
      method: input.method,
      path: input.path,
      query: input.query,
      table: input.table,
      stamp: input.stamp,
      contentType: input.contentType,
      body: input.body,
      bytes: input.bytes,
      lineCount,
      receivedAt: now,
    })
  }
}
