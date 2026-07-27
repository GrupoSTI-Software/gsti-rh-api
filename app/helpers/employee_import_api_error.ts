import type { I18n } from '@adonisjs/i18n'
import {
  EMPLOYEE_IMPORT_ERROR_CODES,
  EMPLOYEE_IMPORT_UPLOAD,
  type EmployeeImportErrorCode,
} from '../constants/employee_import_error_codes.js'

export type EmployeeImportValFileErrorData = {
  multipartField: typeof EMPLOYEE_IMPORT_UPLOAD.multipartField
  acceptedExtensions: string[]
  contentType: typeof EMPLOYEE_IMPORT_UPLOAD.contentType
  maxFileBytes: number
  maxFileSizeLabel: string
}

export type ResolvedEmployeeImportError = {
  message: string
  title: string
  status: number
  errorCode: EmployeeImportErrorCode | string
  key?: string
  detail?: string
  data?: EmployeeImportValFileErrorData | null
}

export function buildEmployeeImportValFileErrorData(): EmployeeImportValFileErrorData {
  return {
    multipartField: EMPLOYEE_IMPORT_UPLOAD.multipartField,
    acceptedExtensions: [...EMPLOYEE_IMPORT_UPLOAD.acceptedExtensions],
    contentType: EMPLOYEE_IMPORT_UPLOAD.contentType,
    maxFileBytes: EMPLOYEE_IMPORT_UPLOAD.maxFileBytes,
    maxFileSizeLabel: EMPLOYEE_IMPORT_UPLOAD.maxFileSizeLabel,
  }
}

function translate(i18n: I18n | undefined, key: string, fallback: string): string {
  if (!i18n) return fallback
  const translated = i18n.formatMessage(key)
  if (translated === key || translated.startsWith('translation missing:')) {
    return fallback
  }
  return translated
}

export type EmployeeImportValFileReason = 'missing' | 'invalid_type' | 'too_large'

/** Error de validación de archivo (sin adjunto o no Excel). */
export function resolveEmployeeImportValFileError(
  i18n?: I18n,
  options?: { reason?: EmployeeImportValFileReason; detail?: string }
): ResolvedEmployeeImportError {
  const reason = options?.reason ?? 'invalid_type'
  const field = EMPLOYEE_IMPORT_UPLOAD.multipartField
  const extensions = EMPLOYEE_IMPORT_UPLOAD.acceptedExtensions.join(', ')

  const defaultDetail =
    reason === 'missing'
      ? translate(
          i18n,
          'employee_import_val_file_missing_message',
          `Falta el archivo en ${EMPLOYEE_IMPORT_UPLOAD.contentType}. Envíe un Excel en el campo «${field}» (${extensions}).`
        )
      : reason === 'too_large'
        ? translate(
            i18n,
            'employee_import_val_file_too_large_message',
            `El archivo del campo «${field}» supera el tamaño máximo permitido (${EMPLOYEE_IMPORT_UPLOAD.maxFileSizeLabel}).`
          )
        : translate(
            i18n,
            'employee_import_val_file_invalid_type_message',
            `El archivo del campo «${field}» debe ser un Excel válido (${extensions}).`
          )

  const resolvedDetail = options?.detail ?? defaultDetail
  return {
    title: translate(i18n, 'employee_import_val_file_title', 'Archivo inválido'),
    message: resolvedDetail,
    detail: resolvedDetail,
    status: 400,
    errorCode: EMPLOYEE_IMPORT_ERROR_CODES.VAL_FILE,
    key: 'archivo-invalido',
    data: buildEmployeeImportValFileErrorData(),
  }
}

/**
 * Convierte errores de importación de empleados en respuesta HTTP estándar.
 * Cabeceras inválidas y fallos de servidor no exponen detalle interno en 500.
 */
export function resolveEmployeeImportApiError(
  error: unknown,
  fallbackStatus: number,
  i18n?: I18n
): ResolvedEmployeeImportError {
  const err = error as {
    isHeaderValidationError?: boolean
    statusCode?: number
    message?: string
  }

  if (err?.isHeaderValidationError) {
    const detail =
      err.message ??
      translate(
        i18n,
        'employee_import_val_headers_message',
        'Las cabeceras del archivo Excel no son correctas.'
      )
    return {
      title: translate(i18n, 'employee_import_val_headers_title', 'Cabeceras del archivo inválidas'),
      message: detail,
      detail,
      status: 400,
      errorCode: EMPLOYEE_IMPORT_ERROR_CODES.VAL_HEADERS,
      key: 'cabeceras-invalidas',
    }
  }

  if (fallbackStatus >= 500) {
    const detail = translate(
      i18n,
      'employee_import_server_message',
      'Ocurrió un error inesperado durante la importación.'
    )
    return {
      title: translate(i18n, 'employee_import_server_title', 'Error del servidor'),
      message: detail,
      detail,
      status: 500,
      errorCode: EMPLOYEE_IMPORT_ERROR_CODES.SERVER,
      key: 'error-importacion',
    }
  }

  return resolveEmployeeImportValFileError(
    i18n,
    typeof err?.message === 'string' ? { detail: err.message } : undefined
  )
}
