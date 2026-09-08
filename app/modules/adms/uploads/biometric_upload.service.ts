import type { DateTime } from 'luxon'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { ADMS_INCIDENT_KIND, ADMS_RAW_STATUS, type AdmsRawStatus } from '#modules/adms/adms.constants'
import type { ResolvedAdmsDevice } from '#modules/adms/channel/adms_device_resolver.service'
import { parseBiodataBody, type BiodataRow } from '#modules/adms/parsers/biodata.parser'
import { parseOperlogBody } from '#modules/adms/parsers/operlog.parser'
import IncidentService from '#modules/adms/raw/incident.service'
import PinResolverService from '#modules/adms/ingestion/pin_resolver.service'
import HeldPunchRepositoryMysql from '#modules/adms/ingestion/held_punch.repository.mysql'
import type { HeldPunchRepository } from '#modules/adms/ingestion/held_punch.repository'
import TemplateService from '#modules/biometric-vault/template/template.service'
import { BIO_TYPE } from '#modules/biometric-vault/biometric_vault.constants'
import HeldBiometricRepositoryMysql from './held_biometric.repository.mysql.js'
import type { HeldBiometricRepository } from './held_biometric.repository.js'
import logger from '@adonisjs/core/services/logger'
import ExecutionEvidenceService from '#modules/device-commands/evidence/execution_evidence.service'

/** Una captura biometrica ya normalizada, venga de donde venga. */
export interface NormalizedBiometric {
  lineNumber: number
  pin: string
  bioType: number
  bioNo: number
  bioIndex: number
  bioFormat: number
  majorVer: string | null
  minorVer: string | null
  valid: number
  duress: number
  template: string
}

export interface BiometricUploadContext {
  device: ResolvedAdmsDevice
  body: string
  rawMessageId: number
  /** Versiones que el perfil del equipo declaro, para rellenar la del blob. */
  deviceFpVersion: string | null
  deviceFaceVersion: string | null
}

export interface BiometricUploadResult {
  status: AdmsRawStatus
  error: string | null
  stored: number
  held: number
  invalid: number
  unparsed: number
}

const INVALID_TEMPLATE_DEDUPE_MINUTES = 60
const OPLOG_DEDUPE_MINUTES = 24 * 60

/**
 * Recibe los biometricos que el equipo empuja (spec ADMS 7.1 y 4.5).
 *
 * Recibir NO exige consentimiento (decision D3): el equipo ya capturo el dedo y
 * rechazarlo solo lograria perderlo. El consentimiento gobierna lo que sale
 * hacia el aparato, que son otras rebanadas.
 */
export default class BiometricUploadService {
  constructor(
    private readonly templates: TemplateService = new TemplateService(),
    private readonly pins: PinResolverService = new PinResolverService(),
    private readonly heldBiometrics: HeldBiometricRepository = new HeldBiometricRepositoryMysql(),
    private readonly heldPunches: HeldPunchRepository = new HeldPunchRepositoryMysql(),
    private readonly incidents: IncidentService = new IncidentService(),
    private readonly evidence: ExecutionEvidenceService = new ExecutionEvidenceService()
  ) {}

  /** `table=BIODATA`: la via canonica, con version explicita. */
  async ingestBiodata(context: BiometricUploadContext): Promise<BiometricUploadResult> {
    const parsed = parseBiodataBody(context.body)
    const normalized = parsed.rows.map((row) => this.fromBiodata(row, context))
    return this.store(context, normalized, parsed.unparsed.length)
  }

