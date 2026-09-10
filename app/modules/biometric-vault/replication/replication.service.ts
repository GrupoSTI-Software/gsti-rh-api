import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AccessPoint from '#models/access_point'
import AccessPointProfile from '#models/access_point_profile'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import { BIO_TYPE } from '../biometric_vault.constants.js'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import type { DeviceCommandPort } from '#modules/device-commands/device_command_port'
import EmployeeSyncRepositoryMysql from '#modules/access-point/employee-sync/employee_sync.repository.mysql'
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'
import type AccessPointEmployee from '#models/access_point_employee'
import IncidentService from '#modules/adms/raw/incident.service'
import { ADMS_INCIDENT_KIND } from '#modules/adms/adms.constants'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import TemplateService from '../template/template.service.js'
import type { TemplateSlot } from '../template/template.repository.js'
import ConsentGate from '../consent/consent_gate.js'
import PhotoPublicationService from '../photo/photo_publication.service.js'
import {
  REPLICATION_MODALITY,
  REPLICATION_SKIP,
  type ReplicationItem,
  type ReplicationModality,
  type ReplicationResult,
  type ReplicationTargetResult,
} from './replication.types.js'

/**
 * Cada cuanto se vuelve a asentar que un equipo no puede recibir huellas.
 *
 * La causa es del aparato y no de la persona, asi que un aviso por hora basta:
 * repetirlo por cada colaborador que pase por ahi convierte la bitacora en
 * ruido y entrena a la gente a ignorarla.
 */
const VERSION_MISMATCH_DEDUPE_MINUTES = 60

export interface ReplicationInput {
  employeeId: number
  businessUnitId: number
  /**
   * Equipo desde el que se pide la copia, solo para no copiar sobre si mismo.
   *
   * `null` cuando la copia no sale de una pantalla de un equipo sino de la
   * boveda: el template es del colaborador y su llave no lleva la serie, asi
   * que no hace falta un aparato de origen para poder escribirlo en otro.
   */
  sourceAccessPointId: number | null
  targetAccessPointIds: number[]
  modalities: ReplicationModality[]
  /** Quien pide la copia. Su IP se asienta con cada lectura de un blob. */
  actor: {
    userId: number | null
    ip: string
    userAgent: string | null
    requestId: string | null
  }
  /** Sin encolar nada: el mismo desglose para que el operador decida. */
  dryRun: boolean
  now?: DateTime
}

/**
 * Copia los biometricos de un colaborador de un checador a otros (spec 7.4).
 *
 * El caso real: alguien ya puso el dedo en la entrada y no tiene por que volver
 * a ponerlo en el comedor y en el almacen.
 *
 * Lo que se copia es el TEMPLATE, que en la boveda es del colaborador y no del
 * aparato -- su llave no lleva la serie. Del comando destino solo se reescribe
 * la cabecera con el PIN de ese equipo; el blob viaja verbatim, sin recortar ni
 * normalizar, porque cualquier retoque lo invalida.
 */
export default class ReplicationService {
  constructor(
    private readonly templates: TemplateService = new TemplateService(),
    private readonly pivots: EmployeeSyncRepository = new EmployeeSyncRepositoryMysql(),
    private readonly commands: DeviceCommandPort = new DeviceCommandService(),
    private readonly publications: PhotoPublicationService = new PhotoPublicationService(),
    private readonly consent: ConsentGate = new ConsentGate(),
    private readonly incidents: IncidentService = new IncidentService()
  ) {}

  async replicate(input: ReplicationInput): Promise<ReplicationResult> {
    const now = input.now ?? DateTime.utc()

    /**
     * Tambien en la vista previa: mostrar que biometricos tiene una persona y
     * en que equipos caben ya es hablar de sus datos biometricos.
     */
    await this.consent.assertGranted(input.employeeId)

    const modalities =
      input.modalities.length > 0
        ? input.modalities
        : [REPLICATION_MODALITY.FINGERPRINT, REPLICATION_MODALITY.FACE]

    const slots = await this.templates.occupiedSlots(input.employeeId)
    const faceId = await EmployeeBiometricFaceId.query()
      .where('employee_id', input.employeeId)
      .whereNull('employee_biometric_face_id_deleted_at')
      .first()
    const photoEnabled = faceId?.employeeBiometricFaceIdDeviceUse === true

    const targets: ReplicationTargetResult[] = []
    for (const accessPointId of input.targetAccessPointIds) {
      targets.push(
        await this.replicateInto({
          input,
          accessPointId,
          slots,
          modalities,
          photoEnabled,
          derivativeVersion: faceId?.employeeBiometricFaceIdDerivativeVersion ?? 0,
          now,
        })
      )
    }

    return { sourceAccessPointId: input.sourceAccessPointId, targets }
  }

