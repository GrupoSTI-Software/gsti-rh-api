import db from '@adonisjs/lucid/services/db'
import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import { SENSITIVE_EXPORT_PLACEHOLDER, isSensitiveExportPlaceholder } from '#constants/sensitive_export_placeholder'
import { SENSITIVE_FIELDS } from '#constants/sensitive_fields'
import { PII_EXPORT_ERROR_CODES } from '#constants/pii_export_error_codes'
import PiiAccessLogService from '#services/pii_access_log_service'
import RoleService from '#services/role_service'
import { PiiExportAuditError } from '../exceptions/pii_export_audit_error.js'
import type { PiiExportDeliverOptionsInterface } from '../interfaces/pii_export_deliver_options_interface.js'

export const EXPORT_SENSITIVE_PERMISSION_MODULE = 'compliance'
export const EXPORT_SENSITIVE_PERMISSION_SLUG = 'export-sensitive-data'

/**
 * Orquestador de exportaciones con campos sensibles del catálogo LFPDPPP.
 *
 * Regla 8 (USRH1783029947540):
 *   - Con permiso `export-sensitive-data`: motivo obligatorio + asiento agrupado + datos completos.
 *   - Sin permiso: mismos filtros/alcanace pero celdas sensibles enmascaradas, sin motivo ni asiento.
 *
 * Patrón fail-closed: el asiento se persiste en la misma transacción antes de generar el archivo.
 */
export default class PiiExportService {
  private piiAccessLogService = new PiiAccessLogService()
  private roleService = new RoleService()

  /**
   * Indica si el usuario puede exportar datos sensibles completos (requiere motivo + bitácora).
   */
  async userCanExportFullSensitive(user: User): Promise<boolean> {
    await user.load('role')
    return this.roleService.hasAccess(
      user.roleId,
      EXPORT_SENSITIVE_PERMISSION_MODULE,
      EXPORT_SENSITIVE_PERMISSION_SLUG
    )
  }

  /**
   * Enmascara un valor del catálogo para exports sin permiso (marcador `*****`).
   */
  maskField(model: string, column: string, value: string | null | undefined): string | null {
    if (isSensitiveExportPlaceholder(value)) {
      return null
    }

    const field = SENSITIVE_FIELDS.find((f) => f.model === model && f.column === column)
    if (!field) {
      return value ?? null
    }

    return SENSITIVE_EXPORT_PLACEHOLDER
  }

  /**
   * Resuelve la unidad de negocio del asiento de auditoría.
   */
  resolveAuditBusinessUnitId(buScope: number[], preferred?: number | null): number {
    if (preferred && buScope.includes(preferred)) {
      return preferred
    }
    if (buScope.length === 1) {
      return buScope[0]
    }
    if (buScope.length > 0) {
      return buScope[0]
    }

    throw new PiiExportAuditError(
      'No hay unidad de negocio válida para registrar la exportación.',
      PII_EXPORT_ERROR_CODES.AUDIT_FAILED,
      500,
      'no-se-pudo-registrar-la-exportacion'
    )
  }

  /**
   * Ejecuta la rama enmascarada o completa según permiso del usuario autenticado.
   *
   * @param generate — recibe `true` si debe enmascarar campos sensibles; `false` si entrega datos completos.
   */
  async deliverSensitiveExport<T>(
    ctx: HttpContext,
    options: PiiExportDeliverOptionsInterface,
    generate: (maskSensitive: boolean) => Promise<T>
  ): Promise<T> {
    const user = ctx.auth.user!
    const canExportFull = await this.userCanExportFullSensitive(user)

    if (!canExportFull) {
      return generate(true)
    }

    const motive = this.readQueryParam(ctx, 'motive')
    const note = this.readQueryParam(ctx, 'note')
    this.piiAccessLogService.validateExportMotive(motive, note)

    const employeeIds =
      typeof options.employeeIds === 'function'
        ? await options.employeeIds()
        : options.employeeIds

    return db.transaction(async (trx) => {
      await this.piiAccessLogService.appendExportAudit(
        {
          businessUnitId: options.businessUnitId,
          accessorUserId: user.userId,
          accessorIp: ctx.request.ip(),
          accessorUserAgent: ctx.request.header('User-Agent') ?? null,
          requestId: ctx.request.id() ?? null,
          originModule: options.originModule ?? null,
          exportKey: options.exportKey,
          sensitiveColumns: options.sensitiveColumns,
          employeeIds,
          filters: options.filters,
          motive: motive!,
          note: note ?? null,
        },
        trx
      )

      return generate(false)
    })
  }

  /**
   * Formatea `PiiExportAuditError` al envelope estándar del API.
   */
  static formatAuditError(
    error: unknown,
    i18n: HttpContext['i18n']
  ): { status: number; body: Record<string, unknown> } | null {
    if (!(error instanceof PiiExportAuditError)) {
      return null
    }

    return {
      status: error.httpStatus,
      body: {
        type: 'error',
        title: i18n.formatMessage('pii_export_title'),
        message: i18n.formatMessage(error.key),
        key: error.key,
        errorCode: error.errorCode,
        data: null,
      },
    }
  }

  private readQueryParam(ctx: HttpContext, key: string): string | undefined {
    const fromBody = ctx.request.input(key)
    if (typeof fromBody === 'string' && fromBody.trim()) {
      return fromBody.trim()
    }

    const fromQuery = ctx.request.qs()[key]
    if (typeof fromQuery === 'string' && fromQuery.trim()) {
      return fromQuery.trim()
    }

    return undefined
  }
}
