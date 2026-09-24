import type { HttpContext } from '@adonisjs/core/http'
import type { PermissionGateOptions } from '#constants/permission_gate'
import { DOCUMENTS_EXPIRATION_MATRIX_SOURCE_PERMISSION_DECLARATIONS } from '#constants/documents_expiration_matrix_permission_declarations'
import {
  EMPLOYEES_CONTRACT_DOWNLOAD_TAB_READ_PERMISSION,
  EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS,
} from '#constants/employees_download_permission_declarations'
import { EMPLOYEES_READ_PERMISSION_DECLARATIONS } from '#constants/employees_read_permission_declarations'
import { evaluateSecondaryPermission } from '#helpers/permission_gate_secondary'
import UserService from '#services/user_service'
import { TenantContext } from '#utils/tenant_context'
import type { ExpirationMatrixAccess } from './documents_expiration_matrix.service.js'

/** Todas las declaraciones pasan; lista vacía = permitido (lo cubre el gate de la ruta). */
async function allowsAll(
  ctx: HttpContext,
  declarations: readonly PermissionGateOptions[]
): Promise<boolean> {
  const decisions = await Promise.all(
    declarations.map((declaration) => evaluateSecondaryPermission(ctx, declaration))
  )
  return decisions.every(Boolean)
}

/**
 * Resuelve qué fuentes ve la sesión y cuáles puede abrir, con la misma regla
 * del gate (`evaluateSecondaryPermission`: exigencia, salvoconducto y
 * concesiones), más el scope de empresa y de departamentos.
 *
 * Permisos por fuente (además del `documents-expiration-matrix:read` de la ruta):
 * - `employee-file`: ver `employees:tab-expediente-read`; abrir `employees:download-proceeding-files`.
 * - `employee-contract`: ver `employees:tab-expediente-read`; abrir
 *   `employees:download-employee-contract` + `employees:tab-trabajo-read` (lo mismo
 *   que exige `GET /employee-contracts/:id/download`).
 * - `company-file`, `repse-folio` (ver) y `supply`: los cubre la matriz.
 * - `certification`: ver y abrir `employees:tab-certificaciones-read`.
 * - `repse-folio` (abrir constancia): `repse-registrations` read o gestion.
 * - `provider-folio`: `repse-providers` read o gestion (no tiene archivo).
 */
export async function resolveExpirationMatrixAccess(
  ctx: HttpContext
): Promise<ExpirationMatrixAccess> {
  const sourcePermissions = DOCUMENTS_EXPIRATION_MATRIX_SOURCE_PERMISSION_DECLARATIONS
  const [
    readEmployeeFiles,
    downloadEmployeeFiles,
    downloadEmployeeContracts,
    readCertifications,
    downloadRepseConstancia,
    readProviderFolios,
  ] = await Promise.all([
    allowsAll(ctx, [EMPLOYEES_READ_PERMISSION_DECLARATIONS.getExpiredExpiringProceedingFiles]),
    allowsAll(ctx, [EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.downloadProceedingFile]),
    allowsAll(ctx, [
      EMPLOYEES_DOWNLOAD_PERMISSION_DECLARATIONS.downloadEmployeeContract,
      EMPLOYEES_CONTRACT_DOWNLOAD_TAB_READ_PERMISSION,
    ]),
    allowsAll(ctx, [EMPLOYEES_READ_PERMISSION_DECLARATIONS.getExpiredExpiringCertifications]),
    allowsAll(ctx, [sourcePermissions.downloadRepseConstancia]),
    allowsAll(ctx, [sourcePermissions.readProviderFolios]),
  ])

  // Departamentos del rol: acotan todas las fuentes con dueño empleado. Insumos
  // siempre se leen, así que se consultan en cada petición autenticada.
  const user = ctx.auth.user
  const departmentIds = user ? await new UserService(ctx.i18n).getRoleDepartments(user.userId) : []

  return {
    businessUnitIds: TenantContext.getScope(),
    departmentIds,
    sources: {
      'employee-file': { read: readEmployeeFiles, download: downloadEmployeeFiles },
      'employee-contract': { read: readEmployeeFiles, download: downloadEmployeeContracts },
      'company-file': { read: true, download: true },
      'certification': { read: readCertifications, download: readCertifications },
      'repse-folio': { read: true, download: downloadRepseConstancia },
      'provider-folio': { read: readProviderFolios, download: readProviderFolios },
      'supply': { read: true, download: true },
    },
  }
}
