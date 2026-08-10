import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import PermissionGateService from '#services/permission_gate_service'
import { respondPermissionGateDenial } from '#helpers/permission_gate_http'
import type { PermissionGateOptions } from '#constants/permission_gate'

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

    return respondPermissionGateDenial(ctx, decision)
  }
}

declare module '@adonisjs/core/http' {
  export interface HttpContext {
    permissionGate?: PermissionGateService
  }
}
