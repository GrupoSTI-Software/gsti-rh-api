import { DateTime } from 'luxon'
import { cuid } from '@adonisjs/core/helpers'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type { FileIntakeProfileName } from '#constants/file_intake'
import type { FileUploadOptions } from '#services/upload_service'
import type Employee from '#models/employee'
import type UserConsent from '#models/user_consent'
import type User from '#models/user'
import UploadService from '#services/upload_service'
import PiiAccessLogService from '#services/pii_access_log_service'
import ConsentError from '#exceptions/consent_error'
import { CONSENT_ERROR_CODES } from '#constants/consent_error_codes'
import LegalDocumentRepositoryMysql from '#modules/legal-documents/legal_document.repository.mysql'
import type { LegalDocumentRepository } from '#modules/legal-documents/legal_document.repository'
import PhysicalConsentRepositoryMysql from './physical_consent.repository.mysql.js'
import type { PhysicalConsentRepository } from './physical_consent.repository.js'
import PhysicalConsentEmployeeScopeMysql from './physical_consent_employee_scope.mysql.js'
import type { PhysicalConsentEmployeeScope } from './physical_consent_employee_scope.js'
import type {
  PhysicalConsentDownloadUrlDto,
  PhysicalConsentRecordDto,
  PhysicalConsentStatusDto,
} from './dto/physical_consent.dto.js'

/** Solo el consentimiento biométrico se asienta por esta vía (regla 1). */
const DOCUMENT_TYPE = 'biometric_consent'

/** 10 MB (regla 5), bajo el límite global del bodyparser (20 MB). */
const MAX_FILE_BYTES = 10 * 1024 * 1024

/** PDF/JPG/PNG por extensión y MIME — doble validación, nunca solo una (S4). */
// El perfil `evidence-document` del intake es la fuente de verdad; esta lista
// es un pre-filtro barato y debe mantenerse alineada con el.
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'] as const
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

/** Carpeta lógica en S3; el escaneo se sube SIEMPRE `private` (S3). */
const S3_FOLDER = 'consent-evidences'

/** Vigencia de la URL firmada de descarga: 5 minutos, nunca 24h (S3.3). */
const SIGNED_URL_EXPIRES_SECONDS = 5 * 60

/**
 * Subconjunto de `UploadService` que consume este servicio — permite inyectar un
 * fake en tests unitarios sin tocar AWS real (mismo criterio documentado en
 * `tests/unit/services/upload_service.spec.ts`: "las rutas que tocan AWS se cubren
 * con el smoke test manual contra el servidor desplegado", pero aquí SÍ se puede
 * fakear porque el contrato es angosto y estable).
 */
export interface PhysicalConsentFileStorage {
  fileUpload(
    file: MultipartFile,
    profileName: FileIntakeProfileName,
    folderName: string,
    options?: FileUploadOptions
  ): Promise<string>
  getDownloadLink(filePath: string, expireSeconds?: number): Promise<unknown>
}

export interface RegisterPhysicalConsentInput {
  employeeId: number
  allowedBusinessUnitIds: number[]
  documentVersion: string
  signedAt: Date | null
  file: MultipartFile | null
  registeredByUserId: number
  ip: string | null
  userAgent: string | null
}

export interface DownloadContext {
  accessorUserId: number
  accessorIp: string
  accessorUserAgent: string | null
  requestId: string | null
}

/**
 * Servicio de dominio del slice `consent/physical` (USRH1784146205513).
 *
 * Orden del flujo de registro (§10.1 del spec — nunca pagar S3 con input inválido):
 * scope del empleado → versión vigente → coincidencia de versión → duplicado (por
 * AMBAS anclas) → archivo (tipo + tamaño) → subida a S3 → INSERT único.
 *
 * Invariante de anclaje (§9.4, en service, NO CHECK): el asiento físico SIEMPRE lleva
 * `employeeId`; ADEMÁS `userId` si `employee.person.user` existe (doble ancla — regla 8).
 */
export default class PhysicalConsentService {
  private readonly repository: PhysicalConsentRepository
  private readonly legalDocumentRepository: LegalDocumentRepository
  private readonly piiAccessLogService: PiiAccessLogService
  private readonly fileStorage: PhysicalConsentFileStorage
  private readonly employeeScope: PhysicalConsentEmployeeScope

