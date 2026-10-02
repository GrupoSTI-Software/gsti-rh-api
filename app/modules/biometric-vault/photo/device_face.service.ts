import { DateTime } from 'luxon'
import { BIOMETRIC_VAULT_ERROR_CODES } from '#constants/biometric_vault_error_codes'
import { BiometricVaultError } from '#exceptions/biometric_vault_error'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import { DEVICE_COMMAND_KIND } from '#modules/device-commands/device_command.constants'
import DeviceCommandService from '#modules/device-commands/device_command.service'
import type { DeviceCommandPort } from '#modules/device-commands/device_command_port'
import EmployeeSyncRepositoryMysql from '#modules/access-point/employee-sync/employee_sync.repository.mysql'
import type { EmployeeSyncRepository } from '#modules/access-point/employee-sync/employee_sync.repository'
import type AccessPointEmployee from '#models/access_point_employee'
import { ACCESS_POINT_EMPLOYEE_SYNC_STATUS } from '#models/access_point_employee'
import ConsentGate from '../consent/consent_gate.js'
import PhotoDerivativeService from './photo_derivative.service.js'
import PhotoPublicationService, { photoDeleteCorrelationKey } from './photo_publication.service.js'
import { PHOTO_VERDICT } from './photo.constants.js'
import AccessPointProfile from '#models/access_point_profile'
import { acceptsFacePhoto } from './device_face_support.js'

export interface EnableFaceInput {
  employeeId: number
  businessUnitId: number
  /** Equipos concretos, o vacio para todos los que ya lo tienen confirmado. */
  accessPointIds: number[]
  actorUserId: number | null
  now?: DateTime
}

export interface FaceTargetResult {
  accessPointId: number
  status: 'published' | 'already_published' | 'skipped'
  reason?: 'sin-pin-en-el-equipo' | 'equipo-sin-rostro'
}

/** Lo que paso con los checadores despues de cambiar o borrar la foto. */
export type FacePhotoChangeOutcome =
  | { status: 'not_in_use' }
  | { status: 'republished'; derivativeVersion: number; targets: FaceTargetResult[] }
  /**
   * No se pudo re-publicar (sin consentimiento, almacenamiento): se apago el uso
   * en dispositivos para que ningun equipo se quede con la cara anterior.
   */
  | { status: 'disabled'; reason: string }

export interface EnableFaceResult {
  derivativeVersion: number
  targets: FaceTargetResult[]
}

/**
 * Enciende y apaga el uso de la foto del colaborador en los checadores
 * (spec ADMS 7.2 y 7.3).
 *
 * Tener foto en el expediente no autoriza a mandarla a un aparato en sitio:
 * son dos tratamientos distintos del mismo dato y este interruptor es el
 * segundo, con consentimiento, con nombre de quien lo encendio y con fecha.
 */
export default class DeviceFaceService {
  constructor(
    private readonly derivatives: PhotoDerivativeService = new PhotoDerivativeService(),
    private readonly publications: PhotoPublicationService = new PhotoPublicationService(),
    private readonly pivots: EmployeeSyncRepository = new EmployeeSyncRepositoryMysql(),
    private readonly commands: DeviceCommandPort = new DeviceCommandService(),
    private readonly consent: ConsentGate = new ConsentGate()
  ) {}

