import type { PermissionGateOptions } from '#constants/permission_gate'

const hrCareerPathStandard = (action: string): PermissionGateOptions => ({
  module: 'hr-career-path',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Bandeja de rutas de carrera. Fuente
 * única que consume `start/routes/career_path_candidate_routes.ts`.
 *
 * Antes la bandeja colgaba de la pestaña Ruta de carrera de Empleados
 * (`employees:tab-ruta-carrera-read/write`) mientras el backoffice protegía la
 * pantalla con `hr-career-path:read`: un rol con la bandeja y sin la pestaña
 * recibía 403, y quien solo tenía la pestaña listaba y aprobaba candidatos de
 * toda la empresa por API. Listar, ver el detalle y cambiar estatus solo los
 * usa la bandeja, así que pasan a este módulo.
 *
 * Proponer (`POST`), borrar (`DELETE`) y leer por empleado
 * (`GET /employee/:employeeId`) siguen en Empleados: son acciones de la pestaña
 * del expediente.
 *
 * Límite conocido: el controller no impide que quien propuso apruebe su propia
 * propuesta. Separar proponer de aprobar depende solo de a qué roles se les da
 * `employees:tab-ruta-carrera-write` y `hr-career-path:update`.
 */
export const HR_CAREER_PATH_PERMISSION_DECLARATIONS = {
  indexCareerPathCandidates: hrCareerPathStandard('read'),
  showCareerPathCandidate: hrCareerPathStandard('read'),
  updateCareerPathCandidateStatus: hrCareerPathStandard('update'),
} as const satisfies Record<string, PermissionGateOptions>
