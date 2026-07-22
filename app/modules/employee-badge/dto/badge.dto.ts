import type { DateTime } from 'luxon'

/**
 * Contexto interno con todos los datos crudos necesarios para armar el
 * `GafeteDto` y el PDF del gafete (USRH1784686362321). Nunca se serializa
 * directamente: es insumo del service, no una respuesta HTTP.
 */
export interface BadgeEmployeeContext {
  employeeId: number
  businessUnitId: number
  employeeBadgeToken: string | null
  personFirstname: string
  personLastname: string
  personSecondLastname: string
  employeePhoto: string | null
  businessUnitLegalName: string
  businessUnitName: string
  positionName: string | null
  systemSettingLogo: string | null
  repseFolio: string | null
  repseExpiresAt: DateTime | null
}

/**
 * Fila mínima del lookup público por token (E4). Proyección explícita,
 * jamás un modelo Lucid completo — es EL único endpoint sin tenant de la HU.
 */
export interface BadgePublicRow {
  personFirstname: string
  personLastname: string
  personSecondLastname: string
  businessUnitLegalName: string
  businessUnitName: string
  employeeActive: boolean
  businessUnitActive: boolean
  repseFolio: string | null
  repseExpiresAt: DateTime | null
}

/** E1/E3 — dataKey `gafete` (`GET /api/employee-badges/:employeeId` y `/me`). */
export interface GafeteDto {
  empleadoId: number
  nombreCompleto: string
  fotoUrl: string | null
  fotoFaltante: boolean
  empresa: string
  puesto: string | null
  logoUrl: string | null
  folioRepse: string | null
  folioVigente: boolean | null
  vinculoVigente: boolean
  urlVerificacion: string
  qrDataUrl: string
}

/** E4 — dataKey `verificacion` (`GET /api/public/employee-badge/verify/:token`). Superficie mínima. */
export interface GafeteVerificacionDto {
  trabajador: string
  empresa: string
  vinculoVigente: boolean
  folioRepse: string | null
  folioVigente: boolean | null
}
