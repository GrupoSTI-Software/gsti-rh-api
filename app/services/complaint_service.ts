import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import Complaint from '#models/complaint'
import Employee from '#models/employee'
import User from '#models/user'
import { COMPLAINT_ERROR_CODES } from '#constants/complaint_error_codes'
import {
  COMPLAINT_FOLIO_PREFIX,
  COMPLAINT_INITIAL_STATUS,
  COMPLAINT_PASSPHRASE_LENGTH,
} from '#constants/complaint'
import { ComplaintServiceError } from '#exceptions/complaint_service_error'
import type {
  ComplaintAdminResult,
  ComplaintCreateResult,
  ComplaintListFilters,
  ComplaintListResult,
  ComplaintStatusResult,
  ConsultComplaintStatusInput,
  CreateComplaintInput,
  UpdateComplaintStatusInput,
} from '../interfaces/complaint_interface.js'

const PASSPHRASE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Serialización admin: nunca expone employeeId ni relaciones de identidad. */
function serializeComplaintAdmin(complaint: Complaint): ComplaintAdminResult {
  return {
    complaintId: complaint.complaintId,
    folio: complaint.complaintFolio,
    category: complaint.complaintCategory,
    description: complaint.complaintDescription,
    status: complaint.complaintStatus,
    businessUnitId: complaint.businessUnitId,
    createdAt: complaint.complaintCreatedAt.toISO()!,
    updatedAt: complaint.complaintUpdatedAt.toISO()!,
  }
}

/**
 * Servicio del buzón de quejas confidencial (NOM-035 8.1.b).
 */
export default class ComplaintService {
  /**
   * Registra una queja asociada al empleado autenticado.
   * Devuelve folio y passphrase en claro (única vez).
   */
  async create(user: User, input: CreateComplaintInput): Promise<ComplaintCreateResult> {
    await user.load('person')

    if (!user.person?.personId) {
      throw new ComplaintServiceError(
        'El usuario no tiene una persona asociada',
        COMPLAINT_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        403,
        'AUTH.COMPLAINT.EMPLOYEE_NOT_FOUND'
      )
    }

    const employee = await Employee.query()
      .where('personId', user.person.personId)
      .whereNull('employee_deleted_at')
      .first()

    if (!employee) {
      throw new ComplaintServiceError(
        'El usuario no tiene un registro de empleado asociado',
        COMPLAINT_ERROR_CODES.EMPLOYEE_NOT_FOUND,
        403,
        'AUTH.COMPLAINT.EMPLOYEE_NOT_FOUND'
      )
    }

    const plainPassphrase = this.generatePassphrase()
    const complaintPassphraseHash = await hash.make(plainPassphrase)
    const complaintFolio = await this.generateUniqueFolio()

    const complaint = await Complaint.create({
      employeeId: employee.employeeId,
      businessUnitId: employee.businessUnitId,
      complaintFolio,
      complaintPassphraseHash,
      complaintCategory: input.category,
      complaintDescription: input.description.trim(),
      complaintStatus: COMPLAINT_INITIAL_STATUS,
    })

    return {
      folio: complaint.complaintFolio,
      passphrase: plainPassphrase,
      status: complaint.complaintStatus,
      category: complaint.complaintCategory,
      createdAt: complaint.complaintCreatedAt.toISO()!,
    }
  }

  /**
   * Consulta el estatus de una queja por folio y passphrase, sin re-identificar al empleado.
   */
  async consultStatus(input: ConsultComplaintStatusInput): Promise<ComplaintStatusResult> {
    const complaint = await Complaint.query()
      .where('complaint_folio', input.folio.trim())
      .whereNull('complaint_deleted_at')
      .first()

    const passphraseValid =
      complaint &&
      (await hash.verify(complaint.complaintPassphraseHash, input.passphrase.trim()))

    if (!passphraseValid) {
      throw new ComplaintServiceError(
        'Folio o clave de acceso incorrectos',
        COMPLAINT_ERROR_CODES.STATUS_NOT_FOUND,
        404,
        'caso-no-encontrado'
      )
    }

    return {
      folio: complaint!.complaintFolio,
      status: complaint!.complaintStatus,
      category: complaint!.complaintCategory,
      createdAt: complaint!.complaintCreatedAt.toISO()!,
      updatedAt: complaint!.complaintUpdatedAt.toISO()!,
    }
  }

