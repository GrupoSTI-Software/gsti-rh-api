import type { RepseExpedienteDocumentoTipo } from '../expediente.constants.js'

export interface RepseExpedienteDocumentoDto {
  repseExpedienteDocumentoId: number
  proveedorRepseId: number
  businessUnitId: number
  tipo: RepseExpedienteDocumentoTipo
  anio: number
  mes: number | null
  cuatrimestre: number | null
  fechaDocumento: string | null
  conservarHasta: string
  nombreArchivo: string
  mimeType: string
  tamanoBytes: number
  subidoPorUserId: number | null
  repseExpedienteDocumentoCreatedAt: string | null
}

export interface RepseExpedienteListDto {
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
    page: number
    firstPage: number
  }
  data: RepseExpedienteDocumentoDto[]
}
