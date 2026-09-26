/**
 * Slug del módulo con el que se resuelve el permiso de la asignación.
 *
 * La asignación de puntos de acceso es una operación sobre el empleado, no
 * sobre el catálogo de puntos, así que se gobierna con el árbol de permisos de
 * empleados, igual que el resto de la sección de biométricos.
 */
export const ACCESS_POINT_EMPLOYEE_MODULE_SLUG = 'employees'

/** Acción del árbol de permisos que exige la asignación. */
export const ACCESS_POINT_EMPLOYEE_WRITE_ACTION = 'tab-biometricos-write'
