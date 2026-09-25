/**
 * Contrato de respuesta de `GET /api/repse/panorama`.
 *
 * El API no arma textos: el cliente traduce cada pendiente por su `tipo`.
 */

export interface RepsePanoramaKpis {
  /** Contratos con estatus efectivo `vigente` (incluye los por vencer). */
  contratosVigentes: number
  /** Empresas contratantes no borradas del tenant. */
  empresasContratantes: number
  /** Servicios especializados `active` de registros REPSE no borrados. */
  serviciosActivos: number
  /** Trabajadores distintos con asignación vigente hoy en contratos vigentes. */
  trabajadoresAsignados: number
}

export interface RepsePanoramaPendienteInformativa {
  tipo: 'informativa'
  /** Próxima fecha de presentación (17 ene/may/sep), `YYYY-MM-DD`. */
  fecha: string
  dias: number
}

/** Referencia común a un contrato dentro de un pendiente. */
export interface RepsePanoramaContratoRef {
  contratoId: number
  numeroContrato: string
  empresaRazonSocial: string | null
}

export interface RepsePanoramaPendienteContratoPorVencer extends RepsePanoramaContratoRef {
  tipo: 'contrato_por_vencer'
  /** `YYYY-MM-DD`. */
  fechaFin: string
  dias: number
}

export interface RepsePanoramaPendienteContratoSinDocumento extends RepsePanoramaContratoRef {
  tipo: 'contrato_sin_documento'
}

export interface RepsePanoramaPendientePersonalSinAsignar extends RepsePanoramaContratoRef {
  tipo: 'personal_sin_asignar'
  asignados: number
  declarados: number
}

export type RepsePanoramaPendiente =
  | RepsePanoramaPendienteInformativa
  | RepsePanoramaPendienteContratoPorVencer
  | RepsePanoramaPendienteContratoSinDocumento
  | RepsePanoramaPendientePersonalSinAsignar

export interface RepsePanoramaResult {
  kpis: RepsePanoramaKpis
  pendientes: RepsePanoramaPendiente[]
}
