import type { DateTime } from 'luxon'
import type ProveedorRepse from '#models/proveedor_repse'

export interface ProveedorRepseCreateData {
  businessUnitId: number
  razonSocial: string
  rfc: string
  rfcHash: string
  folio: string
  objetoRegistrado: string
  folioVencimiento: DateTime
  periodicidadMeses: number
}

export type ProveedorRepseUpdateData = Partial<
  Omit<ProveedorRepseCreateData, 'businessUnitId' | 'rfcHash'>
> & {
  businessUnitId?: number
  rfcHash?: string
}

export interface ProveedorRepsePaginatedResult {
  meta: Record<string, unknown>
  data: ProveedorRepse[]
}

/**
 * Término de búsqueda ya preparado por el service.
 *
 * - `likePattern`: patrón `%...%` en minúsculas y con `%`, `_` y `\` escapados;
 *   se compara contra razón social y folio.
 * - `rfcHash`: índice ciego del término cuando tiene forma de RFC completo; el
 *   RFC vive cifrado, así que solo admite coincidencia exacta (sin parciales).
 */
export interface ProveedorRepseSearch {
  likePattern: string
  rfcHash: string | null
}

export interface ProvidersRepository {
  /**
   * Lista paginada de proveedores del conjunto de `businessUnitId` permitido.
   * Con `search`, filtra en SQL antes de paginar (el `meta.total` refleja el filtro).
   */
  listPaginated(
    page: number,
    perPage: number,
    businessUnitIds: number[],
    search?: ProveedorRepseSearch
  ): Promise<ProveedorRepsePaginatedResult>

  /** Busca un proveedor activo dentro del scope de `businessUnitId` permitidos. */
  findByIdInScope(proveedorRepseId: number, businessUnitIds: number[]): Promise<ProveedorRepse | null>

  /** Busca un folio activo duplicado dentro de la misma empresa (excluyendo, opcionalmente, un id). */
  findActiveByFolio(
    businessUnitId: number,
    folio: string,
    excludeId?: number
  ): Promise<ProveedorRepse | null>

  create(data: ProveedorRepseCreateData): Promise<ProveedorRepse>

  update(proveedorRepseId: number, data: ProveedorRepseUpdateData): Promise<ProveedorRepse>

  softDelete(proveedorRepseId: number): Promise<void>

  /** Recalcula `nextReviewAt` tras registrar una validación. */
  updateNextReviewAt(proveedorRepseId: number, nextReviewAt: DateTime | null): Promise<void>
}
