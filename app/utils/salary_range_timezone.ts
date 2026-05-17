import type { Request } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import env from '#start/env'

const DEFAULT_ZONE = 'America/Mexico_City'

/**
 * Encabezados aceptados (en ese orden de prioridad) para la zona IANA del cliente.
 * Preferido: `X-User-Timezone` (documentar así en Nuxt y otros clientes).
 */
export const SALARY_RANGE_TIMEZONE_HEADERS = [
  'x-user-timezone',
  'x-timezone',
  'x-client-timezone',
] as const

/** Encabezado recomendado para documentación y frontends. */
export const SALARY_RANGE_TIMEZONE_HEADER_RECOMMENDED = 'X-User-Timezone'

export type ResolveSalaryRangeTimeZoneResult =
  | { ok: true; zone: string }
  | { ok: false; key: 'zona-horaria-invalida'; message: string }

/**
 * Resuelve la zona usada para comparar “hoy” y `validFrom` como día civil.
 * Si no hay cabecera válida, usa `APP_BUSINESS_TIMEZONE` o `America/Mexico_City`.
 */
export function resolveSalaryRangeTimeZone(request: Request): ResolveSalaryRangeTimeZoneResult {
  let raw: string | undefined
  for (const name of SALARY_RANGE_TIMEZONE_HEADERS) {
    const v = request.header(name)
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      raw = String(v).trim()
      break
    }
  }

  if (raw === undefined) {
    return { ok: true, zone: env.get('APP_BUSINESS_TIMEZONE') ?? DEFAULT_ZONE }
  }

  const probe = DateTime.now().setZone(raw)
  if (!probe.isValid) {
    return {
      ok: false,
      key: 'zona-horaria-invalida',
      message:
        'La zona horaria no es válida. Use un identificador IANA (por ejemplo America/Mexico_City, Europe/Madrid).',
    }
  }

  return { ok: true, zone: raw }
}
