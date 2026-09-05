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
  /**
   * Espejo de `BadgePublicRow.employeeActive`: sin borrado logico y sin baja
   * efectiva. Hoy es `true` por construccion (el repositorio descarta al
   * inactivo antes de armar el contexto); viaja igual para que el gafete
   * calcule `vinculoVigente` con el MISMO criterio que la verificacion
   * publica y no con una afirmacion (§9.5 de ESB-04-02-08-01).
   */
  employeeActive: boolean
  /** Espejo de `BadgePublicRow.businessUnitActive`: `business_unit_active = 1` y sin borrado logico. */
  businessUnitActive: boolean
  positionName: string | null
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
  /**
   * `true` solo cuando NO hay fotografia en el expediente. Deliberadamente
   * distinto de `fotoUrl === null`: con objetos privados la URL publica es
   * null aunque la foto exista. `fotoFaltante:false` + `fotoUrl:null` es la
   * senal de "pidela por el endpoint autenticado".
   */
  fotoFaltante: boolean
  empresa: string
  puesto: string | null
  folioRepse: string | null
  folioVigente: boolean | null
  /**
   * Fecha civil `YYYY-MM-DD` de vencimiento del registro REPSE; `null` sin
   * registro. Nunca instante con zona: la columna es `table.date` y un
   * DateTime con zona corre el dia. La app la usa para recalcular la vigencia
   * contra su propia fecha de negocio en vez de creerle a `folioVigente`,
   * que es una foto del momento en que se guardo el gafete.
   */
  folioVigenteHasta: string | null
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
