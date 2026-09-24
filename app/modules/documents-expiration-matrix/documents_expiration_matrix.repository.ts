import type { ExpirationMatrixSource } from './documents_expiration_matrix.constants.js'
import type { ExpirationMatrixOwnerDto } from './dto/documents_expiration_matrix.dto.js'

/**
 * Vencimiento tal como sale de su fuente, antes de aplicar permisos de
 * descarga y etiquetas. `storedPath` nunca sale del API.
 */
export interface ExpirationMatrixRecord {
  source: ExpirationMatrixSource
  id: number
  /** Id con el que el módulo dueño abre el recurso cuando no es `id` (certificación). */
  targetId?: number
  /** `null` cuando la fuente no tiene nombre propio (el service pone la etiqueta genérica). */
  documentName: string | null
  reference: string | null
  /** Fecha de calendario `YYYY-MM-DD`. */
  expiresAt: string
  owner: ExpirationMatrixOwnerDto
  /** Referencia del archivo en almacenamiento (key privada o URL histórica). */
  storedPath: string | null
  /** Nombre original del archivo, si se guardó; solo sirve para inferir la extensión. */
  storedFileName: string | null
}

/** Filtro común a todas las fuentes. */
export interface ExpirationMatrixFilter {
  /** Último día incluido en la ventana (`YYYY-MM-DD`, zona de negocio). */
  horizon: string
  /** Unidades de negocio de la petición (scope del tenant). Vacío = sin resultados. */
  businessUnitIds: readonly number[]
  /**
   * Departamentos visibles para el rol. Solo acota las fuentes que hoy se
   * acotan por departamento: `employee-file` y `employee-contract`.
   */
  departmentIds: readonly number[]
  /** Acota a un solo registro (descarga por llave). */
  id?: number
}

/**
 * Contrato del repositorio de la matriz: UNA consulta por fuente, con joins,
 * sin N+1. Todas respetan el borrado lógico y el scope del tenant.
 */
export interface ExpirationMatrixRepository {
  findEmployeeFiles(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]>
  findEmployeeContracts(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]>
  findCompanyFiles(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]>
  findCertifications(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]>
  findRepseFolios(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]>
  findProviderFolios(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]>
  findSupplies(filter: ExpirationMatrixFilter): Promise<ExpirationMatrixRecord[]>
}