  async enable(input: EnableFaceInput): Promise<EnableFaceResult> {
    const now = input.now ?? DateTime.utc()

    await this.consent.assertGranted(input.employeeId)

    const faceId = await this.requireFaceId(input.employeeId)

    /**
     * La calidad que declaro el Backoffice al subir la foto NO es la puerta: se
     * midio sobre otra imagen y en otro momento. La puerta es el veredicto
     * propio sobre el derivado que de verdad va a salir hacia el equipo.
     */
    const built = await this.derivatives.build(faceId.employeeBiometricFaceIdPhotoUrl)
    if (!built.ok) {
      faceId.employeeBiometricFaceIdDerivativeVerdict = built.verdict
      await faceId.save()
      throw new BiometricVaultError(
        'La foto no sirve como referencia en el checador',
        BIOMETRIC_VAULT_ERROR_CODES.PHOTO_QUALITY,
        422,
        'foto-no-apta',
        built.detail
      )
    }

    const version = faceId.employeeBiometricFaceIdDerivativeVersion + 1
    const key = await this.derivatives.store(input.employeeId, version, built.buffer)

    faceId.employeeBiometricFaceIdDerivativeKey = key
    faceId.employeeBiometricFaceIdDerivativeVersion = version
    faceId.employeeBiometricFaceIdDerivativeVerdict = PHOTO_VERDICT.OK
    faceId.employeeBiometricFaceIdDeviceUse = true
    faceId.employeeBiometricFaceIdDeviceUseByUserId = input.actorUserId
    faceId.employeeBiometricFaceIdDeviceUseAt = now
    await faceId.save()

    /**
     * La version anterior deja de valer: cualquier publicacion viva apunta a
     * una foto que ya no es la vigente.
     */
    await this.publications.withdrawForEmployee(input.employeeId, now)

    const targets = await this.resolveTargets(input)
    const results: FaceTargetResult[] = []
    const supported = await this.faceCapableAccessPoints(targets)
    for (const pivot of targets) {
      const pin = pivot.accessPointEmployeePin
      if (!pin || pin.length === 0) {
        results.push({
          accessPointId: pivot.accessPointId,
          status: 'skipped',
          reason: 'sin-pin-en-el-equipo',
        })
        continue
      }
      /** Un aparato que declaro no tener rostro rechazaria la foto con un acuse limpio. */
      if (!supported.has(pivot.accessPointId)) {
        results.push({
          accessPointId: pivot.accessPointId,
          status: 'skipped',
          reason: 'equipo-sin-rostro',
        })
        continue
      }
      const published = await this.publications.publish({
        businessUnitId: input.businessUnitId,
        employeeId: input.employeeId,
        accessPointId: pivot.accessPointId,
        accessPointEmployeeId: pivot.accessPointEmployeeId,
        pin,
        derivativeVersion: version,
        requestedByUserId: input.actorUserId,
        now,
      })
      results.push({
        accessPointId: pivot.accessPointId,
        status: published.commandCreated ? 'published' : 'already_published',
      })
    }

    return { derivativeVersion: version, targets: results }
  }

  /**
   * Apaga el interruptor, retira las publicaciones y le pide a cada equipo que
   * borre la foto que ya tiene.
   *
   * El orden importa: primero se cierra la puerta de descarga y despues se pide
   * el borrado. Al reves quedaria una ventana en la que la orden ya salio pero
   * el enlace todavia sirve.
   */
  async disable(input: {
    employeeId: number
    businessUnitId: number
    actorUserId: number | null
    now?: DateTime
  }): Promise<{ withdrawn: number; deleteCommands: number }> {
    const now = input.now ?? DateTime.utc()
    const faceId = await this.requireFaceId(input.employeeId)

    faceId.employeeBiometricFaceIdDeviceUse = false
    faceId.employeeBiometricFaceIdDeviceUseByUserId = input.actorUserId
    faceId.employeeBiometricFaceIdDeviceUseAt = now
    await faceId.save()

    const withdrawn = await this.publications.withdrawForEmployee(input.employeeId, now)

    const pivots = await this.pivots.listLiveByEmployee(input.employeeId)
    const supported = await this.faceCapableAccessPoints(pivots)
    let deleteCommands = 0
    for (const pivot of pivots) {
      const pin = pivot.accessPointEmployeePin
      if (!pin || pin.length === 0) continue
      if (!supported.has(pivot.accessPointId)) continue
      await this.commands.enqueue({
        accessPointId: pivot.accessPointId,
        businessUnitId: pivot.businessUnitId,
        kind: DEVICE_COMMAND_KIND.BIOPHOTO_DELETE,
        fields: { pin, bioNo: 9 },
        employeeId: input.employeeId,
        accessPointEmployeeId: pivot.accessPointEmployeeId,
        correlationKey: photoDeleteCorrelationKey(pin),
        requestedByUserId: input.actorUserId,
      })
      deleteCommands += 1
    }

    return { withdrawn, deleteCommands }
  }

