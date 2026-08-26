import type { LegalCategory } from '#constants/sensitive_fields'

/**
 * Cabeceras del Excel de importación que escriben columnas del catálogo sensible.
 * Tabla ampliable de una línea — USRH1787433076994 añade Salario diario → financiero.
 * USRH1787433076990: sin Salario diario (no clasificado hoy).
 */
export const EMPLOYEE_EXCEL_SENSITIVE_HEADERS = [
  { header: 'CURP', category: 'identificacion' as const },
  { header: 'RFC', category: 'identificacion' as const },
  { header: 'NSS', category: 'identificacion' as const },
  { header: 'Correo personal', category: 'contacto' as const },
  { header: 'Teléfono Personal', category: 'contacto' as const },
  { header: 'Teléfono contacto emergencia', category: 'contacto' as const },
] as const satisfies ReadonlyArray<{ header: string; category: LegalCategory }>

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase()
}

export function findSensitiveCategoriesInExcelHeaders(headers: string[]): LegalCategory[] {
  const present = new Set<LegalCategory>()
  const normalizedFileHeaders = new Set(
    headers.filter((h) => typeof h === 'string' && h.trim() !== '').map(normalizeHeader)
  )

  for (const entry of EMPLOYEE_EXCEL_SENSITIVE_HEADERS) {
    if (normalizedFileHeaders.has(normalizeHeader(entry.header))) {
      present.add(entry.category)
    }
  }

  return [...present]
}
