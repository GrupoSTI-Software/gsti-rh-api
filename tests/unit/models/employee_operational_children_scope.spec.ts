import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import EmployeeBranchOffice from '#models/employee_branch_office'
import EmployeeTemporaryAssignment from '#models/employee_temporary_assignment'
import VacationDeduction from '#models/vacation_deduction'
import EmployeeProceedingFileType from '#models/employee_proceeding_file_type'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import AccessPointEmployee from '#models/access_point_employee'
import CareerPathCandidate from '#models/career_path_candidate'

/**
 * USRH1784259058533 — hijos operativos directos del empleado: marca propia
 * + mixin sobre 6 tablas del patrón estándar (1 salto, ancla = empleado) y
 * compose sobre columna existente en career_path_candidate.
 */

const MODELS_DIR = join(process.cwd(), 'app/models')

const STANDARD_TARGETS = [
  {
    fileName: 'employee_branch_office.ts',
    Model: EmployeeBranchOffice,
  },
  {
    fileName: 'employee_temporary_assignment.ts',
    Model: EmployeeTemporaryAssignment,
  },
  {
    fileName: 'vacation_deduction.ts',
    Model: VacationDeduction,
  },
  {
    fileName: 'employee_proceeding_file_type.ts',
    Model: EmployeeProceedingFileType,
  },
  {
    fileName: 'user_responsible_employee.ts',
    Model: UserResponsibleEmployee,
  },
  {
    fileName: 'access_point_employee.ts',
    Model: AccessPointEmployee,
  },
] as const

test.group('Hijos operativos del empleado — patrón estándar (6 tablas)', () => {
  for (const { fileName, Model } of STANDARD_TARGETS) {
    test(`${fileName} importa mixin, columna y hook desde el empleado`, ({ assert }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')

      assert.include(
        content,
        "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
      )
      assert.include(content, 'withBusinessUnitScope()')
      assertModelHasColumns(assert, Model, ['businessUnitId'])
      assert.include(content, '@beforeCreate()')
      assert.include(content, 'resolveParentBusinessUnitId(')
      // Ancla siempre en el empleado, nunca en el otro extremo del pivote/relación.
      assert.match(
        content,
        /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*Employee\.query\(\)\.where\('employeeId', instance\.employeeId\)/
      )
    })

    test(`${fileName} el guard idempotente no sobrescribe una marca ya presente`, ({ assert }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')
      assert.match(content, /if \(instance\.businessUnitId\) return/)
    })
  }

  test('employee_temporary_assignment ancla en el empleado, no en las sucursales origen/destino', ({
    assert,
  }) => {
    const content = readFileSync(
      join(MODELS_DIR, 'employee_temporary_assignment.ts'),
      'utf-8'
    )
    // El hook no debe resolver la marca vía sourceBranch/targetBranch.
    assert.notMatch(content, /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*BranchOffice\.query/)
  })

  test('user_responsible_employee ancla en el empleado, no en el usuario responsable', ({
    assert,
  }) => {
    const content = readFileSync(join(MODELS_DIR, 'user_responsible_employee.ts'), 'utf-8')
    assert.notMatch(content, /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*User\.query/)
  })

  test('access_point_employee ancla en el empleado, no en el punto de acceso', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, 'access_point_employee.ts'), 'utf-8')
    assert.notMatch(content, /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*AccessPoint\.query/)
  })

  test('employee_proceeding_file_type scopea la tabla por-empleado, no el catálogo', ({
    assert,
  }) => {
    const content = readFileSync(join(MODELS_DIR, 'employee_proceeding_file_type.ts'), 'utf-8')
    // El catálogo (ProceedingFileType) se importa como relación pero no debe
    // componer el mixin ni resolverse desde él.
    assert.notMatch(
      content,
      /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*ProceedingFileType\.query/
    )
  })
})

test.group('career_path_candidate — compose sobre columna ya poblada (sin migración)', () => {
  test('compone withBusinessUnitScope() y un hook defensivo', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, 'career_path_candidate.ts'), 'utf-8')

    assert.include(
      content,
      "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
    )
    assert.include(content, 'withBusinessUnitScope()')
    assertModelHasColumns(assert, CareerPathCandidate, ['businessUnitId'])
    assert.include(content, '@beforeCreate()')
    assert.match(content, /if \(instance\.businessUnitId\) return/)
  })

  test('el guard resuelve desde el empleado solo como defensa, no como flujo esperado', ({
    assert,
  }) => {
    const content = readFileSync(join(MODELS_DIR, 'career_path_candidate.ts'), 'utf-8')
    assert.include(content, 'resolveParentBusinessUnitId(')
    assert.match(
      content,
      /resolveParentBusinessUnitId\(\s*\(\)\s*=>\s*Employee\.query\(\)\.where\('employeeId', instance\.employeeId\)/
    )
  })
})
