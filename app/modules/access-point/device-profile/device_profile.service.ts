import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import type { ResolvedAdmsDevice } from '#modules/adms/channel/adms_device_resolver.service'
import { parseOptionsBody, resolveVersions } from '#modules/adms/parsers/options.parser'
import { attlogLayoutFor } from '#modules/adms/parsers/parser.types'
import IncidentService from '#modules/adms/raw/incident.service'
import logger from '@adonisjs/core/services/logger'
import ExecutionEvidenceService from '#modules/device-commands/evidence/execution_evidence.service'
import DeviceProfileRepositoryMysql from './device_profile.repository.mysql.js'
import {
  clampBytes,
  clampProfileTexts,
  clampText,
  DESCRIPTOR_TEXT_LIMITS,
  OPTIONS_RAW_MAX_BYTES,
} from './device_profile.limits.js'
import type {
  AccessPointDescriptor,
  DeviceProfilePatch,
  DeviceProfileRepository,
} from './device_profile.repository.js'

export interface OptionsUpsertResult {
  platform: string | null
  layoutKnown: boolean
  changedFields: string[]
  mismatches: number
}

interface VersionChange {
  field: string
  previous: string
  current: string
}

const VERSION_CHANGED_DEDUPE_MINUTES = 60
const PLATFORM_DEDUPE_MINUTES = 24 * 60

/**
 * Perfil del equipo a partir de `options` (spec 9.1). Nunca bloquea la
 * subida: una plataforma desconocida o un cambio de version quedan como
 * incidentes y el perfil se escribe igual. Ausencia de dato es null.
 */
export default class DeviceProfileService {
  constructor(
    private readonly profiles: DeviceProfileRepository = new DeviceProfileRepositoryMysql(),
    private readonly incidents: IncidentService = new IncidentService(),
    private readonly evidence: ExecutionEvidenceService = new ExecutionEvidenceService()
  ) {}

  /**
   * Llena el perfil con el volcado que el equipo devuelve al acusar un `INFO`
   * (spec 6.5, medido en hardware el 2026-09-08).
   *
   * Existe porque hay un hueco real en el ciclo: un aparato que hizo su saludo
   * mientras estaba en cuarentena recibio un `OK` seco, se quedo sondeando y NO
   * vuelve a saludar por su cuenta. Sin `options` no hay plataforma, y sin
   * plataforma sus checadas se leen con una disposicion que puede no ser la
   * suya. `INFO` es la unica via de preguntarselo.
   *
   * El volcado trae los mismos pares que `options` separados por saltos de
   * linea en vez de comas, asi que lo interpreta el mismo parser.
   */
  async upsertFromInfo(
    device: ResolvedAdmsDevice,
    dump: string,
    rawMessageId: number
  ): Promise<OptionsUpsertResult> {
    return this.upsertFromOptions(device, dump, rawMessageId)
  }

