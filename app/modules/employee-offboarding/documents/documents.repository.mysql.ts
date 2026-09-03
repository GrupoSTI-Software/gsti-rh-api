import { DateTime } from 'luxon'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BusinessUnit from '#models/business_unit'
import Employee from '#models/employee'
import EmployeeOffboarding from '#models/employee_offboarding'
import EmployeeOffboardingDocument from '#models/employee_offboarding_document'
import User from '#models/user'
import { TenantContext } from '#utils/tenant_context'
import type {
  DocumentsRepository,
  EmployeeOffboardingDocumentCreateData,
} from './documents.repository.js'

/**
 * Adaptador MySQL de los documentos del expediente (USRH1787433503686).
 * Único punto del slice que toca Lucid. El filtro de empresa va EXPLÍCITO
 * sobre `employee_offboardings` (la tabla de documentos no tiene esa
 * columna); el segundo salto filtra SIEMPRE por el expediente ya resuelto
 * además de por la PK — un `find(id)` con comparación posterior dejaría una
 * fila de otro tenant hidratada en memoria.
 */
export default class DocumentsRepositoryMysql implements DocumentsRepository {
  async findOffboardingInScope(
    employeeOffboardingId: number,
    businessUnitIds: number[]
  ): Promise<EmployeeOffboarding | null> {
    if (businessUnitIds.length === 0) return null
    return await EmployeeOffboarding.query()
      .where('employee_offboarding_id', employeeOffboardingId)
      .whereIn('business_unit_id', businessUnitIds)
      .whereNull('employee_offboarding_deleted_at')
      .first()
  }

  async findEmployeeForLetter(employeeId: number): Promise<Employee | null> {
    // `runUnscoped`: el alcance ya quedó verificado contra el BU snapshoteado
    // del expediente; el mixin de `Employee` ocultaría al prestado de otra
    // empresa y `withTrashed` conserva al dado de baja (caso normal aquí).
    return await TenantContext.runUnscoped(
      async () =>
        await Employee.query()
          .withTrashed()
          .where('employee_id', employeeId)
          .preload('person')
          .preload('position')
          .preload('department')
          .first(),
      'colaborador del expediente ya autorizado por su BU snapshoteado (constancia)'
    )
  }

  async findBusinessUnit(businessUnitId: number): Promise<BusinessUnit | null> {
    return await BusinessUnit.query().where('business_unit_id', businessUnitId).first()
  }

  async countByOffboardingAndType(
    employeeOffboardingId: number,
    documentType: string,
    trx?: TransactionClientContract
  ): Promise<number> {
    // `withTrashed` a propósito: el consecutivo del folio no retrocede tras
    // un borrado lógico — un hueco en la secuencia delata una emisión retirada
    const row = await EmployeeOffboardingDocument.query({ client: trx })
      .withTrashed()
      .where('employee_offboarding_id', employeeOffboardingId)
      .where('employee_offboarding_document_type', documentType)
      .count('* as total')
      .first()
    return Number(row?.$extras.total ?? 0)
  }

  async lockOffboardingRow(
    employeeOffboardingId: number,
    trx: TransactionClientContract
  ): Promise<EmployeeOffboarding | null> {
    return await EmployeeOffboarding.query({ client: trx })
      .where('employee_offboarding_id', employeeOffboardingId)
      .whereNull('employee_offboarding_deleted_at')
      .forUpdate()
      .first()
  }

  async markCurrentAsSuperseded(
    employeeOffboardingId: number,
    documentType: string,
    trx: TransactionClientContract
  ): Promise<number | null> {
    const currents = await EmployeeOffboardingDocument.query({ client: trx })
      .where('employee_offboarding_id', employeeOffboardingId)
      .where('employee_offboarding_document_type', documentType)
      .where('employee_offboarding_document_is_current', true)
      .whereNull('employee_offboarding_document_deleted_at')
    for (const current of currents) {
      current.useTransaction(trx)
      current.employeeOffboardingDocumentIsCurrent = false
      await current.save()
    }
    if (currents.length === 0) return null
    return Math.max(...currents.map((row) => row.employeeOffboardingDocumentId))
  }

  async createDocument(
    data: EmployeeOffboardingDocumentCreateData,
    trx: TransactionClientContract
  ): Promise<EmployeeOffboardingDocument> {
    // Las fechas civiles llegan `YYYY-MM-DD`; el modelo las declara `DateTime` (@column.date)
    return await EmployeeOffboardingDocument.create(
      {
        ...data,
        employeeOffboardingDocumentHireDate: DateTime.fromISO(
          data.employeeOffboardingDocumentHireDate
        ),
        employeeOffboardingDocumentReferenceDate: DateTime.fromISO(
          data.employeeOffboardingDocumentReferenceDate
        ),
        employeeOffboardingDocumentIsCurrent: true,
      },
      { client: trx }
    )
  }

  async listByOffboarding(
    employeeOffboardingId: number,
    filters: { includeSuperseded: boolean; documentType?: string }
  ): Promise<EmployeeOffboardingDocument[]> {
    return await EmployeeOffboardingDocument.query()
      .where('employee_offboarding_id', employeeOffboardingId)
      .whereNull('employee_offboarding_document_deleted_at')
      .if(!filters.includeSuperseded, (query) => {
        query.where('employee_offboarding_document_is_current', true)
      })
      .if(!!filters.documentType, (query) => {
        query.where('employee_offboarding_document_type', filters.documentType!)
      })
      .orderBy('employee_offboarding_document_id', 'desc')
  }

  async findDocumentInOffboarding(
    employeeOffboardingId: number,
    employeeOffboardingDocumentId: number
  ): Promise<EmployeeOffboardingDocument | null> {
    return await EmployeeOffboardingDocument.query()
      .where('employee_offboarding_document_id', employeeOffboardingDocumentId)
      .where('employee_offboarding_id', employeeOffboardingId)
      .whereNull('employee_offboarding_document_deleted_at')
      .first()
  }

  async findUsersByIds(userIds: number[]): Promise<User[]> {
    if (userIds.length === 0) return []
    // `withTrashed`: el emisor no pierde el nombre si se elimina después.
    return await User.query().withTrashed().whereIn('user_id', userIds).preload('person')
  }
}
