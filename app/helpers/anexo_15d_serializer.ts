import type Clausula15d from '#models/clausula_15d'
import { DateTime } from 'luxon'

function toIsoDateString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (DateTime.isDateTime(value)) {
    return (value as DateTime).toISODate()
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate()
  }
  return null
}

/**
 * Serializa el anexo 15-D para respuestas API y snapshots de versiones históricas.
 */
export function serializeAnexo15d(row: Clausula15d) {
  return {
    folioRepse: row.folioRepse,
    objetoDetallado: row.objetoDetallado,
    numeroTrabajadoresAprox: row.numeroTrabajadoresAprox,
    fechaInicioServicio: toIsoDateString(row.fechaInicioServicio),
    fechaFinServicio: toIsoDateString(row.fechaFinServicio),
    compromisosDocumentales: row.compromisosDocumentales,
    responsabilidadSolidariaAceptada: row.responsabilidadSolidariaAceptada,
    textoResponsabilidadSolidaria: row.textoResponsabilidadSolidaria,
  }
}
