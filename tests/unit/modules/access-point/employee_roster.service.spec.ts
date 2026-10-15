import { test } from '@japa/runner'
import type AccessPointEmployee from '#models/access_point_employee'
import EmployeeRosterService from '#modules/access-point/employee-sync/employee_roster.service'
import type {
  EmployeeRosterRepository,
  ForeignEmployeeRow,
} from '#modules/access-point/employee-sync/employee_roster.repository'

/** Repositorio falso que anota que ids le piden. */
function fakeRepository(rows: ForeignEmployeeRow[]) {
  const asked: { units: number[][]; employees: number[][] } = { units: [], employees: [] }
  const repository: EmployeeRosterRepository = {
    async businessUnitNames(ids) {
      asked.units.push(ids)
      return new Map(ids.map((id) => [id, `Empresa ${id}`]))
    },
    async foreignEmployees(ids) {
      asked.employees.push(ids)
      return rows.filter((row) => ids.includes(row.employeeId))
    },
  }
  return { repository, asked }
}

const pivot = (employeeId: number, businessUnitId: number) =>
  ({ employeeId, businessUnitId }) as unknown as AccessPointEmployee

/**
 * Identificacion del personal ajeno en el padron del checador (VLRH-P0065, 6
 * y D6): solo se leen los empleados fuera del alcance de quien mira.
 */
test.group('EmployeeRosterService', () => {
  test('nombres de empresa sin duplicados y en una sola lectura', async ({ assert }) => {
    const { repository, asked } = fakeRepository([])
    const names = await new EmployeeRosterService(repository).businessUnitNames([3, 1, 3])
    assert.deepEqual(asked.units, [[3, 1]])
    assert.equal(names.get(1), 'Empresa 1')
  })

  test('sin ids no consulta', async ({ assert }) => {
    const { repository, asked } = fakeRepository([])
    const names = await new EmployeeRosterService(repository).businessUnitNames([])
    assert.equal(names.size, 0)
    assert.lengthOf(asked.units, 0)
  })

  test('solo pide la identidad de los ajenos y arma nombre completo y foto publica', async ({
    assert,
  }) => {
    const { repository, asked } = fakeRepository([
      {
        employeeId: 20,
        firstName: 'Ana',
        lastName: 'Perez',
        secondLastName: ' ',
        photo: 'https://cdn.example.test/ana.jpg',
      },
      { employeeId: 21, firstName: 'Luis', lastName: null, secondLastName: 'Diaz', photo: 'k/x.jpg' },
    ])
    const roster = await new EmployeeRosterService(repository).identitiesFor(
      [pivot(10, 1), pivot(20, 2), pivot(21, 2)],
      [1]
    )
    assert.deepEqual(asked.employees, [[20, 21]])
    assert.deepEqual(roster.identities.get(20), {
      fullName: 'Ana Perez',
      photoUrl: 'https://cdn.example.test/ana.jpg',
    })
    assert.deepEqual(roster.identities.get(21), { fullName: 'Luis Diaz', photoUrl: null })
    assert.isFalse(roster.identities.has(10))
    assert.equal(roster.businessUnitNames.get(2), 'Empresa 2')
  })

  test('sin ajenos no lee empleados', async ({ assert }) => {
    const { repository, asked } = fakeRepository([])
    const roster = await new EmployeeRosterService(repository).identitiesFor([pivot(10, 1)], [1])
    assert.lengthOf(asked.employees, 0)
    assert.equal(roster.identities.size, 0)
  })
})
