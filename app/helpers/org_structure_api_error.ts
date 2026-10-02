/**
 * Clasificador puro de errores de la estructura organizacional.
 * Cubre borrado (USRH1788466831356) y alta atómica (USRH1789328927625).
 *
 * Reglas de borrado:
 *  - Interbloqueo / espera / integridad referencial → 409 conflict (C06-1, C06-4).
 *  - Cualquier otro error → 500 failed, `detail` con texto fijo (C06-5 / RT5).
 *  - Nunca se propaga `error.message` ni `sqlMessage` al cliente.
 *
 * Reglas de alta:
 *  - OrgAliasAppError → 400 (alias tomado / inválido).
 *  - E_VALIDATION_ERROR → 422 (datos de entrada inválidos).
 *  - Cualquier otro → 500.
 */
import type { I18n } from '@adonisjs/i18n'
import OrgAliasAppError from '#exceptions/org_alias_app_error'
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
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_VAL_INPUT]: 'datos-del-departamento-invalidos',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_BUSINESS_UNIT_MISMATCH]:
    'empresa-distinta-a-la-seleccionada',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_ALIAS_TAKEN]: 'alias-en-uso',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_ALIAS_INVALID]: 'alias-invalido',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_CREATE_FAILED]: 'no-fue-posible-crear-el-departamento',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_NOT_FOUND]: 'puesto-no-encontrado',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_DELETE_CONFLICT]:
    'no-fue-posible-eliminar-el-puesto-en-este-momento',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_DELETE_FAILED]: 'no-fue-posible-eliminar-el-puesto',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_VAL_INPUT]: 'datos-del-puesto-invalidos',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_DEPARTMENT_NOT_FOUND]: 'departamento-no-encontrado',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_ALIAS_TAKEN]: 'alias-en-uso',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_ALIAS_INVALID]: 'alias-invalido',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_CREATE_FAILED]: 'no-fue-posible-crear-el-puesto',
}

const ERROR_CODE_TO_I18N_BASE: Record<OrgStructureErrorCode, string> = {
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_NOT_FOUND]: 'org_structure_department_not_found',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_HAS_EMPLOYEES]: 'org_structure_department_has_employees',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_DELETE_CONFLICT]:
    'org_structure_department_delete_conflict',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_DELETE_FAILED]: 'org_structure_department_delete_failed',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_VAL_INPUT]: 'org_structure_department_val_input',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_BUSINESS_UNIT_MISMATCH]:
    'org_structure_department_business_unit_mismatch',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_ALIAS_TAKEN]: 'org_structure_department_alias_taken',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_ALIAS_INVALID]: 'org_structure_department_alias_invalid',
  [ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_CREATE_FAILED]: 'org_structure_department_create_failed',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_NOT_FOUND]: 'org_structure_position_not_found',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_DELETE_CONFLICT]: 'org_structure_position_delete_conflict',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_DELETE_FAILED]: 'org_structure_position_delete_failed',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_VAL_INPUT]: 'org_structure_position_val_input',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_DEPARTMENT_NOT_FOUND]:
    'org_structure_position_department_not_found',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_ALIAS_TAKEN]: 'org_structure_position_alias_taken',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_ALIAS_INVALID]: 'org_structure_position_alias_invalid',
  [ORG_STRUCTURE_ERROR_CODES.POSITION_CREATE_FAILED]: 'org_structure_position_create_failed',
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

// ── Alta atómica: entidades y errores de store ────────────────────────────────

/** Entidad de estructura que se está creando. */
export type OrgStructureStoreEntity = 'department' | 'position'

/** Forma del `body` en el catch del store. */
export interface OrgStructureStoreErrorBody {
  type: 'warning' | 'error'
  title: string
  message: string
  detail?: string
  key?: string
  code?: OrgStructureErrorCode
  error?: string
}

/** Respuesta normalizada del dispatcher de errores de alta. */
export interface OrgStructureStoreError {
  status: number
  body: OrgStructureStoreErrorBody
}

/**
 * Convierte cualquier excepción del alta de departamento o puesto en una
 * respuesta HTTP estable:
 *
 * - `OrgAliasAppError` → 400, shape: `{ type:'warning', title, message, detail, key, code }`.
 *   El `code` se elige según la entidad y el `key` de la excepción.
 * - `E_VALIDATION_ERROR` → 422 con el primer mensaje de Vine.
 * - Cualquier otro → 500 con mensaje genérico (sin filtrar el error real).
 *
 * @param error   - Excepción capturada en el `catch`.
 * @param entity  - Entidad en alta: `'department'` o `'position'`.
 * @param i18n    - Instancia de i18n del contexto HTTP.
 */
