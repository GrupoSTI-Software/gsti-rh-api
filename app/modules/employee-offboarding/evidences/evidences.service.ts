import { cuid } from '@adonisjs/core/helpers'
import db from '@adonisjs/lucid/services/db'
import type { I18n } from '@adonisjs/i18n'
import RoleService from '#services/role_service'
import UploadService from '#services/upload_service'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '../concepts/concepts.constants.js'
import { EMPLOYEE_OFFBOARDING_STATUS } from '../offboardings/offboardings.constants.js'
import {
  EVIDENCE_ALLOWED_EXTENSIONS,
  EVIDENCE_ALLOWED_MIME_TYPES,
  EVIDENCE_MAX_FILE_BYTES,
  EVIDENCE_MAX_FILES_PER_BATCH,
  EVIDENCE_S3_FOLDER,
  EVIDENCE_SIGNED_URL_EXPIRES_SECONDS,
} from './evidences.constants.js'
import EvidencesRepositoryMysql from './evidences.repository.mysql.js'
import type { EvidenceCreateData, EvidencesRepository } from './evidences.repository.js'
import {
  toEvidenceDto,
  type EmployeeOffboardingItemEvidenceDto,
} from './dto/evidences.dto.js'

/** Acciones del módulo `employee-offboardings` que usa este slice (regla 9). */
export type EmployeeOffboardingEvidenceAction = 'read' | 'create' | 'delete'

/** Archivo rechazado del envío, con el código de su causa (D-3). */
interface RejectedFile {
  fileName: string
  code: string
}

/**
 * Reglas de negocio de la evidencia de salida (USRH1786568279593): varios
 * archivos por pendiente subidos en un envío todo-o-nada con el ofensor
 * identificado (regla 3, D-3), archivos privados en S3 con URL firmada de 5
 * minutos (regla 4), borrado lógico que conserva el objeto (regla 5, D-5) y
 * aislamiento en tres saltos por el BU snapshoteado del expediente (D-8).
 * La bandera `requiresEvidence` NUNCA valida ni bloquea nada aquí (D-6).
 */
export default class EvidencesService {
  private t: (key: string, params?: { [key: string]: string | number }) => string
  private readonly repository: EvidencesRepository

  constructor(i18n: I18n, repository: EvidencesRepository = new EvidencesRepositoryMysql()) {
    this.t = i18n.formatMessage.bind(i18n)
    this.repository = repository
  }

  /**
   * Regla 9 — permiso granular sobre el módulo `employee-offboardings`.
   * `root` y `owner` hacen bypass dentro de `RoleService.hasAccess`.
   */
  async assertCanAccess(
    roleId: number | null | undefined,
    action: EmployeeOffboardingEvidenceAction
  ) {
    const forbidden = () =>
      new EmployeeOffboardingServiceError({
        key: 'sin-permiso',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_FORBIDDEN,
        httpStatus: 403,
        title: this.t('employee_offboarding_forbidden_title'),
        detail: this.t('employee_offboarding_forbidden_message'),
      })

    if (!roleId) {
      throw forbidden()
    }

    const roleService = new RoleService()
    const hasAccess = await roleService.hasAccess(
      roleId,
      EMPLOYEE_OFFBOARDINGS_MODULE_SLUG,
      action
    )
    if (!hasAccess) {
      throw forbidden()
    }
  }

  /** Evidencias vivas del pendiente, orden `created_at DESC, id DESC`. */
  async listByItem(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number,
    businessUnitScope: number[]
  ): Promise<EmployeeOffboardingItemEvidenceDto[]> {
    const { item } = await this.resolveItem(
      employeeOffboardingId,
      employeeOffboardingItemId,
      businessUnitScope
    )
    const evidences = await this.repository.listByItem(item.employeeOffboardingItemId)
    return evidences.map(toEvidenceDto)
  }

  /**
   * Envío todo-o-nada (regla 3, D-3): se valida el envío ENTERO antes de
   * tocar S3 — si algo falla, 400 con el ofensor nombrado y
   * `rejectedFiles[]`, y no se sube ni persiste nada. Un fallo de
   * infraestructura a media subida revierte todas las filas (500); los
   * objetos ya escritos quedan inertes, sin referencia en base de datos.
   */
  async uploadBatch(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number,
    files: any[],
    businessUnitScope: number[]
  ): Promise<EmployeeOffboardingItemEvidenceDto[]> {
    const { offboarding, item } = await this.resolveItem(
      employeeOffboardingId,
      employeeOffboardingItemId,
      businessUnitScope
    )
    this.assertCaseWritable(offboarding)

    this.assertBatchValid(files)

    const rows: EvidenceCreateData[] = []
    for (const file of files) {
      const sanitizedName = this.sanitizeFileName(file.clientName ?? 'evidence')
      const s3Key = await this.uploadToS3(file, item.employeeOffboardingItemId, sanitizedName)
      rows.push({
        employeeOffboardingItemId: item.employeeOffboardingItemId,
        employeeOffboardingItemEvidenceFile: s3Key,
        employeeOffboardingItemEvidenceOriginalName: sanitizedName,
      })
    }

    const created = await db.transaction(
      async (trx) => await this.repository.createEvidences(rows, trx)
    )
    return created.map(toEvidenceDto)
  }

