/**
 * Clasificador puro de errores del borrado de estructura organizacional
 * (USRH1788466831356). Espejo de `employee_position_level_api_error.ts`.
 *
 * Reglas:
 *  - Interbloqueo / espera / integridad referencial → 409 conflict (C06-1, C06-4).
 *  - Cualquier otro error → 500 failed, `detail` con texto fijo (C06-5 / RT5).
 *  - Nunca se propaga `error.message` ni `sqlMessage` al cliente.
 */
import type { I18n } from '@adonisjs/i18n'
import {
  LOCK_ERROR_CODES,
  LOCK_ERROR_NUMBERS,
  ORG_STRUCTURE_ERROR_CODES,
  ORG_STRUCTURE_ERROR_HTTP_STATUS,
  type OrgStructureErrorCode,
} from '../constants/org_structure_error_codes.js'

// ── Tipo de entrada del clasificador ──────────────────────────────────────────

type DbError = {
  code?: string
  errno?: number
  message?: string
}

// ── Mapa code → clave base i18n ───────────────────────────────────────────────

/** Clave slug fija por código; el cliente la recibe igual en todos los idiomas. */
const ERROR_CODE_TO_KEY: Record<OrgStructureErrorCode, string> = {
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_NOT_FOUND]: 'departamento-no-encontrado',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_HAS_EMPLOYEES]: 'el-departamento-tiene-empleados',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_DELETE_CONFLICT]:
    'no-fue-posible-eliminar-el-departamento-en-este-momento',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_DELETE_FAILED]: 'no-fue-posible-eliminar-el-departamento',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_NOT_FOUND]: 'puesto-no-encontrado',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_DELETE_CONFLICT]:
    'no-fue-posible-eliminar-el-puesto-en-este-momento',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_DELETE_FAILED]: 'no-fue-posible-eliminar-el-puesto',
}

const ERROR_CODE_TO_I18N_BASE: Record<OrgStructureErrorCode, string> = {
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_NOT_FOUND]: 'org_structure_department_not_found',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_HAS_EMPLOYEES]: 'org_structure_department_has_employees',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_DELETE_CONFLICT]:
    'org_structure_department_delete_conflict',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_DELETE_FAILED]: 'org_structure_department_delete_failed',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_NOT_FOUND]: 'org_structure_position_not_found',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_DELETE_CONFLICT]: 'org_structure_position_delete_conflict',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_DELETE_FAILED]: 'org_structure_position_delete_failed',
}

// ── Helper interno de traducción ──────────────────────────────────────────────

/** Traduce una clave si `i18n` está disponible; si no, devuelve el fallback. */
function translate(i18n: I18n | undefined, key: string, fallback: string): string {
  if (!i18n) return fallback
  return i18n.t(key, undefined, fallback)
}

// ── Clasificador ──────────────────────────────────────────────────────────────

/**
 * Tipo de fallo de base de datos para un borrado de estructura.
 * - `'conflict'`: interbloqueo, espera agotada o violación de integridad → 409.
 * - `'failed'`: cualquier otro error → 500.
 */
export type OrgStructureDeleteFailureKind = 'conflict' | 'failed'

/**
 * Clasifica un error de base de datos capturado durante el borrado de un
 * departamento o puesto.
 */
export function classifyOrgStructureDbError(error: unknown): OrgStructureDeleteFailureKind {
  const err = error as DbError
  if (LOCK_ERROR_CODES.has(err?.code ?? '') || LOCK_ERROR_NUMBERS.has(err?.errno ?? -1)) {
    return 'conflict'
  }
  return 'failed'
}

// ── Constructor de respuestas HTTP ────────────────────────────────────────────

export interface OrgStructureApiError {
  status: number
  body: {
    type: string
    title: string
    message: string
    detail: string
    key: string
    code: OrgStructureErrorCode
    data: Record<string, unknown>
  }
}

/**
 * Construye el objeto de respuesta HTTP a partir de un código de error del
 * catálogo. Localiza `title` y `message` si se pasa `i18n`.
 */
export function buildOrgStructureApiError(
  code: OrgStructureErrorCode,
  data: Record<string, unknown>,
  i18n?: I18n,
): OrgStructureApiError {
  const base = ERROR_CODE_TO_I18N_BASE[code]
  const status = ORG_STRUCTURE_ERROR_HTTP_STATUS[code]
  const isError = status >= 500

  const title = translate(i18n, `${base}_title`, code)
  const detail = translate(i18n, `${base}_message`, code)

  return {
    status,
    body: {
      type: isError ? 'error' : 'warning',
      title,
      message: detail,
      detail,
      key: ERROR_CODE_TO_KEY[code],
      code,
      data,
    },
  }
}
