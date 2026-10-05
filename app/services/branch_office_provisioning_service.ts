import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BranchOffice from '#models/branch_office'
import { resolveUniqueBranchOfficeSlug } from '#helpers/branch_office_slug'
import { DEFAULT_BRANCH_OFFICE_NAME, DEFAULT_BRANCH_OFFICE_SLUG } from '#constants/branch_office'

/**
 * Sucursal default de una empresa: la que garantiza que ningún empleado se
 * quede sin sucursal.
 *
 * Un solo método, con dos trabajos:
 *  - siembra, en el alta de tenant y en el alta de empresa adicional;
 *  - red de seguridad, para las empresas que existían antes de esta columna.
 *
 * No es un backfill: no recorre la base ni toca empleados. Crea la default de
 * UNA empresa, en el momento en que alguien la necesita.
 */
export default class BranchOfficeProvisioningService {
  /**
   * Devuelve la sucursal default viva de la empresa, creándola si no la hay.
   *
   * Si la empresa tiene exactamente una sucursal y ninguna es default, promueve
   * esa en vez de estrenar "Oficina principal" al lado: una empresa que ya
   * opera desde su única sede no necesita una sucursal más, necesita que esa
   * sea la default.
   */
  static async ensureDefault(
    businessUnitId: number,
    trx?: TransactionClientContract
  ): Promise<BranchOffice> {
    const client = trx ? { client: trx } : {}

    const current = await BranchOffice.query(client)
      .where('businessUnitId', businessUnitId)
      .where('branchOfficeIsDefault', 1)
      .first()
    if (current) {
      return current
    }

    const existing = await BranchOffice.query(client).where('businessUnitId', businessUnitId)
    if (existing.length === 1) {
      const adopted = existing[0]
      adopted.branchOfficeIsDefault = 1
      if (trx) {
        adopted.useTransaction(trx)
      }
      await adopted.save()
      return adopted
    }

    const slug = await resolveUniqueBranchOfficeSlug(
      businessUnitId,
      DEFAULT_BRANCH_OFFICE_SLUG,
      undefined,
      trx
    )

    return await BranchOffice.create(
      {
        businessUnitId,
        branchOfficeName: DEFAULT_BRANCH_OFFICE_NAME,
        branchOfficeSlug: slug,
        branchOfficeLocationAddress: null,
        // El alta no conoce el domicilio de la empresa: se captura la primera
        // vez que alguien edita la sucursal.
        branchOfficeStreet: null,
        branchOfficeSettlement: null,
        branchOfficeZipcode: null,
        branchOfficeCity: null,
        branchOfficeState: null,
        branchOfficeIdealTemplateCount: null,
        branchOfficeMinActiveEmployeesPerShift: null,
        empresaContratanteId: null,
        branchOfficeIsDefault: 1,
      },
      client
    )
  }
}
