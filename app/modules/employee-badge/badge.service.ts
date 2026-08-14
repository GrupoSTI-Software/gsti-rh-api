import env from '#start/env'
import QRCode from 'qrcode'
import { EMPLOYEE_BADGE_ERROR_CODES } from '#constants/employee_badge_error_codes'
import { EmployeeBadgeError } from '#exceptions/employee_badge_error'
import { isBusinessCalendarDateBefore, toBusinessDateString } from '#utils/business_date'
import BadgeRepositoryMysql from './badge.repository.mysql.js'
import { isValidBadgeTokenFormat } from './validators/verify_badge.validator.js'
import type { BadgeRepository } from './badge.repository.js'
import type { BadgeEmployeeContext, GafeteDto, GafeteVerificacionDto } from './dto/badge.dto.js'
import type { BadgeRenderContext } from './badge_render.service.js'

/** Fallback espejo de `magic_link_service.ts` cuando `BACKOFFICE_URL` no está definida. */
const DEFAULT_BACKOFFICE_URL = 'http://127.0.0.1:3000'

/**
 * Servicio de negocio del gafete del trabajador (USRH1784686362321).
 *
 * Arma el `GafeteDto` (E1/E3), resuelve el token de forma perezosa y
 * calcula `vinculoVigente`/`folioRepse`/`folioVigente` en lectura — nada de
 * esto se persiste salvo el token mismo (§10.2 del spec).
 */
export default class BadgeService {
  private readonly repository: BadgeRepository

  constructor(repository: BadgeRepository = new BadgeRepositoryMysql()) {
    this.repository = repository
  }

  /** E1 — `GET /api/employee-badges/:employeeId`. */
  async getBadgeForEmployeeInTenant(
    employeeId: number,
    businessUnitIds: number[]
  ): Promise<GafeteDto> {
    const context = await this.repository.findActiveEmployeeInTenant(employeeId, businessUnitIds)
    if (!context) {
      throw new EmployeeBadgeError(
        'El gafete no existe o el trabajador no pertenece al tenant actual.',
        EMPLOYEE_BADGE_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        404,
        'gafete-no-encontrado'
      )
    }
    return this.buildGafeteDto(context)
  }

  /** E3 — `GET /api/employee-badges/me`. Resuelve por `personId`, jamás por `employeeId` del cliente. */
  async getBadgeForSelf(personId: number, businessUnitIds: number[]): Promise<GafeteDto> {
    const context = await this.repository.findActiveEmployeeByPersonId(personId, businessUnitIds)
    if (!context) {
      throw new EmployeeBadgeError(
        'El usuario autenticado no tiene un empleado activo asociado.',
        EMPLOYEE_BADGE_ERROR_CODES.SELF_EMPLOYEE_NOT_FOUND,
        422,
        'sin-empleado-asociado'
      )
    }
    return this.buildGafeteDto(context)
  }

  /** Contexto completo (sin QR) para armar el PDF (E2). Reutiliza la misma resolución que E1. */
  async getBadgeContextForPdf(
    employeeId: number,
    businessUnitIds: number[]
  ): Promise<{ dto: GafeteDto; context: BadgeEmployeeContext }> {
    const context = await this.repository.findActiveEmployeeInTenant(employeeId, businessUnitIds)
    if (!context) {
      throw new EmployeeBadgeError(
        'El gafete no existe o el trabajador no pertenece al tenant actual.',
        EMPLOYEE_BADGE_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        404,
        'gafete-no-encontrado'
      )
    }
    const dto = await this.buildGafeteDto(context)
    return { dto, context }
  }

  /**
   * Contexto de render para E2/E5/E6 — resuelve token perezoso y campos visuales
   * sin generar `qrDataUrl` (innecesario para PDF/PNG binario).
   */
  async buildRenderContext(context: BadgeEmployeeContext): Promise<BadgeRenderContext> {
    const token = await this.repository.resolveOrCreateToken(context.employeeId)
    const urlVerificacion = this.buildVerificationUrl(token)
    const { folioRepse, folioVigente } = this.resolveFolio(context.repseFolio, context.repseExpiresAt)

    return {
      employeeId: context.employeeId,
      nombreCompleto: this.buildFullName(
        context.personFirstname,
        context.personLastname,
        context.personSecondLastname
      ),
      fotoUrl: this.resolvePhotoUrl(context.employeePhoto),
      empresa: context.businessUnitLegalName || context.businessUnitName,
      puesto: context.positionName,
      folioRepse,
      folioVigente,
      urlVerificacion,
    }
  }

