import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import Complaint from '#models/complaint'
import Employee from '#models/employee'
import User from '#models/user'
import ComplaintAttachmentService from '#services/complaint_attachment_service'
import ComplaintStatusHistoryService from '#services/complaint_status_history_service'
import { COMPLAINT_ERROR_CODES } from '#constants/complaint_error_codes'
import {
  COMPLAINT_FOLIO_PREFIX,
  COMPLAINT_INITIAL_STATUS,
  COMPLAINT_PASSPHRASE_LENGTH,
} from '#constants/complaint'
import { ComplaintServiceError } from '#exceptions/complaint_service_error'
import type {
  ComplaintAdminResult,
  ComplaintBoardListItem,
  ComplaintCreateResult,
  ComplaintDetailResult,
  ComplaintListFilters,
  ComplaintListResult,
  ComplaintStatusHistoryRow,
  ComplaintStatusResult,
  ConsultComplaintStatusInput,
  CreateComplaintInput,
  PatchComplaintStatusInput,
} from '../interfaces/complaint_interface.js'

const PASSPHRASE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Serialización admin detalle: nunca expone employeeId ni relaciones de identidad. */
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

function serializeComplaintBoardItem(complaint: Complaint): ComplaintBoardListItem {
  return {
    complaintId: complaint.complaintId,
    folio: complaint.complaintFolio,
    category: complaint.complaintCategory,
    status: complaint.complaintStatus,
    createdAt: complaint.complaintCreatedAt.toISO()!,
    updatedAt: complaint.complaintUpdatedAt.toISO()!,
  }
}

function serializeComplaintDetail(
  complaint: Complaint,
  history: ComplaintStatusHistoryRow[],
  attachments: ComplaintDetailResult['attachments']
): ComplaintDetailResult {
  return {
    complaintId: complaint.complaintId,
    folio: complaint.complaintFolio,
    category: complaint.complaintCategory,
    description: complaint.complaintDescription,
    status: complaint.complaintStatus,
    createdAt: complaint.complaintCreatedAt.toISO()!,
    updatedAt: complaint.complaintUpdatedAt.toISO()!,
    history,
    attachments,
  }
}

/**
 * Servicio del buzón de quejas confidencial (NOM-035 8.1.b).
 */
export default class ComplaintService {
  private readonly historyService = new ComplaintStatusHistoryService()
  private readonly attachmentService = new ComplaintAttachmentService()

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
        'AUTH.COMPLAINT.PERSON_NOT_FOUND',
        undefined,
        'complaint_person_not_found'
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
        'AUTH.COMPLAINT.EMPLOYEE_NOT_FOUND',
        undefined,
        'complaint_employee_not_found'
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
        'caso-no-encontrado',
        undefined,
        'complaint_status_not_found'
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
   * Listado paginado para administradores. Filtra por estatus, categoría y scope.
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

    if (filters.category) {
      query.where('complaint_category', filters.category)
    }

    query.orderBy('complaint_created_at', 'desc')

    const paginator = await query.paginate(safePage, safeLimit)

    return {
      meta: paginator.serialize().meta,
      data: paginator.all().map((row) => serializeComplaintBoardItem(row)),
    }
  }

  /**
   * Detalle de una queja con bitácora y adjuntos, sin identidad del denunciante.
   */
  async getDetailById(
    complaintId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintDetailResult> {
    const complaint = await this.findInScopeOrFail(complaintId, allowedBusinessUnitIds)
    const history = await this.historyService.listByComplaintId(complaint.complaintId)
    const attachments = await this.attachmentService.listByComplaintId(
      complaint.complaintId,
      allowedBusinessUnitIds
    )

    return serializeComplaintDetail(complaint, history, attachments)
  }

  /**
   * Bitácora cronológica inmutable de una queja.
   */
  async listHistoryByComplaintId(
    complaintId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintStatusHistoryRow[]> {
    await this.findInScopeOrFail(complaintId, allowedBusinessUnitIds)
    return this.historyService.listByComplaintId(complaintId)
  }

  /**
   * Transición de estatus con nota obligatoria y registro en bitácora inmutable.
   */
  async transitionStatus(
    complaintId: number,
    input: PatchComplaintStatusInput,
    actorUserId: number,
    allowedBusinessUnitIds: number[] = []
  ): Promise<ComplaintAdminResult> {
    const note = input.note?.trim()
    if (!note) {
      throw new ComplaintServiceError(
        'La nota es obligatoria para registrar la transición de estatus',
        COMPLAINT_ERROR_CODES.NOTE_REQUIRED,
        422,
        'nota-requerida',
        undefined,
        'complaint_note_required'
      )
    }

    const complaint = await this.findInScopeOrFail(complaintId, allowedBusinessUnitIds)
    const fromStatus = complaint.complaintStatus
    const toStatus = input.toStatus

    if (fromStatus === toStatus) {
      throw new ComplaintServiceError(
        'El estatus destino debe ser diferente al estatus actual',
        COMPLAINT_ERROR_CODES.VAL_INPUT,
        422,
        'estatus-sin-cambio',
        undefined,
        'complaint_status_unchanged'
      )
    }

    await db.transaction(async (trx) => {
      complaint.useTransaction(trx)
      complaint.complaintStatus = toStatus
      await complaint.save()

      await this.historyService.appendEntry(
        {
          complaintId: complaint.complaintId,
          fromStatus,
          toStatus,
          note,
          actorUserId,
        },
        trx
      )
    })

    await complaint.refresh()
    return serializeComplaintAdmin(complaint)
  }

  private async findInScopeOrFail(
    complaintId: number,
    allowedBusinessUnitIds: number[]
  ): Promise<Complaint> {
    if (allowedBusinessUnitIds.length === 0) {
      throw this.complaintNotFoundError()
    }

    const complaint = await Complaint.query()
      .where('complaint_id', complaintId)
      .whereNull('complaint_deleted_at')
      .whereIn('business_unit_id', allowedBusinessUnitIds)
      .first()

    if (!complaint) {
      throw this.complaintNotFoundError()
    }

    return complaint
  }

  private complaintNotFoundError() {
    return new ComplaintServiceError(
      'La queja no existe o está fuera del alcance del usuario autenticado',
      COMPLAINT_ERROR_CODES.STATUS_NOT_FOUND,
      404,
      'queja-no-encontrada',
      undefined,
      'complaint_not_found'
    )
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
      'AUTH.COMPLAINT.FOLIO_GENERATION_FAILED',
      undefined,
      'complaint_folio_generation_failed'
    )
  }
}