  private async replicateInto(args: {
    input: ReplicationInput
    accessPointId: number
    slots: TemplateSlot[]
    modalities: ReplicationModality[]
    photoEnabled: boolean
    derivativeVersion: number
    now: DateTime
  }): Promise<ReplicationTargetResult> {
    const { input, accessPointId, slots, modalities, photoEnabled, now } = args

    const accessPoint = await AccessPoint.query()
      .where('access_point_id', accessPointId)
      .firstOrFail()
    const profile = await AccessPointProfile.query()
      .where('access_point_id', accessPointId)
      .first()

    const result: ReplicationTargetResult = {
      accessPointId,
      accessPointName: accessPoint.accessPointName,
      fpVersion: profile?.accessPointProfileFpVersion ?? null,
      faceVersion: profile?.accessPointProfileFaceVersion ?? null,
      items: [],
    }

    if (accessPointId === input.sourceAccessPointId) {
      result.items.push(skip(REPLICATION_MODALITY.FINGERPRINT, 0, REPLICATION_SKIP.SAME_DEVICE))
      return result
    }

    const pivot = await this.pivots.findPivot(accessPointId, input.employeeId)
    const pin = pivot?.accessPointEmployeePin ?? null
    if (!pivot || pin === null || pin.length === 0) {
      result.items.push(skip(REPLICATION_MODALITY.FINGERPRINT, 0, REPLICATION_SKIP.NO_PIN))
      return result
    }

    if (modalities.includes(REPLICATION_MODALITY.FINGERPRINT)) {
      result.items.push(
        ...(await this.replicateFingerprints({
          input,
          pivot,
          pin,
          slots,
          targetVersion: result.fpVersion,
          platform: profile?.accessPointProfilePlatform ?? null,
          serial: accessPoint.accessPointSerialNumber,
          now,
        }))
      )
    }

    if (modalities.includes(REPLICATION_MODALITY.FACE)) {
      result.items.push(
        await this.replicateFace({
          input,
          pivot,
          pin,
          slots,
          photoEnabled,
          derivativeVersion: args.derivativeVersion,
          targetVersion: result.faceVersion,
          platform: profile?.accessPointProfilePlatform ?? null,
          now,
        })
      )
    }

    return result
  }

  private async replicateFingerprints(args: {
    input: ReplicationInput
    pivot: AccessPointEmployee
    pin: string
    slots: TemplateSlot[]
    targetVersion: string | null
    platform: string | null
    serial: string | null
    now: DateTime
  }): Promise<ReplicationItem[]> {
    const { input, pivot, pin, slots, targetVersion, platform } = args
    const fingerSlots = slots.filter((slot) => slot.bioType === BIO_TYPE.FINGERPRINT)
    const fingers = [...new Set(fingerSlots.map((slot) => slot.bioNo))]

    if (fingers.length === 0) {
      return [skip(REPLICATION_MODALITY.FINGERPRINT, 0, REPLICATION_SKIP.NOTHING_TO_COPY)]
    }

    const items: ReplicationItem[] = []
    let mismatched = false
    for (const bioNo of fingers.sort((a, b) => a - b)) {
      const compatible = await this.templates.findCompatible(
        input.employeeId,
        BIO_TYPE.FINGERPRINT,
        bioNo,
        targetVersion
      )
      if (!compatible) {
        mismatched = true
        items.push({
          modality: REPLICATION_MODALITY.FINGERPRINT,
          bioNo,
          status: 'skipped',
          reason: REPLICATION_SKIP.NOT_REPLICABLE_VERSION,
        })
        continue
      }
      items.push(
        await this.queueTemplate({
          input,
          pivot,
          pin,
          slot: compatible,
          bioType: BIO_TYPE.FINGERPRINT,
          modality: REPLICATION_MODALITY.FINGERPRINT,
          platform,
        })
      )
    }

    /**
     * Solo cuando NO se pudo copiar ni una.
     *
     * Si algun dedo si cruzo, la persona puede identificarse en ese equipo y el
     * aviso seria falso. Un aviso que exagera se aprende a ignorar, y el dia
     * que diga la verdad tampoco lo van a leer.
     */
    const queued = items.some((item) => item.status !== 'skipped')
    if (mismatched && !queued && !input.dryRun) {
      await this.reportVersionMismatch({
        accessPointId: pivot.accessPointId,
        businessUnitId: input.businessUnitId,
        serial: args.serial,
        deviceVersion: targetVersion,
        vaultVersions: fingerSlots,
        now: args.now,
      })
    }
    return items
  }