export function resolveOrgStructureStoreError(
  error: unknown,
  entity: OrgStructureStoreEntity,
  i18n: I18n,
): OrgStructureStoreError {
  const t = i18n.formatMessage.bind(i18n)

  // ── Alias duplicado o formato inválido ──────────────────────────────────────
  if (error instanceof OrgAliasAppError) {
    const isTaken = error.key === 'alias-en-uso'
    const code =
      entity === 'department'
        ? isTaken
          ? ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_ALIAS_TAKEN
          : ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_ALIAS_INVALID
        : isTaken
          ? ORG_STRUCTURE_ERROR_CODES.POSITION_ALIAS_TAKEN
          : ORG_STRUCTURE_ERROR_CODES.POSITION_ALIAS_INVALID

    return {
      status: 400,
      body: {
        type: 'warning',
        title: error.title,
        message: error.detail,
        detail: error.detail,
        key: error.key,
        code,
      },
    }
  }

  // ── Error de validación de Vine ─────────────────────────────────────────────
  const err = error as { code?: string; messages?: Array<{ message?: string }>; message?: string }
  if (err?.code === 'E_VALIDATION_ERROR') {
    const detail = err.messages?.[0]?.message ?? t('an_unexpected_error_has_occurred_on_the_server')
    const code =
      entity === 'department'
        ? ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_VAL_INPUT
        : ORG_STRUCTURE_ERROR_CODES.POSITION_VAL_INPUT

    return {
      status: 422,
      body: {
        type: 'warning',
        title: t('server_error'),
        message: detail,
        detail,
        code,
      },
    }
  }

  // ── Error no clasificado ────────────────────────────────────────────────────
  const code =
    entity === 'department'
      ? ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_CREATE_FAILED
      : ORG_STRUCTURE_ERROR_CODES.POSITION_CREATE_FAILED

  return {
    status: 500,
    body: {
      type: 'error',
      title: t('server_error'),
      message: t('an_unexpected_error_has_occurred_on_the_server'),
      code,
    },
  }
}

/**
 * Construye la respuesta 422 para cuando el `businessUnitId` del cuerpo difiere
 * de la empresa activa del scope del header (R2).
 */
export function buildDepartmentBusinessUnitMismatchError(i18n: I18n): OrgStructureStoreError {
  const base = ERROR_CODE_TO_I18N_BASE[ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_BUSINESS_UNIT_MISMATCH]
  return {
    status: 422,
    body: {
      type: 'warning',
      title: translate(i18n, `${base}_title`, 'Empresa distinta a la seleccionada'),
      message: translate(
        i18n,
        `${base}_message`,
        'El businessUnitId del cuerpo no coincide con la empresa activa.'
      ),
      key: ERROR_CODE_TO_KEY[ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_BUSINESS_UNIT_MISMATCH],
      code: ORG_STRUCTURE_ERROR_CODES.DEPARTMENT_BUSINESS_UNIT_MISMATCH,
    },
  }
}

/**
 * Construye la respuesta 404 para cuando el departamento que se quiere ligar
 * al puesto no existe, está dado de baja o es de otra empresa.
 */
export function buildPositionDepartmentNotFoundError(
  i18n: I18n,
  linkDepartmentId: number,
): OrgStructureStoreError {
  const base =
    ERROR_CODE_TO_I18N_BASE[ORG_STRUCTURE_ERROR_CODES.POSITION_DEPARTMENT_NOT_FOUND]
  return {
    status: 404,
    body: {
      type: 'warning',
      title: translate(i18n, `${base}_title`, 'Departamento no encontrado'),
      message: translate(
        i18n,
        `${base}_message`,
        'El departamento indicado no existe, ya fue eliminado o no pertenece a esta empresa.'
      ),
      key: ERROR_CODE_TO_KEY[ORG_STRUCTURE_ERROR_CODES.POSITION_DEPARTMENT_NOT_FOUND],
      code: ORG_STRUCTURE_ERROR_CODES.POSITION_DEPARTMENT_NOT_FOUND,
      data: { linkDepartmentId },
    } as OrgStructureStoreErrorBody,
  }
}