  constructor(
    repository: PhysicalConsentRepository = new PhysicalConsentRepositoryMysql(),
    legalDocumentRepository: LegalDocumentRepository = new LegalDocumentRepositoryMysql(),
    piiAccessLogService: PiiAccessLogService = new PiiAccessLogService(),
    fileStorage: PhysicalConsentFileStorage = new UploadService(),
    employeeScope: PhysicalConsentEmployeeScope = new PhysicalConsentEmployeeScopeMysql()
  ) {
    this.repository = repository
    this.legalDocumentRepository = legalDocumentRepository
    this.piiAccessLogService = piiAccessLogService
    this.fileStorage = fileStorage
    this.employeeScope = employeeScope
  }

  /** `POST /api/employees/:employeeId/consents/physical`. */
  async register(input: RegisterPhysicalConsentInput): Promise<PhysicalConsentRecordDto> {
    const employee = await this.ensureEmployeeInScope(input.employeeId, input.allowedBusinessUnitIds)

    const currentDocument = await this.legalDocumentRepository.findCurrentByType(DOCUMENT_TYPE)
    if (!currentDocument) {
      throw new ConsentError(
        'sin-version-vigente-biometrico',
        'No hay una versión vigente publicada del consentimiento biométrico.',
        CONSENT_ERROR_CODES.NO_CURRENT_VERSION
      )
    }

    if (currentDocument.legalDocumentVersion !== input.documentVersion) {
      throw new ConsentError(
        'version-de-consentimiento-invalida',
        `La versión "${input.documentVersion}" no coincide con la versión vigente ` +
          `"${currentDocument.legalDocumentVersion}" del consentimiento biométrico.`,
        CONSENT_ERROR_CODES.INVALID_VERSION
      )
    }

    const linkedUserId = employee.person?.user?.userId ?? null

    const duplicate = await this.repository.findForEmployeeAndDocument(
      employee.employeeId,
      linkedUserId,
      currentDocument.legalDocumentId
    )
    if (duplicate) {
      throw new ConsentError(
        'consentimiento-ya-registrado',
        'El empleado ya tiene aceptada la versión vigente de este documento.',
        CONSENT_ERROR_CODES.DUPLICATE_CONSENT
      )
    }

    this.assertFileValid(input.file)
    const file = input.file as MultipartFile
    const sanitizedName = this.sanitizeFileName(file.clientName ?? 'evidencia')
    const evidenceKey = await this.uploadToS3(file, employee.employeeId, sanitizedName)

    const acceptedAt = DateTime.now()
    const signedAt = input.signedAt ? DateTime.fromJSDate(input.signedAt) : acceptedAt.startOf('day')

    let record: UserConsent
    try {
      record = await this.repository.insertPhysicalConsent({
        employeeId: employee.employeeId,
        userId: linkedUserId,
        legalDocumentId: currentDocument.legalDocumentId,
        documentVersion: currentDocument.legalDocumentVersion,
        registeredByUserId: input.registeredByUserId,
        signedAt,
        acceptedAt,
        evidenceFile: evidenceKey,
        evidenceOriginalName: sanitizedName,
        ip: input.ip,
        userAgent: input.userAgent,
      })
    } catch (error) {
      // Carrera residual entre el pre-check de duplicado y el INSERT: la UNIQUE
      // (employee_id, legal_document_id) la resuelve a nivel motor (regla 9, S5).
      if (this.isDuplicateEntryError(error)) {
        throw new ConsentError(
          'consentimiento-ya-registrado',
          'El empleado ya tiene aceptada la versión vigente de este documento.',
          CONSENT_ERROR_CODES.DUPLICATE_CONSENT
        )
      }
      throw error
    }

    return this.buildRecordDto(record, currentDocument.legalDocumentType)
  }