  /**
   * Listado paginado para administradores. Filtra por estatus y scope de empresa.
   * No expone datos del empleado reportante.
   */
  async listPaginated(
    filters: ComplaintListFilters,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintListResult> {
    const safePage = Math.max(filters.page ?? 1, 1)
    const safeLimit = Math.min(Math.max(filters.limit ?? 20, 1), 100)

    const query = Complaint.query()
      .whereNull('complaint_deleted_at')
      .if(allowedBusinessUnitIds.length > 0, (builder) => {
        builder.whereIn('business_unit_id', allowedBusinessUnitIds)
      })
      .if(allowedBusinessUnitIds.length === 0, (builder) => {
        builder.whereRaw('1 = 0')
      })

    if (filters.status) {
      query.where('complaint_status', filters.status)
    }

    query.orderBy('complaint_created_at', 'desc')

    const paginator = await query.paginate(safePage, safeLimit)

    return {
      meta: paginator.serialize().meta,
      data: paginator.all().map((row) => serializeComplaintAdmin(row)),
    }
  }

  /**
   * Actualiza el estatus de una queja dentro del scope del administrador.
   */
  async updateStatus(
    complaintId: number,
    input: UpdateComplaintStatusInput,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintAdminResult> {
    const complaint = await this.findInScopeOrFail(complaintId, allowedBusinessUnitIds)
    complaint.complaintStatus = input.status
    await complaint.save()
    return serializeComplaintAdmin(complaint)
  }

  private async findInScopeOrFail(
    complaintId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<Complaint> {
    if (allowedBusinessUnitIds.length === 0) {
      throw new ComplaintServiceError(
        'La queja no existe o está fuera del alcance del usuario autenticado',
        COMPLAINT_ERROR_CODES.STATUS_NOT_FOUND,
        404,
        'queja-no-encontrada'
      )
    }

    const complaint = await Complaint.query()
      .where('complaint_id', complaintId)
      .whereNull('complaint_deleted_at')
      .whereIn('business_unit_id', allowedBusinessUnitIds)
      .first()

    if (!complaint) {
      throw new ComplaintServiceError(
        'La queja no existe o está fuera del alcance del usuario autenticado',
        COMPLAINT_ERROR_CODES.STATUS_NOT_FOUND,
        404,
        'queja-no-encontrada'
      )
    }

    return complaint
  }

  private generatePassphrase(): string {
    let value = ''
    for (let index = 0; index < COMPLAINT_PASSPHRASE_LENGTH; index++) {
      const randomIndex = Math.floor(Math.random() * PASSPHRASE_ALPHABET.length)
      value += PASSPHRASE_ALPHABET.charAt(randomIndex)
    }
    return value
  }

  private async generateUniqueFolio(): Promise<string> {
    const year = DateTime.utc().year

    for (let attempt = 0; attempt < 8; attempt++) {
      const suffix = String(Math.floor(100000 + Math.random() * 900000))
      const folio = `${COMPLAINT_FOLIO_PREFIX}-${year}-${suffix}`
      const existing = await Complaint.query().where('complaint_folio', folio).first()
      if (!existing) {
        return folio
      }
    }

    throw new ComplaintServiceError(
      'No se pudo generar un folio único para la queja',
      COMPLAINT_ERROR_CODES.FOLIO_GENERATION_FAILED,
      500,
      'AUTH.COMPLAINT.FOLIO_GENERATION_FAILED'
    )
  }
}
