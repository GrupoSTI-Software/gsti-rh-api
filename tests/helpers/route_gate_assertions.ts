import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Assert } from '@japa/assert'
import type { PermissionGateOptions } from '#constants/permission_gate'

/**
 * Aserciones estáticas sobre archivos de rutas: qué ruta declara
 * `permissionGate`, con qué declaración, y cuál queda sin gate a propósito.
 *
 * Trabajan sobre el fuente sin espacios ni saltos: así no dependen del formato
 * que deje prettier ni de si la ruta se escribe `router.get(...)` o
 * `router\n.get(...)`. `handler` va completo (`#controllers/x.metodo`) para que
 * sirva igual a controllers clásicos y a módulos.
 */

export type RouteHttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

export interface RouteRef {
  method: RouteHttpMethod
  path: string
  handler: string
}

export interface GatedRouteRef extends RouteRef {
  /** Expresión con la que la ruta referencia su declaración (`ALIAS.clave`). */
  gate: string
}

const GATE_CALL = 'middleware.permissionGate('

export const readSource = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), 'utf-8')

export const compactSource = (content: string) => content.replace(/\s+/g, '')

/**
 * Expresión `ALIAS.clave` con la clave tipada contra el mapa de declaraciones:
 * una clave que no existe no compila.
 */
export function gateExpression<T extends Record<string, PermissionGateOptions>>(
  alias: string,
  _declarations: T,
  key: keyof T & string
): string {
  return `${alias}.${key}`
}

/**
 * Middleware encadenado a una ruta: desde su declaración hasta la siguiente
 * ruta o el cierre del grupo.
 */
export function routeChain(assert: Assert, content: string, route: RouteRef): string {
  const flat = compactSource(content)
  const head = compactSource(`router.${route.method}('${route.path}', '${route.handler}')`)
  const index = flat.indexOf(head)

  assert.isAbove(index, -1, `${route.method.toUpperCase()} ${route.path} debe existir`)

  const rest = flat.slice(index + head.length)
  const end = rest.search(/router\.(get|post|put|patch|delete)\(|\}\)\.prefix\(/)
  return end === -1 ? rest : rest.slice(0, end)
}

/** La ruta declara exactamente su gate: uno solo, el esperado. */
export function assertRouteGated(assert: Assert, content: string, route: GatedRouteRef): void {
  const chain = routeChain(assert, content, route)
  const label = `${route.method.toUpperCase()} ${route.path}`

  assert.include(chain, `.use(${GATE_CALL}${route.gate}))`, `${label} debe declarar ${route.gate}`)
  assert.equal(chain.split(GATE_CALL).length - 1, 1, `${label} debe tener un solo permissionGate`)
}

/** La ruta no declara ningún gate. */
export function assertRouteOpen(assert: Assert, content: string, route: RouteRef): void {
  assert.notInclude(
    routeChain(assert, content, route),
    GATE_CALL,
    `${route.method.toUpperCase()} ${route.path} debe quedar sin gate`
  )
}
