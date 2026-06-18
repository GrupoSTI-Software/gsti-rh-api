import factory from '@adonisjs/lucid/factories'
import BranchOffice from '#models/branch_office'

/** Slug fijo para la sucursal demo principal (idempotencia en el seeder). */
export const DEMO_BRANCH_OFFICE_SLUG = 'demo-sede-central'

/**
 * Sucursal para asignar empleados demo. Requiere `.merge({ businessUnitId })`.
 */
export const BranchOfficeFactory = factory
  .define(BranchOffice, ({ faker }) => {
    const name = `Sucursal demo ${faker.company.name()}`.slice(0, 80)
    const slugBase = faker.helpers.slugify(name.toLowerCase()).replace(/[^a-z0-9-]/g, '') || 'demo-branch'
    return {
      businessUnitId: 0,
      branchOfficeName: name,
      branchOfficeSlug: `${slugBase}-${faker.string.alphanumeric(4).toLowerCase()}`,
      branchOfficeLocationAddress: null,
      branchOfficeIdealTemplateCount: faker.number.int({ min: 5, max: 30 }),
      branchOfficeMinActiveEmployeesPerShift: faker.number.int({ min: 1, max: 5 }),
    }
  })
  .build()