  /** `GET /api/employees/:employeeId/consents/status`. `null` si no hay asiento. */
  async getStatus(
    employeeId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<PhysicalConsentStatusDto | null> {
    const employee = await this.ensureEmployeeInScope(employeeId, allowedBusinessUnitIds)

    const currentDocument = await this.legalDocumentRepository.findCurrentByType(DOCUMENT_TYPE)
    if (!currentDocument) return null

    const linkedUserId = employee.person?.user?.userId ?? null
    const row = await this.repository.findForEmployeeAndDocument(
      employee.employeeId,
      linkedUserId,
      currentDocument.legalDocumentId
    )
    if (!row) return null

    return {
      userConsentId: row.userConsentId,
      version: row.userConsentDocumentVersion,
      channel: row.userConsentChannel,
      signedAt: row.userConsentSignedAt ? row.userConsentSignedAt.toISODate() : null,
      acceptedAt: row.userConsentAcceptedAt ? row.userConsentAcceptedAt.toISO() : null,
      registeredByName:
        row.userConsentChannel === 'physical' ? this.buildPersonName(row.registeredBy) : null,
      hasAttachment: Boolean(row.userConsentEvidenceFile),
    }
  }

  /**
   * `GET /api/employees/:employeeId/consents/:userConsentId/evidence-download-url`.
   *
   * Valida ANTES de firmar (asiento existe, canal físico, ancla al empleado de la
   * ruta, empleado ∈ scope) y registra el acceso en la bitácora PII ANTES de generar
   * la URL — "log primero": si el log falla, la URL nunca se genera (S9, fail-closed).
   */
  async getDownloadUrl(
    employeeId: number,
    userConsentId: number,
    allowedBusinessUnitIds: number[],
    context: DownloadContext
  ): Promise<PhysicalConsentDownloadUrlDto> {
    const employee = await this.ensureEmployeeInScope(employeeId, allowedBusinessUnitIds)

    const row = await this.repository.findPhysicalConsentForEmployee(userConsentId, employee.employeeId)
    if (!row || !row.userConsentEvidenceFile) {
      throw new ConsentError(
        'empleado-no-encontrado',
        'El asiento indicado no existe o no pertenece a este empleado.',
        CONSENT_ERROR_CODES.EMPLOYEE_NOT_FOUND
      )
    }

    await this.piiAccessLogService.record({
      businessUnitId: employee.businessUnitId,
      accessorUserId: context.accessorUserId,
      model: 'UserConsent',
      modelColumn: 'userConsentEvidenceFile',
      recordId: row.userConsentId,
      accessorIp: context.accessorIp,
      accessorUserAgent: context.accessorUserAgent,
      requestId: context.requestId,
    })

    return this.signDownloadUrl(row.userConsentEvidenceFile)
  }

  /**
   * `GET /api/consent/evidence/:userConsentId/download-url` — descarga desde la vista
   * global de evidencia. El gate de acceso (`assertConsentEvidenceAccess`) lo aplica el
   * controller; aquí solo se valida que el asiento sea físico y tenga adjunto.
   */
  async getDownloadUrlForEvidence(
    userConsentId: number,
    context: DownloadContext
  ): Promise<PhysicalConsentDownloadUrlDto> {
    const row = await this.repository.findPhysicalConsentById(userConsentId)
    if (!row || !row.userConsentEvidenceFile) {
      throw new ConsentError(
        'empleado-no-encontrado',
        'El asiento indicado no existe o no tiene adjunto.',
        CONSENT_ERROR_CODES.EMPLOYEE_NOT_FOUND
      )
    }

    await this.piiAccessLogService.record({
      businessUnitId: row.employee?.businessUnitId ?? 0,
      accessorUserId: context.accessorUserId,
      model: 'UserConsent',
      modelColumn: 'userConsentEvidenceFile',
      recordId: row.userConsentId,
      accessorIp: context.accessorIp,
      accessorUserAgent: context.accessorUserAgent,
      requestId: context.requestId,
    })

    return this.signDownloadUrl(row.userConsentEvidenceFile)
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async signDownloadUrl(evidenceKey: string): Promise<PhysicalConsentDownloadUrlDto> {
    const url = await this.fileStorage.getDownloadLink(evidenceKey, SIGNED_URL_EXPIRES_SECONDS)

    if (typeof url !== 'string') {
      throw new ConsentError(
        'error-de-almacenamiento-de-evidencia',
        'No se pudo generar el enlace de descarga del escaneo.',
        CONSENT_ERROR_CODES.EVIDENCE_STORAGE_FAILED
      )
    }

    return { downloadUrl: url, expiresInSeconds: SIGNED_URL_EXPIRES_SECONDS }
  }

  /** Delega en `PhysicalConsentEmployeeScope` (inyectable) y normaliza "no encontrado" a `ConsentError`. */
  private async ensureEmployeeInScope(
    employeeId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<Employee> {
    const employee = await this.employeeScope.findInScope(employeeId, allowedBusinessUnitIds)
    if (!employee) {
      throw new ConsentError(
        'empleado-no-encontrado',
        'El empleado no existe, está dado de baja o no pertenece a la empresa actual.',
        CONSENT_ERROR_CODES.EMPLOYEE_NOT_FOUND
      )
    }
    return employee
  }

  private assertFileValid(file: MultipartFile | null): void {
    if (!file) {
      throw new ConsentError(
        'archivo-de-evidencia-requerido',
        'No se recibió el escaneo del documento firmado.',
        CONSENT_ERROR_CODES.EVIDENCE_FILE_REQUIRED
      )
    }

    const ext = `${file.extname ?? ''}`.toLowerCase()
    const mime = `${file.type ?? ''}/${file.subtype ?? ''}`.toLowerCase()

    if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
      throw new ConsentError(
        'archivo-de-evidencia-invalido',
        'Solo se admite PDF, JPG o PNG.',
        CONSENT_ERROR_CODES.EVIDENCE_FILE_INVALID
      )
    }
    if (!ALLOWED_MIME_TYPES.includes(mime as (typeof ALLOWED_MIME_TYPES)[number])) {
      throw new ConsentError(
        'archivo-de-evidencia-invalido',
        'El contenido del archivo no corresponde a un PDF, JPG o PNG válido.',
        CONSENT_ERROR_CODES.EVIDENCE_FILE_INVALID
      )
    }
    if (typeof file.size === 'number' && file.size > MAX_FILE_BYTES) {
      throw new ConsentError(
        'archivo-de-evidencia-demasiado-grande',
        'El archivo excede el tamaño máximo de 10 MB.',
        CONSENT_ERROR_CODES.EVIDENCE_FILE_TOO_LARGE
      )
    }
  }

  private async uploadToS3(
    file: MultipartFile,
    employeeId: number,
    sanitizedName: string
  ): Promise<string> {
    const fileName = `${S3_FOLDER}/${employeeId}/${cuid()}-${sanitizedName}`
    const result = await this.fileStorage.fileUpload(file, 'evidence-document', '', { fileName })

    if (!result || result === 'file_not_found' || result === 'S3Producer.fileUpload') {
      throw new ConsentError(
        'error-de-almacenamiento-de-evidencia',
        'Error al subir el escaneo del documento a S3.',
        CONSENT_ERROR_CODES.EVIDENCE_STORAGE_FAILED
      )
    }
    return result
  }

  private sanitizeFileName(rawName: string): string {
    return `${rawName}`
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .slice(0, 100)
  }

  private isDuplicateEntryError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'ER_DUP_ENTRY'
    )
  }

  private buildPersonName(user: User | null | undefined): string | null {
    const person = user?.person
    if (!person) return null
    return [person.personFirstname, person.personLastname, person.personSecondLastname]
      .filter(Boolean)
      .join(' ')
  }

  private buildRecordDto(
    record: UserConsent,
    documentType: string
  ): PhysicalConsentRecordDto {
    return {
      userConsentId: record.userConsentId,
      employeeId: record.employeeId as number,
      userId: record.userId,
      channel: 'physical',
      legalDocumentId: record.legalDocumentId,
      documentType: documentType as PhysicalConsentRecordDto['documentType'],
      version: record.userConsentDocumentVersion,
      signedAt: record.userConsentSignedAt ? record.userConsentSignedAt.toISODate() : null,
      acceptedAt: record.userConsentAcceptedAt ? record.userConsentAcceptedAt.toISO() : null,
      registeredBy: {
        userId: record.userConsentRegisteredByUserId as number,
        name: this.buildPersonName(record.registeredBy) ?? '',
      },
      evidence: {
        originalName: record.userConsentEvidenceOriginalName,
      },
    }
  }
}