  /**
   * La foto del expediente cambio: si esta en uso en los checadores, se manda
   * la nueva a los mismos equipos.
   *
   * Nunca lanza. La foto nueva ya quedo guardada y eso no se deshace; si no se
   * puede re-publicar, se apaga el uso en dispositivos y se pide el borrado, para
   * que ningun checador siga reconociendo con una cara que el expediente ya no
   * tiene.
   */
  async syncAfterPhotoChange(input: {
    employeeId: number
    businessUnitId: number
    actorUserId: number | null
    now?: DateTime
  }): Promise<FacePhotoChangeOutcome> {
    const faceId = await EmployeeBiometricFaceId.query()
      .where('employee_id', input.employeeId)
      .whereNull('employee_biometric_face_id_deleted_at')
      .first()
    if (!faceId || !faceId.employeeBiometricFaceIdDeviceUse) return { status: 'not_in_use' }

    try {
      const result = await this.enable({ ...input, accessPointIds: [] })
      return { status: 'republished', ...result }
    } catch (error) {
      await this.disable(input)
      return {
        status: 'disabled',
        reason: (error instanceof BiometricVaultError ? error.key : undefined) ?? 'error-inesperado',
      }
    }
  }

  /**
   * Antes de borrar la foto del expediente: si estaba en los checadores, se
   * retira de ellos. Borrar solo el archivo dejaba la cara viva en cada equipo.
   */
  async withdrawBeforePhotoDeletion(input: {
    employeeId: number
    businessUnitId: number
    actorUserId: number | null
    now?: DateTime
  }): Promise<{ withdrawn: number; deleteCommands: number } | null> {
    const faceId = await EmployeeBiometricFaceId.query()
      .where('employee_id', input.employeeId)
      .whereNull('employee_biometric_face_id_deleted_at')
      .first()
    if (!faceId || !faceId.employeeBiometricFaceIdDeviceUse) return null
    return this.disable(input)
  }

  /** Equipos de la lista que no declararon carecer de rostro. */
  private async faceCapableAccessPoints(pivots: AccessPointEmployee[]): Promise<Set<number>> {
    const ids = [...new Set(pivots.map((pivot) => pivot.accessPointId))]
    if (ids.length === 0) return new Set()
    const profiles = await AccessPointProfile.query().whereIn('access_point_id', ids)
    const byId = new Map(profiles.map((profile) => [profile.accessPointId, profile]))
    return new Set(ids.filter((id) => acceptsFacePhoto(byId.get(id) ?? null)))
  }

  private async requireFaceId(employeeId: number): Promise<EmployeeBiometricFaceId> {
    const faceId = await EmployeeBiometricFaceId.query()
      .where('employee_id', employeeId)
      .whereNull('employee_biometric_face_id_deleted_at')
      .first()
    if (faceId) return faceId
    throw new BiometricVaultError(
      'El colaborador no tiene foto biometrica',
      BIOMETRIC_VAULT_ERROR_CODES.PHOTO_MISSING,
      422,
      'sin-foto-biometrica',
      'Carga primero la foto biometrica del colaborador.'
    )
  }

  /**
   * Sin lista explicita, se publica hacia los equipos donde el colaborador ya
   * esta confirmado: mandarle la foto a un aparato donde ni siquiera existe
   * como usuario no sirve de nada.
   */
  private async resolveTargets(input: EnableFaceInput): Promise<AccessPointEmployee[]> {
    const pivots = await this.pivots.listLiveByEmployee(input.employeeId)
    if (input.accessPointIds.length > 0) {
      const wanted = new Set(input.accessPointIds)
      return pivots.filter((pivot) => wanted.has(pivot.accessPointId))
    }
    return pivots.filter(
      (pivot) =>
        pivot.accessPointEmployeeSyncStatus === ACCESS_POINT_EMPLOYEE_SYNC_STATUS.CONFIRMED
    )
  }
}
