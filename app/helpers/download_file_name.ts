import { DateTime } from 'luxon'
import { getBusinessTimeZone } from '#utils/business_date'

/**
 * Nombre de todo archivo descargable que genera o entrega el API: única
 * representación de la regla (2026-09-22).
 *
 * Convención: minúsculas, en español, sin acentos ni ñ, solo letras, dígitos y
 * guiones; fechas ISO (`2026-09-01`) en la zona de negocio. Ejemplo:
 * `reporte-asistencia-2026-09-01-2026-09-15.xlsx`.
 *
 * Ningún dato del empleado va en el nombre (ni nombre, ni número, ni RFC):
 * cuando el archivo es de un empleado se usa su `employeeSlug`, que es un
 * token opaco. El nombre de un archivo viaja por correos, carpetas de
 * descargas y logs; no debe exponer a nadie.
 *
 * El API es la única fuente del nombre: el backoffice lo lee de
 * `Content-Disposition` (expuesto en `config/cors.ts`) y solo usa su propio
 * nombre si la cabecera no llega.
 */

/** Segmento aceptado al armar un nombre; los vacíos se omiten. */
export type DownloadFileNamePart = string | number | null | undefined

/** Lleva un texto libre a segmento de nombre: sin acentos, minúsculas, guiones. */
export function slugifyFileNamePart(value: string | number): string {
  return String(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Fecha civil `YYYY-MM-DD` en la zona de negocio. Acepta ISO (fecha o fecha y
 * hora), `Date` o `DateTime`; sin argumento usa el día actual.
 */
export function formatDownloadFileDate(value?: string | Date | DateTime | null): string {
  const zone = getBusinessTimeZone()
  let reference: DateTime
  if (value === null || value === undefined) {
    reference = DateTime.now()
  } else if (DateTime.isDateTime(value)) {
    reference = value
  } else if (value instanceof Date) {
    reference = DateTime.fromJSDate(value)
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // Fecha civil pura: no se convierte de zona o se correría un día.
    return value
  } else {
    reference = DateTime.fromISO(value)
  }
  return reference.setZone(zone).toISODate() ?? DateTime.now().setZone(zone).toISODate()!
}

/**
 * Arma el nombre final: cada segmento se sanea y se une con guiones.
 *
 * @param parts - Segmentos en orden (tipo, alcance, fechas…); los vacíos se omiten.
 * @param extension - Extensión sin punto (`xlsx`, `pdf`, `zip`…).
 * @returns Nombre saneado, p. ej. `resumen-vacaciones-2026.xlsx`.
 */
export function buildDownloadFileName(parts: DownloadFileNamePart[], extension: string): string {
  const base = parts
    .filter((part): part is string | number => part !== null && part !== undefined && part !== '')
    .map(slugifyFileNamePart)
    .filter((part) => part.length > 0)
    .join('-')
  const cleanExtension = slugifyFileNamePart(extension).replace(/-/g, '')
  return `${base || 'descarga'}.${cleanExtension}`
}

/**
 * Valor de `Content-Disposition` con el nombre en ASCII y en RFC 5987
 * (`filename*`), para que ningún navegador lo altere.
 *
 * @param fileName - Nombre ya armado con `buildDownloadFileName`.
 * @param disposition - `attachment` (descarga) o `inline` (abrir en pestaña).
 */
export function contentDisposition(
  fileName: string,
  disposition: 'attachment' | 'inline' = 'attachment'
): string {
  const asciiName = fileName.replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '')
  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
