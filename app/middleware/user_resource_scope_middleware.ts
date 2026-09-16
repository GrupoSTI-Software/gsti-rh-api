import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import User from '#models/user'
import UserService from '#services/user_service'
import UserScopeDeniedService from '#services/user_scope_denied_service'
import { USER_INVITATION_RESEND_ERRORS } from '#constants/user_invitation_error_codes'

export type UserResourceScopeOptions = {
  /** Acción auditada ante scope denegado (show|update|delete|resend-access). */
  action: string
  /** Formato de la respuesta 404; por defecto el legacy del módulo de usuarios. */
  notFoundResponse?: 'legacy' | 'invitation'
}

/**
 * Resuelve `:userId` dentro del `businessUnitScope` del actor antes del handler.
 *
 * Si el usuario no existe en el scope del actor: bitácora, revoca sesión del actor
 * (anti-IDOR) y responde 404 uniforme — sin distinguir "no existe" de "ajeno".
 *
 * Debe ir **después** de `middleware.auth()` y `middleware.businessScope()`.
 * No sustituye a `permissionGate`: aquí se valida tenancy del recurso, no permiso del módulo.
 */
export default class UserResourceScopeMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: UserResourceScopeOptions) {
    const userId = Number(ctx.params.userId)
    const businessUnitScope = ctx.businessUnitScope ?? []
    const notFoundResponse = options.notFoundResponse ?? 'legacy'

    if (!Number.isInteger(userId) || userId <= 0) {
      await UserScopeDeniedService.handleCrudDenied(
        {
          action: options.action,
          requestedId: ctx.params.userId ?? userId,
          actorUserId: ctx.auth.user?.userId ?? null,
          businessUnitScope,
        },
        ctx.auth.user
      )
      return this.respondNotFound(ctx, userId, notFoundResponse)
    }

    const userService = new UserService(ctx.i18n)
    const scopedUser = await userService.findActiveInBusinessUnitScope(userId, businessUnitScope)

    if (!scopedUser) {
      await UserScopeDeniedService.handleCrudDenied(
        {
          action: options.action,
          requestedId: userId,
          actorUserId: ctx.auth.user?.userId ?? null,
          businessUnitScope,
        },
        ctx.auth.user
      )
      return this.respondNotFound(ctx, userId, notFoundResponse)
    }

    ctx.scopedUser = scopedUser
    return next()
  }

  private respondNotFound(
    ctx: HttpContext,
    userId: number,
    format: NonNullable<UserResourceScopeOptions['notFoundResponse']>
  ) {
    // El cuerpo se ESCRIBE en `response`, no se devuelve: Adonis serializa el
    // valor de retorno de un controlador, pero el de un middleware lo descarta.
    // Devolviéndolo, la respuesta salía 404 con cuerpo vacío `{}` y el cliente
    // se quedaba sin título, sin mensaje y sin `key` con los que reaccionar
    // —y el 404 dejaba de ser indistinguible del de "no existe", que es justo
    // lo que este middleware promete.
    if (format === 'invitation') {
      const err = USER_INVITATION_RESEND_ERRORS.NOT_FOUND
      return ctx.response.status(err.status).json({
        title: err.title,
        detail: err.detail,
        key: err.key,
        code: err.code,
      })
    }

    return ctx.response.status(404).json({
      type: 'warning',
      title: 'The user was not found',
      message: 'The user was not found with the entered ID',
      data: { userId },
    })
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    /** Usuario objetivo resuelto en scope; presente tras `userResourceScope`. */
    scopedUser?: User
  }
}
