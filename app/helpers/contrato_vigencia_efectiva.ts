import { DateTime } from 'luxon'
import ContratoServicioEspecializado from '#models/contrato_servicio_especializado'
import VersionContratoEspecializado from '#models/version_contrato_especializado'
import { toCalendarIsoDate } from '#utils/business_date'

export type ContratoVigenciaEfectiva = {
  fechaInicio: string
  fechaFin: string | null
}

function minIsoDate(a: string, b: string): string {
  return a <= b ? a : b
}

function maxIsoDate(a: string | null, b: string | null): string | null {
  if (a === null && b === null) return null
  if (a === null) return b
  if (b === null) return a
  return a >= b ? a : b
}

/**
 * Calcula el rango de vigencia efectiva del contrato considerando renovaciones históricas.
 * Une el head actual con los snapshots de versiones tipo renovación.
 */
export async function computeContratoVigenciaEfectiva(
  contrato: ContratoServicioEspecializado
): Promise<ContratoVigenciaEfectiva> {
  let fechaInicio = toCalendarIsoDate(contrato.fechaInicio) ?? contrato.fechaInicio.toISODate()!
  let fechaFin = toCalendarIsoDate(contrato.fechaFin)

  const versiones = await VersionContratoEspecializado.query()
    .where('contrato_servicio_especializado_id', contrato.contratoServicioEspecializadoId)
    .where('version_contrato_especializado_tipo_cambio', 'renovacion')
    .whereNull('version_contrato_especializado_deleted_at')

  for (const version of versiones) {
    const snapInicio =
      toCalendarIsoDate(version.snapshotFechaInicio) ?? version.snapshotFechaInicio.toISODate()!
    const snapFin = toCalendarIsoDate(version.snapshotFechaFin)
    fechaInicio = minIsoDate(fechaInicio, snapInicio)
    fechaFin = maxIsoDate(fechaFin, snapFin)
  }

  return { fechaInicio, fechaFin }
}

/**
 * Valida que las fechas de una asignación estén dentro de la vigencia efectiva del contrato.
 */
export function assertAsignacionDentroDeVigencia(
  asignacionInicio: string,
  asignacionFin: string | null,
  vigencia: ContratoVigenciaEfectiva
): boolean {
  if (asignacionInicio < vigencia.fechaInicio) {
    return false
  }
  if (vigencia.fechaFin !== null && asignacionFin !== null && asignacionFin > vigencia.fechaFin) {
    return false
  }
  if (vigencia.fechaFin !== null && asignacionInicio > vigencia.fechaFin) {
    return false
  }
  return true
}

/**
 * Convierte un valor Date de VineJS a ISO date string.
 */
export function toIsoDateFromInput(value: Date | string): string {
  if (typeof value === 'string') {
    return value
  }
  return DateTime.fromJSDate(value).toISODate()!
}