  async upsertFromOptions(
    device: ResolvedAdmsDevice,
    body: string,
    rawMessageId: number
  ): Promise<OptionsUpsertResult> {
    const parsed = parseOptionsBody(body)
    const versions = resolveVersions(parsed)
    const previous = await this.profiles.ensure(device.accessPointId, device.businessUnitId)

    const changes = this.detectVersionChanges(previous, {
      fwVersion: parsed.fwVersion,
      fpVersion: versions.fpVersion,
      faceVersion: versions.faceVersion,
    })
    for (const change of changes) {
      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.VERSION_CHANGED,
          severity: 'warning',
          code: ADMS_ERROR_CODES.DEV_SERIAL_UNKNOWN,
          title: 'El checador cambio de version',
          detail:
            'El equipo declara un firmware o algoritmo distinto al que tenia registrado. Revisar compatibilidad de templates antes de replicar.',
          key: 'version-cambiada',
          serial: device.serial,
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          rawMessageId,
          context: { field: change.field, previous: change.previous, current: change.current },
          now: device.receivedAt,
        },
        { dedupeMinutes: VERSION_CHANGED_DEDUPE_MINUTES }
      )
    }

    for (const mismatch of versions.mismatches) {
      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.VERSION_SOURCE_MISMATCH,
          severity: 'info',
          code: ADMS_ERROR_CODES.DEV_SERIAL_UNKNOWN,
          title: 'Versiones de algoritmo discrepantes',
          detail:
            'MultiBioVersion y el campo suelto no coinciden; prevalece MultiBioVersion (spec 9.1).',
          key: 'version-discrepante',
          serial: device.serial,
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          rawMessageId,
          context: {
            modality: mismatch.modality,
            previous: mismatch.flat,
            current: mismatch.multi,
          },
          now: device.receivedAt,
        },
        { dedupeMinutes: PLATFORM_DEDUPE_MINUTES }
      )
    }

    const layout = attlogLayoutFor(parsed.platform)
    const layoutKnown = layout !== null
    /**
     * El equipo ya declaro una plataforma que si sabemos leer: los avisos que
     * decian lo contrario dejan de ser ciertos. Si se quedaran abiertos, la
     * ficha marcaria un problema inexistente para siempre y la gente
     * aprenderia a ignorar el indicador.
     */
    if (layoutKnown) {
      await this.incidents.resolveResolvedCause(
        ADMS_INCIDENT_KIND.UNKNOWN_PLATFORM,
        device.accessPointId,
        device.receivedAt
      )
      await this.incidents.resolveResolvedCause(
        ADMS_INCIDENT_KIND.UNKNOWN_LAYOUT,
        device.accessPointId,
        device.receivedAt
      )
    }
    if (parsed.platform !== null && !layoutKnown) {
      await this.incidents.record(
        {
          kind: ADMS_INCIDENT_KIND.UNKNOWN_PLATFORM,
          severity: 'warning',
          code: ADMS_ERROR_CODES.VAL_LAYOUT_UNKNOWN,
          title: 'Plataforma no validada',
          detail:
            'El equipo declara una plataforma fuera del mapa validado en hardware; las checadas se guardaran crudas hasta que se agregue su disposicion.',
          key: 'plataforma-desconocida',
          serial: device.serial,
          accessPointId: device.accessPointId,
          businessUnitId: device.businessUnitId,
          rawMessageId,
          context: { platform: parsed.platform },
          now: device.receivedAt,
        },
        { dedupeMinutes: PLATFORM_DEDUPE_MINUTES }
      )
    }

    const patch: DeviceProfilePatch = {
      accessPointProfilePlatform: parsed.platform,
      accessPointProfileFwVersion: parsed.fwVersion,
      accessPointProfilePushVersion: parsed.pushVersion,
      accessPointProfileOemVendor: parsed.oemVendor,
      accessPointProfileLayoutKnown: layoutKnown ? 1 : 0,
      accessPointProfileFpVersion: versions.fpVersion,
      accessPointProfileFaceVersion: versions.faceVersion,
      accessPointProfileFvVersion: versions.fvVersion,
      accessPointProfilePvVersion: versions.pvVersion,
      accessPointProfileVersionsSource:
        Object.keys(versions.source).length > 0 ? versions.source : null,
      accessPointProfileMultiBioDataSupport: parsed.multiBioDataSupport,
      accessPointProfileMultiBioPhotoSupport: parsed.multiBioPhotoSupport,
      accessPointProfileMultiBioVersion: parsed.multiBioVersion,
      accessPointProfileMaxMultiBioDataCount: parsed.maxMultiBioDataCount,
      accessPointProfileMaxMultiBioPhotoCount: parsed.maxMultiBioPhotoCount,
      accessPointProfileMaxFaceCount: parsed.maxFaceCount,
      accessPointProfileMaxUserPhotoCount: parsed.maxUserPhotoCount,
      accessPointProfileMaxUserCount: parsed.maxUserCount,
      accessPointProfileMaxFingerCount: parsed.maxFingerCount,
      accessPointProfileMaxAttLogCount: parsed.maxAttLogCount,
      accessPointProfileUserCount: parsed.userCount,
      accessPointProfileFpCount: parsed.fpCount,
      accessPointProfileFaceCount: parsed.faceCount,
      accessPointProfileTransactionCount: parsed.transactionCount,
      accessPointProfileFingerFunOn: parsed.fingerFunOn,
      accessPointProfileFaceFunOn: parsed.faceFunOn,
      accessPointProfilePhotoFunOn: parsed.photoFunOn,
      accessPointProfileUserPicUrlFunOn: parsed.userPicUrlFunOn,
      accessPointProfileSipEnableUnit: parsed.sipEnableUnit,
      accessPointProfileVisualIntercomFunOn: parsed.visualIntercomFunOn,
      accessPointProfileSubcontractingUpgradeFunOn: parsed.subcontractingUpgradeFunOn,
      accessPointProfileVideoProtocol: parsed.videoProtocol,
      accessPointProfileOptionsRaw: body.length > 0 ? clampBytes(body, OPTIONS_RAW_MAX_BYTES) : null,
      accessPointProfileOptionsReadAt: device.receivedAt,
    }
    /**
     * Recortado al ancho de cada columna. Lo que manda el equipo no lo valida
     * nadie y un firmware distinto puede traer un valor mas largo del que cabe:
     * en modo estricto eso no trunca, falla, y el perfil se queda sin
     * actualizar mientras cada subida levanta un incidente.
     */
    await this.profiles.applyOptions(
      device.accessPointId,
      device.businessUnitId,
      clampProfileTexts(patch)
    )

    const descriptor: AccessPointDescriptor = {
      deviceName: clampText(parsed.deviceName, DESCRIPTOR_TEXT_LIMITS.deviceName),
      mac: clampText(parsed.mac, DESCRIPTOR_TEXT_LIMITS.mac),
      ip: clampText(parsed.ipAddress, DESCRIPTOR_TEXT_LIMITS.ip),
      firmware: clampText(parsed.fwVersion, DESCRIPTOR_TEXT_LIMITS.firmware),
      platform: clampText(parsed.platform, DESCRIPTOR_TEXT_LIMITS.platform),
    }
    if (Object.values(descriptor).some((value) => value !== null)) {
      await this.profiles.copyDescriptor(device.accessPointId, descriptor)
    }

    /**
     * Los contadores del equipo son la tercera prueba de ejecucion (spec 6.6):
     * si el numero de huellas subio respecto al que se guardo al acusar, la
     * huella entro. En su propio try/catch, que el perfil ya se guardo.
     */
    try {
      await this.evidence.fromCounters({
        accessPointId: device.accessPointId,
        counters: {
          fpCount: parsed.fpCount,
          faceCount: parsed.faceCount,
          userCount: parsed.userCount,
        },
        now: device.receivedAt,
      })
    } catch (error) {
      logger.warn(
        { accessPointId: device.accessPointId, error: (error as Error).message.slice(0, 200) },
        'canal ADMS: el perfil se guardo pero no se pudo cerrar un comando con sus contadores'
      )
    }

    return {
      platform: parsed.platform,
      layoutKnown,
      changedFields: changes.map((change) => change.field),
      mismatches: versions.mismatches.length,
    }
  }

  /** Solo cuenta como cambio cuando habia valor previo y el nuevo existe y difiere. */
  private detectVersionChanges(
    previous: {
      accessPointProfileFwVersion?: string | null
      accessPointProfileFpVersion?: string | null
      accessPointProfileFaceVersion?: string | null
    },
    current: { fwVersion: string | null; fpVersion: string | null; faceVersion: string | null }
  ): VersionChange[] {
    const pairs: Array<[string, string | null | undefined, string | null]> = [
      ['fwVersion', previous.accessPointProfileFwVersion, current.fwVersion],
      ['fpVersion', previous.accessPointProfileFpVersion, current.fpVersion],
      ['faceVersion', previous.accessPointProfileFaceVersion, current.faceVersion],
    ]
    const changes: VersionChange[] = []
    for (const [field, before, after] of pairs) {
      if (before && after && before !== after) {
        changes.push({ field, previous: before, current: after })
      }
    }
    return changes
  }
}
