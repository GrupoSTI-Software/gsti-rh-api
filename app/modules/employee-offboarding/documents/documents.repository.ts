import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
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
  /** Id de la emisión que esta reemplaza; `null` en la primera (USRH1787433503692). */
  employeeOffboardingDocumentSupersededDocumentId: number | null
}

/**
 * Puerto de acceso a datos de los documentos del expediente
 * (USRH1787433503686). El adaptador MySQL es el ÚNICO que toca Lucid. El
 * aislamiento va en dos saltos: expediente por su `business_unit_id`
 * snapshoteado EXPLÍCITO, documento acotado por el expediente. Puerto
 * propio a propósito: nada se importa del repositorio del slice `offboardings/`.
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

  /**
   * Contador del folio consecutivo (USRH1787433503692): cuenta INCLUIDAS las
   * filas borradas lógicamente — un folio consumido nunca se recicla y el
   * consecutivo no retrocede tras un retiro. Bajo `trx` corre dentro del
   * lock del expediente.
   */
  countByOffboardingAndType(
    employeeOffboardingId: number,
    documentType: string,
    trx?: TransactionClientContract
  ): Promise<number>

  /**
   * Bloquea con `forUpdate` la fila de `employee_offboardings` YA RESUELTA
   * en alcance (nunca un id crudo del cliente): serializa el folio y el
   * traslado de vigencia entre emisiones concurrentes.
   */
  lockOffboardingRow(
    employeeOffboardingId: number,
    trx: TransactionClientContract
  ): Promise<EmployeeOffboarding | null>

  /**
   * Marca como no vigente la emisión vigente anterior (nunca la borra,
   * regla 2) y devuelve su id para poblar `supersededDocumentId`; `null` si
   * era la primera. Corre bajo el mismo lock del expediente.
   *
   * El invariante "una sola vigente por (expediente, tipo)" lo garantiza el
   * `forUpdate`, no un índice: MySQL no soporta únicos parciales y un
   * UNIQUE(expediente, tipo, is_current) impediría el historial apilado.
   */
  markCurrentAsSuperseded(
    employeeOffboardingId: number,
    documentType: string,
    trx: TransactionClientContract
  ): Promise<number | null>

  /** Inserta la emisión ya sellada, dentro de la transacción del lock. */
  createDocument(
    data: EmployeeOffboardingDocumentCreateData,
    trx: TransactionClientContract
  ): Promise<EmployeeOffboardingDocument>

  /**
   * Documentos vivos del expediente, id descendente. Sin `includeSuperseded`
   * solo las vigentes (regla 5); `documentType` acota por tipo.
   */
  listByOffboarding(
    employeeOffboardingId: number,
    filters: { includeSuperseded: boolean; documentType?: string }
  ): Promise<EmployeeOffboardingDocument[]>

  /** Documento vivo acotado por el expediente; `null` = 404 uniforme. */
  findDocumentInOffboarding(
    employeeOffboardingId: number,
    employeeOffboardingDocumentId: number
  ): Promise<EmployeeOffboardingDocument | null>

  /** Usuarios con su persona, para el nombre visible del emisor. */
  findUsersByIds(userIds: number[]): Promise<User[]>
}