  /**
   * Deja constancia de que a ese equipo no se le pudo copiar ninguna huella.
   *
   * El corte por version se queda como esta --un template de otra generacion se
   * descarta DENTRO del aparato sin devolver error, asi que mandarlo seria
   * peor--. Lo que no puede seguir pasando es que el corte sea mudo: el equipo
   * se queda con gente dada de alta que no puede identificarse con el dedo y
   * nadie se entera hasta que alguien se queda parado en la puerta.
   *
   * El incidente es del EQUIPO, no del colaborador: la causa es la version que
   * declara el aparato y es la misma para todos los que pasen por ahi. Por eso
   * deduplica por equipo y el detalle no nombra a nadie.
   */
  private async reportVersionMismatch(args: {
    accessPointId: number
    businessUnitId: number
    serial: string | null
    deviceVersion: string | null
    vaultVersions: TemplateSlot[]
    now: DateTime
  }): Promise<void> {
    const versions = [
      ...new Set(
        args.vaultVersions
          .map((slot) => slot.majorVer)
          .filter((version): version is string => version !== null && version.length > 0)
      ),
    ]

    await this.incidents.record(
      {
        kind: ADMS_INCIDENT_KIND.TEMPLATE_VERSION_MISMATCH,
        severity: 'warning',
        code: ADMS_ERROR_CODES.BIO_VERSION_MISMATCH,
        title: 'El equipo no puede recibir las huellas guardadas',
        detail:
          'El checador declara una version de algoritmo de huella distinta a la de los templates guardados, asi que no se le copio ninguna. Quien este dado de alta ahi no podra identificarse con el dedo hasta que se enrole en ese equipo o se iguale la version del aparato.',
        key: 'version-de-huella-incompatible',
        serial: args.serial,
        accessPointId: args.accessPointId,
        businessUnitId: args.businessUnitId,
        context: {
          modality: REPLICATION_MODALITY.FINGERPRINT,
          deviceVersion: args.deviceVersion ?? 'sin declarar',
          vaultVersions: versions.join(', '),
        },
        now: args.now,
      },
      { dedupeMinutes: VERSION_MISMATCH_DEDUPE_MINUTES }
    )
  }

