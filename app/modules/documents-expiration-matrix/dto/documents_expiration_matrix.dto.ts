import type { ExpirationMatrixSource } from '../documents_expiration_matrix.constants.js'

/** Empleado dueño del documento. */
export interface ExpirationMatrixEmployeeOwnerDto {
  kind: 'employee'
  employeeId: number
  /** Slug del detalle del empleado en el BO (`/employees/<slug>`). */
  employeeSlug: string | null
  name: string
  positionName: string | null
  departmentName: string | null
  employeeCode: string | null
}

/** La empresa (unidad de negocio activa) como dueña del documento. */
export interface ExpirationMatrixCompanyOwnerDto {
  kind: 'company'
  name: string
  detail: string | null
}

/** Proveedor REPSE (lado contratante) como dueño del folio. */
export interface ExpirationMatrixProviderOwnerDto {
  kind: 'provider'
  providerId: number
  name: string
  detail: string | null
}

export type ExpirationMatrixOwnerDto =
  | ExpirationMatrixEmployeeOwnerDto
  | ExpirationMatrixCompanyOwnerDto
  | ExpirationMatrixProviderOwnerDto

/** Un vencimiento de la matriz, venga de la fuente que venga. */
export interface ExpirationMatrixItemDto {
  /** `<source>-<id>`: único y estable; abre el archivo en `items/:key/file`. */
  key: string
  source: ExpirationMatrixSource
  documentName: string
  /** Nombre de archivo o folio que se muestra bajo el documento. */
  reference: string | null
  /** Fecha de calendario `YYYY-MM-DD`. */
  expiresAt: string
  /** Días naturales hasta el vencimiento en zona de negocio; negativo si ya venció. */
  daysToExpire: number
  owner: ExpirationMatrixOwnerDto
  /**
   * Id con el que el módulo dueño abre el recurso cuando no es el de la llave
   * (certificación: `certificationId`); `null` en el resto.
   */
  targetId: number | null
  /** `true` solo si hay archivo y el usuario puede descargarlo. */
  hasFile: boolean
}

/** `data` de `GET /api/documents-expiration-matrix`. */
export interface ExpirationMatrixResponseDto {
  windowDays: number
  /** Hoy en zona de negocio (`YYYY-MM-DD`). */
  today: string
  /** Ordenados por `expiresAt` ascendente y luego por `documentName`. */
  items: ExpirationMatrixItemDto[]
}
