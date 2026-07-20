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

export interface ProvidersRepository {
  /** Lista paginada de proveedores del conjunto de `businessUnitId` permitido. */
  listPaginated(
    page: number,
    perPage: number,
    businessUnitIds: number[]
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
