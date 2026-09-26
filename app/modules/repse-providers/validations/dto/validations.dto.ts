import type { ProveedorRepseValidacionEstatus } from '#models/proveedor_repse_validacion'

export interface ProveedorRepseValidacionDto {
  proveedorRepseValidacionId: number
  proveedorRepseId: number
  businessUnitId: number
  estatus: ProveedorRepseValidacionEstatus
  fecha: string
  autorUserId: number
  autor: {
    userId: number
    nombreCompleto: string
  } | null
  evidenciaNombreArchivo: string
  evidenciaMimeType: string
  evidenciaTamanoBytes: number
  proveedorRepseValidacionCreatedAt: string | null
}

export interface ProveedorRepseValidacionListDto {
  validaciones: ProveedorRepseValidacionDto[]
}
