/**
 * Utilidades para enmascarar datos fiscales en logs (HU empresas contratantes §Seguridad).
 */

/** Enmascara RFC: primeros 3 + **** + últimos 2 (ej. ABC****X9). */
export function maskRfcForLog(rfc: string | null | undefined): string {
  if (!rfc || rfc.length < 5) {
    return '***'
  }
  const normalized = rfc.trim().toUpperCase()
  return `${normalized.slice(0, 3)}****${normalized.slice(-2)}`
}

/** Nunca loguear razón social completa; truncar a 3 caracteres + ***. */
export function maskRazonSocialForLog(razonSocial: string | null | undefined): string {
  if (!razonSocial || razonSocial.trim().length === 0) {
    return '***'
  }
  const trimmed = razonSocial.trim()
  return `${trimmed.slice(0, 3)}***`
}
