/**
 * Cadena de aviso de las solicitudes de permiso.
 *
 * Cuando un colaborador pide un permiso desde la app, alguien tiene que
 * enterarse. El primero en la fila es su jefe directo; si no tiene uno
 * asignado, el aviso sube por la organizacion hasta encontrar a alguien con
 * facultad para atenderlo. Un permiso que nadie recibe es un permiso que nadie
 * resuelve.
 */

/** Eslabon de la cadena que efectivamente recibio el aviso. */
export const EXCEPTION_REQUEST_APPROVER_LINK = {
  /** Jefe directo asignado al colaborador. */
  DIRECT_BOSS: 'direct-boss',
  /** Recursos Humanos de la empresa del colaborador. */
  HR: 'hr',
  /** Administracion de la empresa. */
  ADMIN: 'admin',
  /** Dueno de la cuenta. */
  OWNER: 'owner',
} as const

export type ExceptionRequestApproverLink =
  (typeof EXCEPTION_REQUEST_APPROVER_LINK)[keyof typeof EXCEPTION_REQUEST_APPROVER_LINK]

/**
 * Permiso que acompaña a la marca de Recursos Humanos en solicitudes de permiso.
 *
 * La marca dice quién cumple la función. Este permiso dice quién puede enterarse
 * de una ausencia. Las dos hacen falta: ninguna de las dos alcanza sola.
 */
export const EXCEPTION_REQUEST_HR_REQUIRED_PERMISSION = {
  moduleSlug: 'exception-requests',
  permissionSlug: 'read',
} as const

/** Slugs de rol de administracion, tercer eslabon. */
export const EXCEPTION_REQUEST_ADMIN_ROLE_SLUGS: readonly string[] = ['admin', 'administrador']

/**
 * Slugs de rol del dueno de la cuenta, ultimo eslabon.
 *
 * `root` entra aqui porque en los clientes que todavia no arman jerarquia es la
 * unica cuenta viva con facultad sobre el modulo.
 */
export const EXCEPTION_REQUEST_OWNER_ROLE_SLUGS: readonly string[] = ['owner', 'root']

/**
 * Eslabón de la cadena cuando el colaborador no tiene jefe directo.
 *
 * Recursos Humanos no se reconoce por el nombre del rol: se reconoce por la
 * marca y por el permiso de acceso al módulo. Administración y dueño siguen
 * por el nombre interno de su rol.
 */
export type ExceptionRequestRoleChainLink =
  | { link: typeof EXCEPTION_REQUEST_APPROVER_LINK.HR; source: 'human-capital' }
  | {
      link:
        | typeof EXCEPTION_REQUEST_APPROVER_LINK.ADMIN
        | typeof EXCEPTION_REQUEST_APPROVER_LINK.OWNER
      source: 'role-slugs'
      slugs: readonly string[]
    }

/**
 * Eslabones, EN ORDEN, para cuando el colaborador no tiene jefe directo
 * asignado.
 *
 * El orden es la regla de negocio, no un detalle de implementacion: el aviso
 * sube por la organizacion y se detiene en el primero que tenga a alguien
 * alcanzable. Se declara como dato y no repartido en condicionales para que
 * cambiarlo sea cambiar esta lista.
 *
 * El jefe directo no aparece aqui porque no se resuelve por rol: se resuelve por
 * la asignacion en `user_responsible_employee`.
 */
export const EXCEPTION_REQUEST_ROLE_CHAIN: readonly ExceptionRequestRoleChainLink[] = [
  { link: EXCEPTION_REQUEST_APPROVER_LINK.HR, source: 'human-capital' },
  {
    link: EXCEPTION_REQUEST_APPROVER_LINK.ADMIN,
    source: 'role-slugs',
    slugs: EXCEPTION_REQUEST_ADMIN_ROLE_SLUGS,
  },
  {
    link: EXCEPTION_REQUEST_APPROVER_LINK.OWNER,
    source: 'role-slugs',
    slugs: EXCEPTION_REQUEST_OWNER_ROLE_SLUGS,
  },
]

/** Ruta del modulo de solicitudes en el backoffice, para el enlace del correo. */
export const EXCEPTION_REQUEST_BOARD_MODULE_PATH = '/exception-requests'