  /** `table=OPERLOG`: mezcla bitacora, altas de usuario y huellas. */
  async ingestOperlog(context: BiometricUploadContext): Promise<BiometricUploadResult> {
    const parsed = parseOperlogBody(context.body)

    const normalized: NormalizedBiometric[] = parsed.fingerprints.map((row) => ({
      lineNumber: row.lineNumber,
      pin: row.pin,
      bioType: BIO_TYPE.FINGERPRINT,
      bioNo: row.fingerId,
      bioIndex: 0,
      bioFormat: 0,
      // La linea `FP` no declara version: se toma la del equipo que la subio.
      majorVer: context.deviceFpVersion,
      minorVer: null,
      valid: row.valid,
      duress: 0,
      template: row.template,
    }))

    const result = await this.store(context, normalized, parsed.unparsed.length)

    if (parsed.oplogs > 0) {
      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.OPLOG,
          severity: 'info',
          code: ADMS_ERROR_CODES.VAL_LINE_UNPARSEABLE,
          title: 'Bitacora de operacion del checador',
          detail:
            'El equipo subio lineas de su bitacora de operacion. Se cuentan de forma agregada; el detalle vive en el cuerpo crudo.',
          key: 'bitacora-de-operacion',
          serial: context.device.serial,
          accessPointId: context.device.accessPointId,
          businessUnitId: context.device.businessUnitId,
          rawMessageId: context.rawMessageId,
          context: { lines: parsed.oplogs },
          now: context.device.receivedAt,
        },
        { dedupeMinutes: OPLOG_DEDUPE_MINUTES }
      )
    }

    /**
     * Las lineas `USER` alimentan el nombre del PIN desconocido cuando ese PIN
     * no corresponde a nadie. Esta rebanada NO crea colaboradores desde el
     * equipo: quien entra a la nomina lo decide una persona, no un aparato.
     */
    for (const user of parsed.users) {
      const resolution = await this.pins.resolve({
        accessPointId: context.device.accessPointId,
        businessUnitId: context.device.businessUnitId,
        pin: user.pin,
      })
      if (resolution.kind === 'employee') continue
      await this.heldPunches.touchUnmappedPin({
        accessPointId: context.device.accessPointId,
        businessUnitId: context.device.businessUnitId,
        pin: user.pin,
        /**
         * El nombre que el equipo le puso a ese PIN. Es la pista con la que el
         * operador reconoce a quien vincular: sin ella concilia mirando un
         * numero pelado. Se guarda cifrado y enmascarado como el resto de PII.
         */
        name: user.name,
        now: context.device.receivedAt,
      })
    }

    return result
  }

  private fromBiodata(row: BiodataRow, context: BiometricUploadContext): NormalizedBiometric {
    return {
      lineNumber: row.lineNumber,
      pin: row.pin,
      bioType: row.bioType,
      bioNo: row.bioNo,
      bioIndex: row.bioIndex,
      bioFormat: row.format,
      /**
       * `MajorVer` describe el BLOB. Si el equipo no lo declara se usa la
       * version de esa modalidad en su perfil; si tampoco la hay, queda nula y
       * el template no se podra replicar hasta saber de que version es.
       */
      majorVer: row.majorVer ?? this.versionFor(row.bioType, context),
      minorVer: row.minorVer,
      valid: row.valid,
      duress: row.duress,
      template: row.template,
    }
  }

  private versionFor(bioType: number, context: BiometricUploadContext): string | null {
    if (bioType === BIO_TYPE.FINGERPRINT) return context.deviceFpVersion
    if (bioType === BIO_TYPE.FACE) return context.deviceFaceVersion
    return null
  }

  private async store(
    context: BiometricUploadContext,
    rows: NormalizedBiometric[],
    unparsed: number
  ): Promise<BiometricUploadResult> {
    const { device } = context
    let stored = 0
    let held = 0
    let invalid = 0

    for (const row of rows) {
      const resolution = await this.pins.resolve({
        accessPointId: device.accessPointId,
        businessUnitId: device.businessUnitId,
        pin: row.pin,
      })

      if (resolution.kind !== 'employee') {
        const unmappedPinId = await this.heldPunches.touchUnmappedPin({
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          pin: row.pin,
          /** Que modalidad trae ese PIN, para que se vea antes de vincular. */
          bioType: row.bioType,
          now: device.receivedAt,
        })
        await this.heldBiometrics.hold({
          admsUnmappedPinId: unmappedPinId,
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          pin: row.pin,
          bioType: row.bioType,
          bioNo: row.bioNo,
          majorVer: row.majorVer,
          minorVer: row.minorVer,
          template: row.template,
          size: row.template.length,
        })
        held += 1
        continue
      }

      const result = await this.templates.store({
        employeeId: resolution.employeeId,
        businessUnitId: device.businessUnitId,
        bioType: row.bioType,
        bioNo: row.bioNo,
        bioIndex: row.bioIndex,
        bioFormat: row.bioFormat,
        majorVer: row.majorVer,
        minorVer: row.minorVer,
        valid: row.valid,
        duress: row.duress,
        template: row.template,
        sourceAccessPointId: device.accessPointId,
        capturedAt: device.receivedAt,
      })

      if (!result.ok) {
        invalid += 1
        await this.recordInvalid(context, row, result.reason, device.receivedAt)
        continue
      }
      stored += 1

      /**
       * La huella guardada es la prueba de que el enrolamiento se hizo (spec
       * 6.6). Va en su propio try/catch: cerrar un comando es contabilidad y no
       * puede tumbar la subida de un biometrico que ya esta a salvo.
       */
      try {
        await this.evidence.fromBiometricUpload({
          accessPointId: device.accessPointId,
          pin: row.pin,
          bioNo: row.bioNo,
          now: device.receivedAt,
        })
      } catch (error) {
        logger.warn(
          { accessPointId: device.accessPointId, error: (error as Error).message.slice(0, 200) },
          'canal ADMS: el biometrico se guardo pero no se pudo cerrar su comando'
        )
      }
    }

    const clean = unparsed === 0 && held === 0 && invalid === 0
    return {
      status: clean ? ADMS_RAW_STATUS.PROCESSED : ADMS_RAW_STATUS.PARTIAL,
      error: clean ? null : `stored=${stored} held=${held} invalid=${invalid}`,
      stored,
      held,
      invalid,
      unparsed,
    }
  }

  private async recordInvalid(
    context: BiometricUploadContext,
    row: NormalizedBiometric,
    reason: string,
    now: DateTime
  ): Promise<void> {
    await this.incidents.record(
      {
        kind: ADMS_INCIDENT_KIND.INVALID_TEMPLATE,
        severity: 'warning',
        code: ADMS_ERROR_CODES.VAL_LINE_UNPARSEABLE,
        title: 'Biometrico rechazado por la boveda',
        detail:
          'El equipo subio un dato biometrico que no pasa la validacion de formato o de tamano. No se guarda: media huella no identifica a nadie y ocuparia el lugar del dato bueno.',
        key: 'biometrico-invalido',
        serial: context.device.serial,
        accessPointId: context.device.accessPointId,
        businessUnitId: context.device.businessUnitId,
        rawMessageId: context.rawMessageId,
        context: { pin: row.pin, reason, bytes: row.template.length },
        now,
      },
      { dedupeMinutes: INVALID_TEMPLATE_DEDUPE_MINUTES }
    )
  }
}
