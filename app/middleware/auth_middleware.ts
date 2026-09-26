import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'
import AuthTokenService from '#services/auth_token_service'
import { respondAccessTokenUnauthorized } from '../helpers/auth_token_response.js'

/**
 * Auth middleware is used authenticate HTTP requests and deny
 * access to unauthenticated users.
 */
export default class AuthMiddleware {
  /**
   * The URL to redirect to, when authentication fails
   */
  redirectTo = '/login'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: {
      guards?: (keyof Authenticators)[]
    } = {}
  ) {
    try {
      await ctx.auth.authenticateUsing(options.guards, { loginRoute: this.redirectTo })
      return next()
    } catch (error: unknown) {
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
        return respondAccessTokenUnauthorized(ctx.response, code)
      }

      throw error
    }
  }
}
