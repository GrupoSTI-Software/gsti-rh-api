import type { PermissionGateOptions } from '#constants/permission_gate'

const documentsExpirationMatrixStandard = (action: string): PermissionGateOptions => ({
  module: 'documents-expiration-matrix',
  action,
  bypass: 'standard',
})

/**
 * Declaraciones de permiso de la Matriz de vencimientos
 * (`documents-expiration-matrix`). Fuente única que consumen
 * `start/routes/system_settings_proceeding_files_routes.ts`,
 * `start/routes/repse_registration_routes.ts` y
 * `app/modules/documents-expiration-matrix/documents_expiration_matrix.routes.ts`.
 *
 * La matriz es una vista agregada. Sus vencimientos exclusivos (expediente de
 * la empresa, folio REPSE, insumos) y el endpoint agregado exigen su `read`.
 * El resto de las fuentes lo gobierna el módulo dueño del dato (pestañas de
 * expediente y certificaciones de Empleados, proveedores REPSE); un rol con la
 * matriz y sin esos permisos no recibe esos vencimientos.
 */
export const DOCUMENTS_EXPIRATION_MATRIX_PERMISSION_DECLARATIONS = {
  getExpiredAndExpiringSystemSettingProceedingFiles: documentsExpirationMatrixStandard('read'),
  getExpiredAndExpiringRepseRegistrations: documentsExpirationMatrixStandard('read'),
  /** `GET /api/documents-expiration-matrix`: todas las fuentes en una llamada. */
  getExpirationMatrix: documentsExpirationMatrixStandard('read'),
  /** `GET /api/documents-expiration-matrix/items/:key/file`: archivo de un vencimiento. */
  downloadExpirationMatrixItemFile: documentsExpirationMatrixStandard('read'),
} as const satisfies Record<string, PermissionGateOptions>

/**
 * Regla de compliance REPSE (`assertComplianceRepsePermission`) expresada como
 * declaración del gate, para evaluarla sin responder: la acción o `gestion`
 * del módulo, con `root`, `owner` y `super-administrador` como salvoconducto
 * (`expanded`). Mismo criterio que `repse_coverage_report_permission_declarations.ts`.
 */
const complianceRepseRead = (module: string): PermissionGateOptions => ({
  module,
  action: ['read', 'gestion'],
  bypass: 'expanded',
})

/**
 * Permisos de las fuentes REPSE que la matriz agregada evalúa por su cuenta:
 * una fuente sin permiso no aporta vencimientos (o no ofrece su archivo), pero
 * no tumba la matriz con un 403.
 */
export const DOCUMENTS_EXPIRATION_MATRIX_SOURCE_PERMISSION_DECLARATIONS = {
  /** Folios de proveedores REPSE (lado contratante). */
  readProviderFolios: complianceRepseRead('repse-providers'),
  /** Constancia del folio REPSE propio: misma regla que `GET /repse-registrations/:id/constancia`. */
  downloadRepseConstancia: complianceRepseRead('repse-registrations'),
} as const satisfies Record<string, PermissionGateOptions>
