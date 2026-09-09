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

export interface ReplicationInput {
  employeeId: number
  businessUnitId: number
  sourceAccessPointId: number
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
    private readonly consent: ConsentGate = new ConsentGate()
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
  }): Promise<ReplicationItem[]> {
    const { input, pivot, pin, slots, targetVersion } = args
    const fingers = [...new Set(slots.filter((slot) => slot.bioType === BIO_TYPE.FINGERPRINT).map((slot) => slot.bioNo))]

    if (fingers.length === 0) {
      return [skip(REPLICATION_MODALITY.FINGERPRINT, 0, REPLICATION_SKIP.NOTHING_TO_COPY)]
    }

    const items: ReplicationItem[] = []
    for (const bioNo of fingers.sort((a, b) => a - b)) {
      const compatible = await this.templates.findCompatible(
        input.employeeId,
        BIO_TYPE.FINGERPRINT,
        bioNo,
        targetVersion
      )
      if (!compatible) {
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
        })
      )
    }
    return items
  }

  private async replicateFace(args: {
    input: ReplicationInput
    pivot: AccessPointEmployee
    pin: string
    slots: TemplateSlot[]
    photoEnabled: boolean
    derivativeVersion: number
    targetVersion: string | null
    now: DateTime
  }): Promise<ReplicationItem> {
    const { input, pivot, pin, slots, photoEnabled, targetVersion, now } = args

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
  }): Promise<ReplicationItem> {
    const { input, pivot, pin, slot, bioType, modality } = args

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
