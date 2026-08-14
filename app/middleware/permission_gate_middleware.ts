import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import PermissionGateService from '#services/permission_gate_service'
import { PERMISSION_GATE_ERROR_CODES } from '#constants/permission_gate_error_codes'
import type { PermissionGateOptions } from '#constants/permission_gate'

const ERR = {
  DENIED: {
    key: PERMISSION_GATE_ERROR_CODES.DENIED,
    title: 'Sin permiso',
    detail: 'No tienes permiso para realizar esta operación.',
  },
  UNRESOLVED: {
    key: PERMISSION_GATE_ERROR_CODES.UNRESOLVED,
    title: 'No se pudo verificar el permiso',
    detail: 'No fue posible determinar los permisos de tu cuenta. Intenta de nuevo.',
  },
} as const

/**
 * Pieza única de control de acceso (USRH1785766406721): se declara sobre
 * una ruta con `middleware.permissionGate({ module, action, bypass })` y
 * decide si quien envía la petición puede ejecutar la operación.
 *
 * Debe colocarse después de `middleware.auth()` (usa `ctx.auth.user`).
 */
export default class PermissionGateMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options: PermissionGateOptions) {
    const service = ctx.permissionGate ?? (ctx.permissionGate = new PermissionGateService())
    const decision = await service.evaluate(ctx.auth.user, options)

    if (decision.allowed) {
      return next()
    }

    const err = decision.reason === 'unresolved' ? ERR.UNRESOLVED : ERR.DENIED
    return ctx.response.status(403).json({
      title: err.title,
      detail: err.detail,
      key: err.key,
    })
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    permissionGate?: PermissionGateService
  }
}
