import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import EmployeeBiometric from '#models/employee_biometric'
import EmployeeBiometricFaceId from '#models/employee_biometric_face_id'
import EmployeeSalaryHistory from '#models/employee_salary_history'
import EmployeeCertification from '#models/employee_certification'

/**
 * USRH1783821206584 — las 4 tablas de PII sensible del empleado (biométricos,
 * historial salarial, certificaciones) reciben su propia marca de pertenencia
 * (`business_unit_id`) y componen `withBusinessUnitScope()`, igual que sus
 * ~30 hermanas ya blindadas por USRH1783372659486.
 */

const MODELS_DIR = join(process.cwd(), 'app/models')
const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')

const TARGETS = [
  { fileName: 'employee_biometric.ts', Model: EmployeeBiometric, migrationSlug: 'add_business_unit_id_to_employee_biometrics' },
  { fileName: 'employee_biometric_face_id.ts', Model: EmployeeBiometricFaceId, migrationSlug: 'add_business_unit_id_to_employee_biometric_face_ids' },
  { fileName: 'employee_salary_history.ts', Model: EmployeeSalaryHistory, migrationSlug: 'add_business_unit_id_to_employee_salary_history' },
  { fileName: 'employee_certification.ts', Model: EmployeeCertification, migrationSlug: 'add_business_unit_id_to_employee_certifications' },
] as const

test.group('PII sensible — modelos componen withBusinessUnitScope', () => {
  for (const { fileName, Model } of TARGETS) {
    test(`${fileName} importa y compone withBusinessUnitScope()`, ({ assert }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')

      assert.include(
        content,
        "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
      )
      assert.include(content, 'withBusinessUnitScope()')
    })

    test(`${fileName} declara la columna businessUnitId`, ({ assert }) => {
      assertModelHasColumns(assert, Model, ['businessUnitId'])
    })

    test(`${fileName} resuelve businessUnitId desde el empleado padre (no del cliente)`, ({
      assert,
    }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')

      assert.include(
        content,
        "import { resolveParentBusinessUnitId } from '#mixins/resolve_parent_business_unit_id'"
      )
      assert.include(content, '@beforeCreate()')
      assert.include(content, 'resolveParentBusinessUnitId(')
    })
  }
})

test.group('PII sensible — migraciones de aislamiento', () => {
  for (const { migrationSlug } of TARGETS) {
    test(`existe la migración ${migrationSlug} con backfill desde employees`, ({ assert }) => {
      const migrationFiles = readdirSync(MIGRATIONS_DIR)
      const match = migrationFiles.find((f) => f.includes(migrationSlug))
      assert.isDefined(match, `debe existir la migración ${migrationSlug}`)

      if (match) {
        const content = readFileSync(join(MIGRATIONS_DIR, match), 'utf-8')
        // Regla del proyecto (CLAUDE.md): nunca `await this.schema` dentro de up()/down().
        assert.notMatch(content, /await\s+this\.schema/)
        assert.include(content, 'this.defer(')
        assert.include(content, 'INNER JOIN')
        // El texto fuente escapa las comillas de identificador SQL (\`employees\`)
        // dentro del template literal; se busca la subcadena literal tal cual queda
        // en el archivo, backslashes incluidos.
        assert.include(content, 'INNER JOIN \\`employees\\` e ON e.employee_id = child.employee_id')
        assert.include(content, 'NOT NULL')
        // El backfill no filtra por *_deleted_at: cubre filas soft-deleted, sin reabrir el
        // universo con withTrashed más adelante.
        assert.notInclude(content, 'deleted_at')
      }
    })
  }
})
