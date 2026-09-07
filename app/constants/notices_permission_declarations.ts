import type { PermissionGateOptions } from '#constants/permission_gate'
import { NOTICE_PERMISSION_MODULE_SLUG } from '#constants/notice'

/** Acciones sembradas para el módulo 32 en `0018_system_permission_seeder`. */
type NoticeActionSlug = 'read' | 'create' | 'update' | 'delete'

const noticesStandard = (action: NoticeActionSlug): PermissionGateOptions => ({
  module: NOTICE_PERMISSION_MODULE_SLUG,
  action,
  bypass: 'standard',
})

/**
 * Lecturas de administración del buzón de avisos. NO van en el router:
 * `index`, `show` y los binarios se comparten con la app del colaborador, que
 * se identifica por `employeeId` o por su fila de destinatario y no por
 * permiso. El controlador evalúa estas declaraciones solo en la rama sin
 * colaborador (molde: `employee_biometric_face_id_routes.ts`).
 */
export const NOTICES_READ_PERMISSION_DECLARATIONS = {
  index: noticesStandard('read'),
  show: noticesStandard('read'),
  fileContent: noticesStandard('read'),
  bodyFile: noticesStandard('read'),
} as const satisfies Record<string, PermissionGateOptions>

/** Escrituras: solo el backoffice las usa y van montadas en el router. */
export const NOTICES_WRITE_PERMISSION_DECLARATIONS = {
  store: noticesStandard('create'),
  update: noticesStandard('update'),
  delete: noticesStandard('delete'),
  send: noticesStandard('update'),
  duplicate: noticesStandard('create'),
} as const satisfies Record<string, PermissionGateOptions>
