import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type BusinessUnit from '#models/business_unit'
import type EmployeeOffboardingDocumentTemplate from '#models/employee_offboarding_document_template'
import type User from '#models/user'

/** Datos para insertar la versión (el servicio ya subió, releyó y selló el archivo). */
export interface EmployeeOffboardingDocumentTemplateCreateData {
  businessUnitId: number
  documentType: string
  versionNumber: number
  storageKey: string
  originalFileName: string
  fileSizeBytes: number
  contentSha256: string
  uploadedByUserId: number | null
}

/** Página pedida del historial. */
export interface DocumentTemplateVersionsPage {
  page: number
  limit: number
}

/**
 * Puerto de acceso a datos de las plantillas propias (USRH1788553841100).
 * El adaptador MySQL es el ÚNICO que toca Lucid. TODOS los métodos de
 * lectura y escritura reciben `businessUnitId` obligatorio y lo filtran
 * EXPLÍCITO: el mixin `withBusinessUnitScope()` del modelo es fail-open sin
 * `TenantContext` y queda como defensa en profundidad, no como candado.
 *
 * Contrato publicado a las hermanas (ESB-05-07-14, ESB-05-07-08 y
 * ESB-05-07-09): `resolveCurrent` y `findVersionInScope`. Ninguna consulta
 * la tabla por su cuenta.
 */
export interface DocumentTemplatesRepository {
  /** Versión `current` de la empresa para el tipo; `null` = plantilla del sistema. */
  resolveCurrent(
    businessUnitId: number,
    documentType: string
  ): Promise<EmployeeOffboardingDocumentTemplate | null>

  /**
   * Historial completo (incluye `superseded` y `rejected`) por versión
   * descendente, paginado; `total` cuenta la misma condición.
   */
  listVersions(
    businessUnitId: number,
    documentType: string,
    page: DocumentTemplateVersionsPage
  ): Promise<{ rows: EmployeeOffboardingDocumentTemplate[]; total: number }>

  /** Versión de la empresa Y del tipo; `null` = 404 uniforme (regla 8). */
  findVersionInScope(
    businessUnitId: number,
    documentType: string,
    versionId: number
  ): Promise<EmployeeOffboardingDocumentTemplate | null>

  /**
   * Bloquea con `forUpdate` la fila PADRE de `business_units` (siempre
   * existe): un `forUpdate` sobre un rango vacío de versiones no protege la
   * primera carga. Serializa consecutivo y traslado de vigencia.
   */
  lockBusinessUnitRow(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<BusinessUnit | null>

  /** Último consecutivo consumido para (empresa, tipo); 0 sin versiones. Bajo el lock. */
  findMaxVersionNumber(
    businessUnitId: number,
    documentType: string,
    trx: TransactionClientContract
  ): Promise<number>

  /** Pasa la vigente a `superseded` (nunca la borra, regla 5). Bajo el lock. */
  markCurrentAsSuperseded(
    businessUnitId: number,
    documentType: string,
    trx: TransactionClientContract
  ): Promise<void>

  /** Inserta la versión nueva como `current`, dentro de la transacción del lock. */
  createVersion(
    data: EmployeeOffboardingDocumentTemplateCreateData,
    trx: TransactionClientContract
  ): Promise<EmployeeOffboardingDocumentTemplate>

  /** Usuarios con su persona, para el nombre visible de quien subió. */
  findUsersByIds(userIds: number[]): Promise<User[]>
}
