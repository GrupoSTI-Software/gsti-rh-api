import type { PermissionGateOptions } from '#constants/permission_gate'

const careerPathTemplatesStandard = (action: string): PermissionGateOptions => ({
  module: 'career-path-templates',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso del módulo Catálogo de rutas de carrera. Fuente
 * única que consume `start/routes/career_path_template_routes.ts`.
 *
 * Antes cualquier sesión del tenant creaba, reescribía o eliminaba plantillas
 * por API: la casilla de roles del módulo solo decidía si el backoffice
 * mostraba la pantalla.
 *
 *  - `POST` y `DELETE`: su único consumidor es la pantalla del catálogo.
 *  - `PUT`: hoy no tiene pantalla (el backoffice no edita plantillas), pero la
 *    ruta existe y reescribe origen y destino; sin gate cualquier sesión podía
 *    hacerlo.
 *  - `GET /:id`: sin consumidor conocido; pide `read` para no dejar la lectura
 *    puntual más abierta que la pantalla.
 *
 * Sin declaración a propósito:
 *  - `GET /api/career-path-templates`: la pestaña Ruta de carrera del
 *    expediente la usa para proponer ruta con `employees:tab-ruta-carrera-write`.
 *    El gate no admite OR entre módulos, y exigir este módulo cerraría la
 *    propuesta a quien no administra el catálogo.
 */
export const CAREER_PATH_TEMPLATES_PERMISSION_DECLARATIONS = {
  storeCareerPathTemplate: careerPathTemplatesStandard('create'),
  showCareerPathTemplate: careerPathTemplatesStandard('read'),
  updateCareerPathTemplate: careerPathTemplatesStandard('update'),
  deleteCareerPathTemplate: careerPathTemplatesStandard('delete'),
} as const satisfies Record<string, PermissionGateOptions>
