import type BusinessUnit from '#models/business_unit'
import type Employee from '#models/employee'
import type EmployeeOffboarding from '#models/employee_offboarding'
import type EmployeeOffboardingDocument from '#models/employee_offboarding_document'
import type User from '#models/user'

/** Datos para insertar la emisión (el servicio ya renderizó, subió y selló). */
export interface EmployeeOffboardingDocumentCreateData {
  employeeOffboardingId: number
  employeeOffboardingDocumentType: string
  employeeOffboardingDocumentFolio: string
  employeeOffboardingDocumentFile: string
  employeeOffboardingDocumentFileName: string
  employeeOffboardingDocumentSizeBytes: number
  employeeOffboardingDocumentEmployeeName: string
  employeeOffboardingDocumentPositionName: string | null
  employeeOffboardingDocumentDepartmentName: string | null
  employeeOffboardingDocumentLegalName: string
  employeeOffboardingDocumentHireDate: string
  employeeOffboardingDocumentReferenceDate: string
  employeeOffboardingDocumentReferenceDateSource: string
  employeeOffboardingDocumentSeniorityDays: number
  employeeOffboardingDocumentContentHash: string
  employeeOffboardingDocumentGeneratedByUserId: number | null
}

/**
 * Puerto de acceso a datos de los documentos del expediente
 * (USRH1787433503686). El adaptador MySQL es el ÚNICO que toca Lucid. El
 * aislamiento va en dos saltos: expediente por su `business_unit_id`
 * snapshoteado EXPLÍCITO, documento acotado por el expediente. Puerto
 * propio a propósito: nada se importa de `offboardings.repository*`.
 *
 * Huecos reservados a la hermana H2 (re-emisión): `lockOffboardingRow` y
 * `markCurrentAsSuperseded`. No se declaran hasta que exista quien los use.
 */
export interface DocumentsRepository {
  /** Expediente vivo dentro del alcance; `null` = 404 uniforme. */
  findOffboardingInScope(
    employeeOffboardingId: number,
    businessUnitIds: number[]
  ): Promise<EmployeeOffboarding | null>

  /**
   * Colaborador del expediente con `withTrashed()` (la baja ejecutada es el
   * caso normal) y sus relaciones persona/puesto/departamento precargadas.
   * Sin alcance: ya quedó verificado contra el BU snapshoteado del expediente.
   */
  findEmployeeForLetter(employeeId: number): Promise<Employee | null>

  /** Empresa del expediente (razón social del patrón), por el BU snapshoteado. */
  findBusinessUnit(businessUnitId: number): Promise<BusinessUnit | null>

  /** Documentos vivos del expediente de un tipo (frontera de una emisión en H1a). */
  countByOffboardingAndType(employeeOffboardingId: number, documentType: string): Promise<number>

  /** Inserta la emisión ya sellada. */
  createDocument(
    data: EmployeeOffboardingDocumentCreateData
  ): Promise<EmployeeOffboardingDocument>

  /** Documentos vivos del expediente, id descendente. */
  listByOffboarding(employeeOffboardingId: number): Promise<EmployeeOffboardingDocument[]>

  /** Documento vivo acotado por el expediente; `null` = 404 uniforme. */
  findDocumentInOffboarding(
    employeeOffboardingId: number,
    employeeOffboardingDocumentId: number
  ): Promise<EmployeeOffboardingDocument | null>

  /** Usuarios con su persona, para el nombre visible del emisor. */
  findUsersByIds(userIds: number[]): Promise<User[]>
}