  private async replicateFace(args: {
    input: ReplicationInput
    pivot: AccessPointEmployee
    pin: string
    slots: TemplateSlot[]
    photoEnabled: boolean
    derivativeVersion: number
    targetVersion: string | null
    platform: string | null
    now: DateTime
  }): Promise<ReplicationItem> {
    const { input, pivot, pin, slots, photoEnabled, targetVersion, platform, now } = args

    /**
     * La foto va primero: es la referencia que el propio equipo convierte a su
     * formato, asi que no depende de que las versiones de algoritmo coincidan.
     */
    if (photoEnabled) {
      if (input.dryRun) {
        return { modality: REPLICATION_MODALITY.FACE, bioNo: BIO_TYPE.FACE, status: 'queued' }
      }
      const published = await this.publications.publish({
        businessUnitId: input.businessUnitId,
        employeeId: input.employeeId,
        accessPointId: pivot.accessPointId,
        accessPointEmployeeId: pivot.accessPointEmployeeId,
        pin,
        derivativeVersion: args.derivativeVersion,
        requestedByUserId: input.actor.userId,
        now,
      })
      return {
        modality: REPLICATION_MODALITY.FACE,
        bioNo: BIO_TYPE.FACE,
        status: published.commandCreated ? 'queued' : 'already_queued',
      }
    }

    const hasFaceTemplate = slots.some((slot) => slot.bioType === BIO_TYPE.FACE)
    if (!hasFaceTemplate) {
      return skip(REPLICATION_MODALITY.FACE, BIO_TYPE.FACE, REPLICATION_SKIP.NOTHING_TO_COPY)
    }

    const compatible = await this.templates.findCompatible(
      input.employeeId,
      BIO_TYPE.FACE,
      BIO_TYPE.FACE,
      targetVersion
    )
    if (!compatible) {
      return skip(REPLICATION_MODALITY.FACE, BIO_TYPE.FACE, REPLICATION_SKIP.NOT_REPLICABLE_FACE)
    }

    return this.queueTemplate({
      input,
      pivot,
      pin,
      slot: compatible,
      bioType: BIO_TYPE.FACE,
      modality: REPLICATION_MODALITY.FACE,
      platform,
    })
  }

  /**
   * Saca el blob de la boveda y lo encola hacia el destino.
   *
   * La lectura y su asiento en la bitacora van en la MISMA transaccion que el
   * encolado: si el asiento falla, el blob no sale de la boveda y el comando no
   * se crea. Un biometrico que se lee sin que conste quien lo leyo no tiene
   * custodia.
   */
  private async queueTemplate(args: {
    input: ReplicationInput
    pivot: AccessPointEmployee
    pin: string
    slot: TemplateSlot
    bioType: number
    modality: ReplicationModality
    /** Plataforma del destino: no todas escriben la huella con la misma tabla. */
    platform: string | null
  }): Promise<ReplicationItem> {
    const { input, pivot, pin, slot, bioType, modality, platform } = args

    if (input.dryRun) {
      return { modality, bioNo: slot.bioNo, status: 'queued', majorVer: slot.majorVer }
    }

    const template = await db.transaction(async (trx) =>
      this.templates.readForReplication(
        slot.templateId,
        {
          businessUnitId: input.businessUnitId,
          userId: input.actor.userId,
          ip: input.actor.ip,
          userAgent: input.actor.userAgent,
          requestId: input.actor.requestId,
        },
        trx
      )
    )

    const detail = await this.templates.detailOf(slot.templateId)
    const result = await this.commands.enqueue({
      accessPointId: pivot.accessPointId,
      businessUnitId: input.businessUnitId,
      kind: DEVICE_COMMAND_KIND.BIODATA_WRITE,
      fields: {
        // Solo la cabecera lleva el PIN del destino. El blob va verbatim.
        pin,
        bioNo: slot.bioNo,
        bioType,
        majorVer: slot.majorVer ?? '0',
        minorVer: detail?.minorVer ?? '0',
        valid: detail?.valid ?? 1,
        duress: detail?.duress ?? 0,
        // El tamano lo declaro el equipo de origen al subirlo; `FINGERTMP` lo
        // exige en la cabecera y no admite inventarlo.
        size: detail?.size ?? template.length,
        platform: platform ?? undefined,
        template,
      },
      employeeId: input.employeeId,
      accessPointEmployeeId: pivot.accessPointEmployeeId,
      biometricTemplateId: slot.templateId,
      correlationKey: `biodata:${pin}:${bioType}:${slot.bioNo}`,
      requestedByUserId: input.actor.userId,
    })

    return {
      modality,
      bioNo: slot.bioNo,
      status: result.created ? 'queued' : 'already_queued',
      majorVer: slot.majorVer,
    }
  }
}

function skip(
  modality: ReplicationModality,
  bioNo: number,
  reason: (typeof REPLICATION_SKIP)[keyof typeof REPLICATION_SKIP]
): ReplicationItem {
  return { modality, bioNo, status: 'skipped', reason }
}
