import type AccessPointEmployee from '#models/access_point_employee'
import { resolvePublicAssetUrl } from '#helpers/public_asset_url'
import type { ForeignEmployeeIdentity } from './dto/employee_sync.dto.js'
import EmployeeRosterRepositoryMysql from './employee_roster.repository.mysql.js'
import type { EmployeeRosterRepository } from './employee_roster.repository.js'

/** Lo que el padron necesita ademas de los pivotes. */
export interface RosterContext {
  /** Nombre de la empresa de cada pivote. */
  businessUnitNames: Map<number, string>
  /** Identificacion del personal fuera del alcance de quien mira, por empleado. */
  identities: Map<number, ForeignEmployeeIdentity>
}

/**
 * Padron de un checador compartido (VLRH-P0065, 6 y D6): nombres de empresa y
 * la proyeccion de identificacion del personal ajeno. Solo se leen los
 * empleados de pivotes fuera del alcance de quien mira.
 */
export default class EmployeeRosterService {
  constructor(
    private readonly repository: EmployeeRosterRepository = new EmployeeRosterRepositoryMysql()
  ) {}

  /** Nombre de cada empresa por id, sin duplicados y en una sola lectura. */
  async businessUnitNames(businessUnitIds: number[]): Promise<Map<number, string>> {
    const ids = [...new Set(businessUnitIds)]
    if (ids.length === 0) return new Map()
    return this.repository.businessUnitNames(ids)
  }

  /** Nombres de empresa e identidades ajenas para pintar los pivotes dados. */
  async identitiesFor(
    pivots: AccessPointEmployee[],
    viewerBusinessUnitIds: number[]
  ): Promise<RosterContext> {
    const businessUnitNames = await this.businessUnitNames(
      pivots.map((pivot) => pivot.businessUnitId)
    )
    const foreignIds = pivots
      .filter((pivot) => !viewerBusinessUnitIds.includes(pivot.businessUnitId))
      .map((pivot) => pivot.employeeId)
    const rows = foreignIds.length === 0 ? [] : await this.repository.foreignEmployees(foreignIds)
    const identities = new Map<number, ForeignEmployeeIdentity>(
      rows.map((row) => [
        row.employeeId,
        {
          fullName: [row.firstName, row.lastName, row.secondLastName]
            .filter((part): part is string => Boolean(part && part.trim()))
            .join(' '),
          /**
           * Nunca la llave cruda del bucket: el endpoint autenticado de la foto
           * (`/employees/:id/photo`) no sirve al empleado de otra empresa, asi
           * que solo sale una URL que de verdad sea publica; una foto privada
           * sale `null` y el Backoffice pinta la inicial.
           */
          photoUrl: resolvePublicAssetUrl(row.photo),
        },
      ])
    )
    return { businessUnitNames, identities }
  }
}