  /** URL pre-firmada temporal (5 min) para descargar la evidencia (regla 4). */
  async getDownloadUrl(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number,
    employeeOffboardingItemEvidenceId: number,
    businessUnitScope: number[]
  ): Promise<{ downloadUrl: string; expiresInSeconds: number }> {
    const { evidence } = await this.resolveEvidence(
      employeeOffboardingId,
      employeeOffboardingItemId,
      employeeOffboardingItemEvidenceId,
      businessUnitScope
    )

    const uploadService = new UploadService()
    const url = await uploadService.getDownloadLink(
      evidence.employeeOffboardingItemEvidenceFile,
      EVIDENCE_SIGNED_URL_EXPIRES_SECONDS
    )

    // `getDownloadLink` devuelve un OBJETO en error: la guarda es obligatoria.
    if (typeof url !== 'string') {
      throw new EmployeeOffboardingServiceError({
        key: 'evidencia-descarga-fallida',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.EVID_S3_FAILED,
        httpStatus: 500,
        title: this.t('employee_offboarding_evidence_download_failed_title'),
        detail: this.t('employee_offboarding_evidence_download_failed_message'),
      })
    }

    return { downloadUrl: url, expiresInSeconds: EVIDENCE_SIGNED_URL_EXPIRES_SECONDS }
  }

  /** Borrado lógico (regla 5, D-5): el objeto de S3 se conserva SIEMPRE. */
  async removeEvidence(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number,
    employeeOffboardingItemEvidenceId: number,
    businessUnitScope: number[]
  ): Promise<void> {
    const { offboarding, evidence } = await this.resolveEvidence(
      employeeOffboardingId,
      employeeOffboardingItemId,
      employeeOffboardingItemEvidenceId,
      businessUnitScope
    )
    this.assertCaseWritable(offboarding)
    await this.repository.softDeleteEvidence(evidence)
  }

  /**
   * Aislamiento en tres saltos (§9.3, D-8): expediente por su BU
   * snapshoteado, pendiente acotado por el expediente. 404 uniforme
   * `pendiente-no-encontrado` en ambos saltos; nada toca `employees`.
   * Devuelve también el expediente: las ESCRITURAS le aplican la guarda de
   * cerrado (regla 8 de USRH1786568279596); las lecturas lo ignoran.
   */
  private async resolveItem(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number,
    businessUnitScope: number[]
  ) {
    const offboarding = await this.repository.findOffboardingInScope(
      employeeOffboardingId,
      businessUnitScope
    )
    if (!offboarding) {
      throw this.itemNotFoundError()
    }

    const item = await this.repository.findItemInCase(
      employeeOffboardingId,
      employeeOffboardingItemId
    )
    if (!item) {
      throw this.itemNotFoundError()
    }
    return { offboarding, item }
  }

  /**
   * Regla 8 (USRH1786568279596): un expediente cerrado no admite subir ni
   * quitar comprobantes — 409 sin persistir nada. Consultarlo y descargar
   * sus comprobantes sigue permitido, por eso la guarda NO vive en
   * `resolveItem`.
   */
  private assertCaseWritable(offboarding: { employeeOffboardingStatus: string }): void {
    if (offboarding.employeeOffboardingStatus === EMPLOYEE_OFFBOARDING_STATUS.CLOSED) {
      throw new EmployeeOffboardingServiceError({
        key: 'expediente-cerrado',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_CLOSED_READ_ONLY,
        httpStatus: 409,
        title: this.t('employee_offboarding_case_closed_read_only_title'),
        detail: this.t('employee_offboarding_case_closed_read_only_message'),
      })
    }
  }

  /** Tercer salto: la evidencia acotada por el pendiente (404 uniforme). */
  private async resolveEvidence(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number,
    employeeOffboardingItemEvidenceId: number,
    businessUnitScope: number[]
  ) {
    const { offboarding, item } = await this.resolveItem(
      employeeOffboardingId,
      employeeOffboardingItemId,
      businessUnitScope
    )

    const evidence = await this.repository.findEvidenceInItem(
      item.employeeOffboardingItemId,
      employeeOffboardingItemEvidenceId
    )
    if (!evidence) {
      throw new EmployeeOffboardingServiceError({
        key: 'evidencia-no-encontrada',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.EVID_NOT_FOUND,
        httpStatus: 404,
        title: this.t('employee_offboarding_evidence_not_found_title'),
        detail: this.t('employee_offboarding_evidence_not_found_message'),
      })
    }
    return { offboarding, evidence }
  }

