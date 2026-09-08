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
import DeviceProfileService from '#modules/access-point/device-profile/device_profile.service'
import AttlogIngestionService from '#modules/adms/ingestion/attlog_ingestion.service'
import CommandAckService from '#modules/device-commands/dispatch/command_ack.service'
import BiometricUploadService from '#modules/adms/uploads/biometric_upload.service'
import { attlogLayoutFor } from '#modules/adms/parsers/parser.types'
import AccessPoint from '#models/access_point'
import BusinessUnit from '#models/business_unit'
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
/** El equipo reintenta cada ~5 s: sin dedupe habria una fila por reintento. */
const OVERSIZE_DEDUPE_MINUTES = 60
const ORPHAN_ACK_DEDUPE_MINUTES = 60
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
    private readonly profiles: DeviceProfileRepository = new DeviceProfileRepositoryMysql(),
    private readonly deviceProfiles: DeviceProfileService = new DeviceProfileService(),
    private readonly attlog: AttlogIngestionService = new AttlogIngestionService(),
    private readonly ack: CommandAckService = new CommandAckService(),
    private readonly biometrics: BiometricUploadService = new BiometricUploadService()
  ) {}

  async receiveUpload(input: UploadInput): Promise<ChannelReply> {
    const now = input.device.receivedAt
    const lineCount = countNonEmptyLines(input.body)
    const rawMessageId = await this.persistRaw(input, lineCount, now)

    /**
     * Demasiadas lineas: el crudo YA quedo persistido integro, que es la
     * condicion del acuse (spec 4.3). Por eso se acusa `OK: n` en vez de 413.
     *
     * Un 413 aqui seria permanente para ese mismo cuerpo y el equipo, que es
     * fail-safe, lo reintentaria cada ~5 s insertando otro crudo de hasta
     * 4 MB en cada vuelta hasta llenar el disco. Acusando, el equipo avanza,
     * no pierde nada (el cuerpo esta guardado y cifrado) y la subida queda
     * `unparsed` para `adms:reprocess-raw` con su incidente visible.
     */
    if (lineCount > ADMS_MAX_LINES_PER_UPLOAD) {
      const ack = admsAck(lineCount)
      await this.rawMessages.finish(rawMessageId, {
        status: ADMS_RAW_STATUS.UNPARSED,
        ack,
        error: `lines=${lineCount} > ${ADMS_MAX_LINES_PER_UPLOAD}`,
        processedAt: now,
      })
      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.OVERSIZE_UPLOAD,
          severity: 'error',
          code: ADMS_ERROR_CODES.SIZE_LINES,
          title: 'Subida con demasiadas lineas',
          detail:
            'El equipo mando mas lineas de las que el canal procesa en una sola subida; se acuso para que no reintente y el crudo quedo guardado para reproceso.',
          key: 'subida-excedida',
          serial: input.device.serial,
          accessPointId: input.device.accessPointId,
          businessUnitId: input.device.businessUnitId,
          rawMessageId,
          context: { table: input.table ?? undefined, lines: lineCount, bytes: input.bytes },
          now,
        },
        { dedupeMinutes: OVERSIZE_DEDUPE_MINUTES }
      )
      return { status: 200, body: ack }
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

    /**
     * El stamp avanza cuando la subida se entendio. `partial` cuenta: se
     * proceso y lo que no se pudo atribuir quedo retenido y recuperable; si no
     * avanzara, el avance quedaria congelado para siempre en cuanto apareciera
     * un PIN desconocido, que es lo normal al arrancar un equipo. Solo una
     * tabla que no se entendio (`unparsed`) o que fallo lo detiene.
     */
    const stampTables: readonly string[] = ADMS_STAMP_TABLES
    const understood =
      processing.status === ADMS_RAW_STATUS.RECEIVED ||
      processing.status === ADMS_RAW_STATUS.PROCESSED ||
      processing.status === ADMS_RAW_STATUS.PARTIAL
    if (understood && input.table && input.stamp && stampTables.includes(input.table)) {
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

  /**
   * Acuse de un comando (spec 6.5). Se guarda crudo y se aplica al comando.
   *
   * Un acuse que no corresponde a ningun comando de ESTE equipo deja incidente
   * y se responde `OK` igual: negarse dejaria al aparato reintentando para
   * siempre por algo que el servidor ya no puede resolver.
   */
  async receiveDeviceCmd(input: UploadInput): Promise<ChannelReply> {
    const now = input.device.receivedAt
    const rawMessageId = await this.persistRaw(
      { ...input, table: 'devicecmd' },
      countNonEmptyLines(input.body),
      now
    )

    const outcome = await this.ack.apply({
      accessPointId: input.device.accessPointId,
      body: input.body,
      now,
    })

    if (outcome.kind !== 'applied') {
      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.ORPHAN_ACK,
          severity: 'warning',
          code: ADMS_ERROR_CODES.VAL_LINE_UNPARSEABLE,
          title: 'Acuse sin comando que lo reclame',
          detail:
            'El equipo acuso un comando que no existe o que pertenece a otro dispositivo. No se aplica a ninguno: acreditarlo al equivocado marcaria como hecho algo que no paso.',
          key: 'acuse-huerfano',
          serial: input.device.serial,
          accessPointId: input.device.accessPointId,
          businessUnitId: input.device.businessUnitId,
          rawMessageId,
          context: outcome.kind === 'orphan' ? { returnCode: outcome.wireId ?? undefined } : null,
          now,
        },
        { dedupeMinutes: ORPHAN_ACK_DEDUPE_MINUTES }
      )
    }

    await this.rawMessages.finish(rawMessageId, {
      status: outcome.kind === 'applied' ? ADMS_RAW_STATUS.PROCESSED : ADMS_RAW_STATUS.UNPARSED,
      ack: ADMS_OK,
      error: outcome.kind === 'applied' ? null : outcome.kind,
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
    await this.incidents.record(
      {
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
      },
      { dedupeMinutes: OVERSIZE_DEDUPE_MINUTES }
    )
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
    if (input.table === ADMS_UPLOAD_TABLE.OPTIONS) {
      await this.deviceProfiles.upsertFromOptions(input.device, input.body, rawMessageId)
      return { status: ADMS_RAW_STATUS.PROCESSED, error: null }
    }
    if (input.table === ADMS_UPLOAD_TABLE.ATTLOG) {
      return this.ingestAttlog(input, rawMessageId)
    }
    if (
      input.table === ADMS_UPLOAD_TABLE.BIODATA ||
      input.table === ADMS_UPLOAD_TABLE.OPERLOG
    ) {
      return this.ingestBiometrics(input, rawMessageId)
    }
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

  /**
   * Contexto que la ingesta necesita y que solo el canal conoce: la plataforma
   * que el equipo declaro en `options`, el nombre del punto de acceso y las
   * zonas horarias. Se leen aqui para que el servicio de ingesta no dependa de
   * Lucid.
   */
  private async ingestAttlog(
    input: UploadInput,
    rawMessageId: number
  ): Promise<TableProcessingResult> {
    const { device } = input
    const profile = await this.profiles.ensure(device.accessPointId, device.businessUnitId)
    const accessPoint = await AccessPoint.query()
      .where('access_point_id', device.accessPointId)
      .first()
    const businessUnit = await BusinessUnit.query()
      .where('business_unit_id', device.businessUnitId)
      .first()

    const result = await this.attlog.ingest({
      device,
      body: input.body,
      rawMessageId,
      layout: attlogLayoutFor(profile.accessPointProfilePlatform ?? null),
      accessPointName: accessPoint?.accessPointName ?? '',
      deviceZone: device.timezone,
      businessUnitZone: businessUnit?.businessUnitTimezone ?? null,
    })
    return { status: result.status, error: result.error }
  }

  /**
   * Biometricos que el equipo empuja. Las versiones del perfil se leen aqui
   * porque solo el canal sabe que aparato subio: la linea `FP` de `OPERLOG` no
   * declara version y sin ella el template no se podria replicar despues.
   */
  private async ingestBiometrics(
    input: UploadInput,
    rawMessageId: number
  ): Promise<TableProcessingResult> {
    const { device } = input
    const profile = await this.profiles.ensure(device.accessPointId, device.businessUnitId)

    const context = {
      device,
      body: input.body,
      rawMessageId,
      deviceFpVersion: profile.accessPointProfileFpVersion ?? null,
      deviceFaceVersion: profile.accessPointProfileFaceVersion ?? null,
    }

    const result =
      input.table === ADMS_UPLOAD_TABLE.BIODATA
        ? await this.biometrics.ingestBiodata(context)
        : await this.biometrics.ingestOperlog(context)

    return { status: result.status, error: result.error }
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
