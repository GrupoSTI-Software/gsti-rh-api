import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BranchOffice from '#models/branch_office'

/**
 * Slug de sucursal: única representación de la regla.
 *
 * Vive fuera de `BranchOfficeService` porque ese servicio arrastra la cadena
 * de asignaciones temporales, que a su vez importa el modelo Employee. El hook
 * del empleado necesita sembrar sucursales, y con el slug en el servicio la
 * importación se cerraba en ciclo.
 */

/** Slug URL a partir del nombre: sin acentos, minúsculas, guiones. */
export function slugifyBranchOffice(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || `sucursal-${Date.now()}`
}

/** Resuelve un slug libre dentro de la unidad de negocio (excluye eliminados lógicos). */
export async function resolveUniqueBranchOfficeSlug(
  businessUnitId: number,
  baseSlug: string,
  excludeBranchOfficeId?: number,
  trx?: TransactionClientContract
): Promise<string> {
  let slug = baseSlug
  let suffix = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const query = BranchOffice.query(trx ? { client: trx } : {})
      .where('businessUnitId', businessUnitId)
      .where('branchOfficeSlug', slug)
    if (excludeBranchOfficeId) {
      query.where('branchOfficeId', '!=', excludeBranchOfficeId)
    }
    const exists = await query.first()
    if (!exists) {
      return slug
    }
    suffix += 1
    slug = `${baseSlug}-${suffix}`
  }
}