  /**
   * Fase de validación completa previa a S3 (D-3): conteo del envío y, por
   * archivo, extensión, MIME y tamaño. El error nombra al PRIMER ofensor y
   * `data.rejectedFiles[]` trae todos con su causa.
   */
  private assertBatchValid(files: any[]): void {
    if (!Array.isArray(files) || files.length === 0 || files.length > EVIDENCE_MAX_FILES_PER_BATCH) {
      throw new EmployeeOffboardingServiceError({
        key: 'lote-invalido',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.EVID_BATCH_INVALID,
        httpStatus: 400,
        title: this.t('employee_offboarding_evidence_batch_invalid_title'),
        detail: this.t('employee_offboarding_evidence_batch_invalid_message', {
          max: EVIDENCE_MAX_FILES_PER_BATCH,
        }),
      })
    }

    const rejected: RejectedFile[] = []
    for (const file of files) {
      const fileName = `${file?.clientName ?? 'evidence'}`
      const ext = `${file?.extname ?? ''}`.toLowerCase()
      const mime = `${file?.type ?? ''}/${file?.subtype ?? ''}`.toLowerCase()

      const validType =
        EVIDENCE_ALLOWED_EXTENSIONS.includes(ext as (typeof EVIDENCE_ALLOWED_EXTENSIONS)[number]) &&
        EVIDENCE_ALLOWED_MIME_TYPES.includes(mime as (typeof EVIDENCE_ALLOWED_MIME_TYPES)[number])
      if (!validType) {
        rejected.push({ fileName, code: EMPLOYEE_OFFBOARDING_ERROR_CODES.EVID_INVALID_FILE_TYPE })
        continue
      }

      if (typeof file?.size === 'number' && file.size > EVIDENCE_MAX_FILE_BYTES) {
        rejected.push({ fileName, code: EMPLOYEE_OFFBOARDING_ERROR_CODES.EVID_FILE_TOO_LARGE })
      }
    }

    if (rejected.length === 0) {
      return
    }

    const offender = rejected[0]
    const tooLarge = offender.code === EMPLOYEE_OFFBOARDING_ERROR_CODES.EVID_FILE_TOO_LARGE
    throw new EmployeeOffboardingServiceError({
      key: tooLarge ? 'archivo-demasiado-grande' : 'archivo-invalido',
      errorCode: tooLarge
        ? EMPLOYEE_OFFBOARDING_ERROR_CODES.EVID_FILE_TOO_LARGE
        : EMPLOYEE_OFFBOARDING_ERROR_CODES.EVID_INVALID_FILE_TYPE,
      httpStatus: 400,
      title: tooLarge
        ? this.t('employee_offboarding_evidence_too_large_title')
        : this.t('employee_offboarding_evidence_invalid_type_title'),
      detail: tooLarge
        ? this.t('employee_offboarding_evidence_too_large_message', {
            fileName: offender.fileName,
          })
        : this.t('employee_offboarding_evidence_invalid_type_message', {
            fileName: offender.fileName,
          }),
      data: { rejectedFiles: rejected },
    })
  }

  /** Sube privado con Key `carpeta/pendiente/cuid-nombre`; centinelas = 500. */
  private async uploadToS3(file: any, itemId: number, sanitizedName: string): Promise<string> {
    const key = `${EVIDENCE_S3_FOLDER}/${itemId}/${cuid()}-${sanitizedName}`
    const uploadService = new UploadService()
    const result = await uploadService.fileUpload(file, 'evidence-document', '', { fileName: key })

    if (!result || result === 'file_not_found' || result === 'S3Producer.fileUpload') {
      throw new EmployeeOffboardingServiceError({
        key: 'evidencia-subida-fallida',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.EVID_S3_FAILED,
        httpStatus: 500,
        title: this.t('employee_offboarding_evidence_upload_failed_title'),
        detail: this.t('employee_offboarding_evidence_upload_failed_message'),
      })
    }
    return result
  }

  /** Saneado del nombre: caracteres seguros, sin `..`, corte a 100 (§12). */
  private sanitizeFileName(rawName: string): string {
    return `${rawName}`
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(0, 100)
  }

  private itemNotFoundError() {
    return new EmployeeOffboardingServiceError({
      key: 'pendiente-no-encontrado',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.ITEM_NOT_FOUND,
      httpStatus: 404,
      title: this.t('employee_offboarding_item_not_found_title'),
      detail: this.t('employee_offboarding_item_not_found_message'),
    })
  }
}
