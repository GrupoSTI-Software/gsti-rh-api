import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Department from '#models/department'
import type Employee from '#models/employee'
import type OnboardingSeededRecord from '#models/onboarding_seeded_record'
import type OnboardingUserState from '#models/onboarding_user_state'
import type Position from '#models/position'
import type Shift from '#models/shift'
import type User from '#models/user'

/** Insumos de la creación del paquete demo (todo bajo la transacción del seed). */
export interface CreateSeededPackageInput {
  onboardingUserStateId: number
  /** Admin que siembra: queda como responsable del empleado demo para poder verlo. */
  adminUserId: number
  businessUnitId: number
  businessUnitSlug: string
  demoEmail: string
  demoPassword: string
}

/** Entidades vivas del paquete demo, para componer la respuesta. */
export interface SeededPackageEntities {
  department: Department
  position: Position
  employee: Employee
  shift: Shift
  user: User
  attendanceDates: string[]
  attendanceCheckIn: string
  attendanceCheckOut: string
  vacationDates: string[]
}

/**
 * Contrato del repositorio de la siembra demo (USRH1785438246847).
 * Aísla la creación/lectura de entidades y su tracking de la lógica del service.
 */
export interface DemoSeedRepository {
  /**
   * Estado de onboarding del usuario bloqueado con FOR UPDATE dentro de la
   * transacción (serializa doble sesión / doble clic).
   */
  lockUserState(userId: number, trx: TransactionClientContract): Promise<OnboardingUserState>

  /** Filas de tracking de una siembra. */
  listSeededRecords(
    onboardingUserStateId: number,
    trx?: TransactionClientContract
  ): Promise<OnboardingSeededRecord[]>

  /** Correo demo único entre usuarios no borrados (unicidad de aplicación). */
  buildUniqueDemoEmail(
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<string>

  /**
   * Crea el paquete completo (departamento, puesto, vínculo, persona, empleado,
   * usuario, turno, asignación, checadas y vacaciones de ejemplo) y registra
   * cada entidad en `onboarding_seeded_records` con snapshot de BU.
   */
  createSeededPackage(
    input: CreateSeededPackageInput,
    trx: TransactionClientContract
  ): Promise<SeededPackageEntities>

  /** Reconstruye el paquete a partir del tracking (caso idempotente). */
  loadSeededPackage(
    records: OnboardingSeededRecord[],
    trx?: TransactionClientContract
  ): Promise<SeededPackageEntities>

  /** Usuario demo de la siembra (para regenerar credencial). */
  findSeededUser(
    records: OnboardingSeededRecord[],
    trx?: TransactionClientContract
  ): Promise<User | null>
}
