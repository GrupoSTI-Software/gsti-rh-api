import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import {
  EMPLOYEE_IMPORT_UPLOAD,
  isEmployeeImportExcelPath,
} from '../constants/employee_import_error_codes.js'
import { respondEmployeeImportValFileError } from '../helpers/employee_import_request_errors.js'

/**
 * Rechaza cargas demasiado grandes antes del bodyparser (evita 413 genérico con stack trace).
 * Usa Content-Length cuando el cliente lo envía (p. ej. Postman).
 */
export default class EmployeeImportUploadLimitMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx

    if (request.method() !== 'POST' || !isEmployeeImportExcelPath(request.url())) {
      return next()
    }

    const contentLengthHeader = request.header('content-length')
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader)
      if (
        Number.isFinite(contentLength) &&
        contentLength > EMPLOYEE_IMPORT_UPLOAD.maxFileBytes
      ) {
        return respondEmployeeImportValFileError(ctx, response, 'too_large')
      }
    }

    return next()
  }
}
