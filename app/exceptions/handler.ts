import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import AuthTokenService from '#services/auth_token_service'
import { respondAccessTokenUnauthorized } from '../helpers/auth_token_response.js'
import { isEmployeeImportExcelPath } from '../constants/employee_import_error_codes.js'
import {
  isRequestEntityTooLarge,
  respondEmployeeImportValFileError,
} from '../helpers/employee_import_request_errors.js'
import {
  isContratoImportExcelPath,
  isContratoImportRateLimitError,
  respondContratoImportRateLimit,
} from '../helpers/contrato_import_request_errors.js'
import {
  isResendAccessPath,
  isResendAccessRateLimitError,
  respondResendAccessRateLimit,
} from '../helpers/user_resend_access_request_errors.js'
import {
  isAuthInvitationPath,
  isAuthInvitationRateLimitError,
  respondAuthInvitationRateLimit,
} from '../helpers/auth_invitation_request_errors.js'
import {
  isAdditionalBusinessUnitCreatePath,
  isAdditionalBusinessUnitRateLimitError,
  respondAdditionalBusinessUnitRateLimit,
} from '../helpers/business_unit_request_errors.js'
import { isFileIntakeError, respondFileIntakeError } from '../helpers/file_intake_api_error.js'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    /**
     * Rechazo de la entrada de archivos. Sin esta rama el error llega al
     * manejador por defecto: responde 500 en vez del 422 que es, y fuera de
     * produccion (`debug = !app.inProduction`) vuelca la pila y rutas
     * absolutas del servidor en la respuesta.
     *
     * Es la red que recogen los `throw` de los puntos de subida; el que un
     * modulo prefiera traducir el rechazo a su propio contrato (como hace el
     * buzon de quejas) sigue siendo valido y no pasa por aqui.
     */
    if (isFileIntakeError(error)) {
      respondFileIntakeError(ctx.response, error)
      return
    }

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'E_UNAUTHORIZED_ACCESS'
    ) {
      const authTokenService = new AuthTokenService()
      const result = await authTokenService.classifyAccessToken(
        ctx.request.header('authorization')
      )

      const code = result.status === 'error' ? result.code : 'token_invalid'
      await respondAccessTokenUnauthorized(ctx.response, code)
      return
    }

    if (
      isRequestEntityTooLarge(error) &&
      isEmployeeImportExcelPath(ctx.request.url())
    ) {
      return respondEmployeeImportValFileError(ctx, ctx.response, 'too_large')
    }

    if (isContratoImportRateLimitError(error) && isContratoImportExcelPath(ctx.request.url())) {
      return respondContratoImportRateLimit(ctx, error)
    }

    if (isResendAccessRateLimitError(error) && isResendAccessPath(ctx.request.url())) {
      return respondResendAccessRateLimit(ctx, error)
    }

    if (isAuthInvitationRateLimitError(error) && isAuthInvitationPath(ctx.request.url())) {
      return respondAuthInvitationRateLimit(ctx, error)
    }

    if (
      isAdditionalBusinessUnitRateLimitError(error) &&
      isAdditionalBusinessUnitCreatePath(ctx.request.url())
    ) {
      return respondAdditionalBusinessUnitRateLimit(ctx, error)
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
