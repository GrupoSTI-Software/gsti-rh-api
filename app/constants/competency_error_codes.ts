/**
 * Códigos de error del dominio de competencias.
 * VLRH-H1792032453526 — 404 uniforme fuera de alcance (anti-IDOR), ajeno,
 * plantilla, dado de baja e inexistente responden idéntico.
 *
 * Prefijo `CMPT` y no `CMP`: `CMP.NF.001`/`CMP.NF.002` ya los usa el buzón de
 * quejas (`app/constants/complaint_error_codes.ts`).
 */
export const COMPETENCY_ERROR_CODES = {
  COMPETENCY_NOT_FOUND: 'CMPT.NF.001',
  DESCRIPTOR_NOT_FOUND: 'CMPT.NF.002',
  BRACKET_NOT_FOUND: 'CMPT.NF.003',
  POSITION_LEVEL_NOT_FOUND: 'CMPT.NF.004',
  BUSINESS_UNIT_LEVEL_NOT_FOUND: 'CMPT.NF.005',
  POSITION_NOT_FOUND: 'CMPT.NF.006',
} as const

export type CompetencyErrorCode = (typeof COMPETENCY_ERROR_CODES)[keyof typeof COMPETENCY_ERROR_CODES]
