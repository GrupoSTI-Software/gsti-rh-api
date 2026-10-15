import AccessPointScopeRepositoryMysql from './access_point_scope.repository.mysql.js'
import type { AccessPointScopePort } from './access_point_scope.port.js'

/**
 * Instancia de conveniencia del scope de un checador (VLRH-P0065, 3.4).
 *
 * Solo para consumidores que no se construyen y por lo tanto no reciben el
 * puerto por constructor: las funciones sueltas de
 * `access_point_authorization.ts`, que llaman los controladores en cada
 * peticion. Todo servicio, repositorio o controlador recibe
 * `AccessPointScopePort` por constructor (o campo) con default a
 * `AccessPointScopeRepositoryMysql`.
 */
export const AccessPointScope: AccessPointScopePort = new AccessPointScopeRepositoryMysql()