  /**
   * E4 — verificación pública. Validación de formato barata ANTES de tocar
   * BD (fallo ⇒ mismo 404 que inexistente/revocado, regla 7); lookup con
   * `withTrashed()` + select mínimo (R5, aislado de modelos Lucid).
   */
  async getVerification(rawToken: unknown): Promise<GafeteVerificacionDto> {
    if (!isValidBadgeTokenFormat(rawToken)) {
      throw this.verificationNotFoundError()
    }

    const row = await this.repository.findPublicByToken(rawToken)
    if (!row) {
      throw this.verificationNotFoundError()
    }

    const vinculoVigente = row.employeeActive && row.businessUnitActive
    const { folioRepse, folioVigente } = this.resolveFolio(row.repseFolio, row.repseExpiresAt)

    return {
      trabajador: this.buildFullName(row.personFirstname, row.personLastname, row.personSecondLastname),
      empresa: row.businessUnitLegalName || row.businessUnitName,
      vinculoVigente,
      folioRepse,
      folioVigente,
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async buildGafeteDto(context: BadgeEmployeeContext): Promise<GafeteDto> {
    const token = await this.repository.resolveOrCreateToken(context.employeeId)
    const urlVerificacion = this.buildVerificationUrl(token)
    const qrDataUrl = await QRCode.toDataURL(urlVerificacion, { margin: 1, width: 320 })
    const { folioRepse, folioVigente } = this.resolveFolio(context.repseFolio, context.repseExpiresAt)

    return {
      empleadoId: context.employeeId,
      nombreCompleto: this.buildFullName(
        context.personFirstname,
        context.personLastname,
        context.personSecondLastname
      ),
      fotoUrl: this.resolvePhotoUrl(context.employeePhoto),
      fotoFaltante: this.resolvePhotoUrl(context.employeePhoto) === null,
      empresa: context.businessUnitLegalName || context.businessUnitName,
      puesto: context.positionName,
      folioRepse,
      folioVigente,
      // En las superficies de generación el empleado consultable está activo
      // por construcción (regla 1); viaja igual en el DTO (§10.2).
      vinculoVigente: true,
      urlVerificacion,
      qrDataUrl,
    }
  }

  private resolveFolio(
    folio: string | null,
    expiresAt: BadgeEmployeeContext['repseExpiresAt']
  ): { folioRepse: string | null; folioVigente: boolean | null } {
    if (!folio || !expiresAt) {
      return { folioRepse: null, folioVigente: null }
    }
    const expiresAtIso = expiresAt.toISODate()
    return {
      folioRepse: folio,
      folioVigente: !isBusinessCalendarDateBefore(expiresAtIso, toBusinessDateString()),
    }
  }

  private buildFullName(firstname: string, lastname: string, secondLastname: string): string {
    return [firstname, lastname, secondLastname]
      .map((part) => part?.trim())
      .filter((part) => !!part)
      .join(' ')
      .replace(/\s+/g, ' ')
  }

  /** Espejo defensivo de `resolvePhotoUrl` (`attendance_fault_hr_notification_service.ts:425-438`). */
  private resolvePhotoUrl(photo: string | null): string | null {
    if (!photo) return null
    if (photo.startsWith('http://') || photo.startsWith('https://')) return photo
    const base = env.get('APP_URL', '').replace(/\/$/, '')
    if (!base) return photo
    const path = photo.startsWith('/') ? photo : `/${photo}`
    return `${base}${path}`
  }

  /** Espejo de `magic_link_service.ts:50-51`: la variable `BACKOFFICE_URL` ya existe, sin env nueva. */
  private buildVerificationUrl(token: string): string {
    const backofficeUrl = env.get('BACKOFFICE_URL') ?? DEFAULT_BACKOFFICE_URL
    return `${backofficeUrl.replace(/\/$/, '')}/badge-verification/${token}`
  }

  private verificationNotFoundError(): EmployeeBadgeError {
    return new EmployeeBadgeError(
      'El código de verificación no existe, es inválido o fue revocado.',
      EMPLOYEE_BADGE_ERROR_CODES.VERIFICATION_NOT_FOUND,
      404,
      'verificacion-no-encontrada'
    )
  }
}
