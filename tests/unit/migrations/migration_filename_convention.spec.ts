import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'

/**
 * Guardarraíl del orden de ejecución de migraciones.
 *
 * Lucid ordena las migraciones por el NOMBRE del archivo. Con
 * `naturalSort: true` los prefijos se comparaban como números enteros, asi que
 * un timestamp en microsegundos (16 dígitos) resultaba ~1000 veces mayor que
 * uno en milisegundos (13) y Lucid mandaba esos archivos al final de toda la
 * cola, fuera de su lugar cronológico. Eso rompía `migration:fresh`: la
 * migración del módulo Calendario corría antes de la que crea
 * `system_modules.system_module_group_id`.
 *
 * Este spec cierra la clase de bug por dos flancos:
 *   1. Ningún archivo nuevo puede tener un prefijo distinto de 13 dígitos.
 *   2. `naturalSort` no puede volver a `true`.
 *
 * Reglas en CLAUDE.md y .cursorrules, sección "Migraciones (AdonisJS Lucid)".
 */

const MIGRATIONS_DIR = join(process.cwd(), 'database/migrations')
const PREFIJO_VALIDO = /^[0-9]{13}_/

/**
 * Archivos que ya estaban en el repo cuando se introdujo esta regla y que no se
 * pueden renombrar: el nombre es la clave con la que Lucid los registra en
 * `adonis_schema`, y renombrarlos los volvería a ejecutar en toda BD donde ya
 * corrieron (locales del equipo, staging, producción).
 *
 * ESTA LISTA NO CRECE. Si un archivo nuevo cae aquí, el cambio está mal:
 * regenéralo con `node ace make:migration <nombre>`.
 */
const EXCEPCIONES_CONGELADAS: readonly string[] = [
  '1786566437097000_add_business_unit_id_to_assists.ts',
  '1786566437097001_add_assist_natural_key_to_assists.ts',
  '1786736057522000_add_user_invitation_columns_to_users_table.ts',
  '1786737531057000_create_tenant_billing_profiles_table.ts',
  '1786737531063000_create_sat_tax_regimes_table.ts',
  '1786737531063001_create_sat_cfdi_uses_table.ts',
  '1786737531063002_create_sat_cfdi_use_tax_regimes_table.ts',
  '1786737531066000_add_cfdi_issuance_fields_to_tenant_billing_profiles.ts',
  '1786737531070000_soft_delete_retired_employee_permission_slugs.ts',
  '1787157820195000_add_assist_origin_to_assists_table.ts',
  '1787623518696000_add_is_public_to_billing_plans_table.ts',
  '1787699700000000_create_discount_codes_table.ts',
  '1787699700000010_add_discount_code_to_billing_subscriptions_table.ts',
  '1787699700000011_fix_discount_code_benefit_periods_column_type.ts',
  '1787699700000020_add_discount_code_to_billing_payments_table.ts',
  '1787699700000030_add_discount_code_to_billing_subscription_changes_table.ts',
  '1787932877000000_add_slug_active_unique_to_business_units.ts',
  '1788282413065000_create_system_module_groups_table.ts',
  '1788282413066000_add_system_module_group_and_order_to_system_modules.ts',
  '1788282413067000_alter_system_settings_trade_name_length.ts',
  '1788282413067000_create_platform_tenant_groups_table.ts',
  '1788282413067001_create_platform_tenant_group_members_table.ts',
  '1788282413068000_alter_system_settings_monthly_conversion_factor_default.ts',
  '1788282413069000_create_alliances_table.ts',
  '1788282413070000_create_alliance_billing_profiles_table.ts',
  '1788282413071000_add_alliance_id_to_discount_codes.ts',
  '1788282413072000_add_qr_storage_key_to_alliances.ts',
  '1788282413204000_reorganize_system_modules_into_groups.ts',
  '1788288461952000_create_sat_cancellation_reasons_table.ts',
  '1788288461952001_create_billing_tax_receipts_table.ts',
  '1788300000000000_dedupe_and_unique_access_point_serial_number.ts',
  '1788300000000001_add_platform_device_id_to_access_points.ts',
  '1788600000000000_create_employee_offboarding_document_templates_table.ts',
  'create_passkey_credentials_table.ts',
]

function archivosDeMigracion(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((archivo) => archivo.endsWith('.ts'))
}

test.group('Convención de nombre de migraciones', () => {
  test('toda migración nueva lleva prefijo de exactamente 13 dígitos', ({ assert }) => {
    const infractores = archivosDeMigracion()
      .filter((archivo) => !PREFIJO_VALIDO.test(archivo))
      .filter((archivo) => !EXCEPCIONES_CONGELADAS.includes(archivo))

    assert.deepEqual(
      infractores,
      [],
      'Prefijo inválido. Lucid ordena por nombre de archivo: un prefijo de otro largo ' +
        'ejecuta la migración fuera de su lugar cronológico. Genera el archivo con ' +
        '"node ace make:migration <nombre>" en lugar de escribir el timestamp a mano.'
    )
  })

  test('la lista de excepciones no crece', ({ assert }) => {
    assert.lengthOf(
      EXCEPCIONES_CONGELADAS,
      34,
      'La lista de excepciones está congelada: ningún archivo nuevo debe agregarse a ella.'
    )
  })

  test('toda excepción congelada sigue existiendo en el repo', ({ assert }) => {
    const presentes = new Set(archivosDeMigracion())
    const fantasmas = EXCEPCIONES_CONGELADAS.filter((archivo) => !presentes.has(archivo))

    assert.deepEqual(
      fantasmas,
      [],
      'Hay excepciones que ya no corresponden a ningún archivo: retíralas de la lista y ' +
        'baja el conteo esperado, para que la regla no se afloje sola.'
    )
  })
})

test.group('Orden de migraciones — configuración', () => {
  test('naturalSort permanece en false', ({ assert }) => {
    const config = readFileSync(join(process.cwd(), 'config/database.ts'), 'utf-8')

    assert.match(
      config,
      /naturalSort:\s*false/,
      'Con naturalSort: true los prefijos se comparan como números enteros y las ' +
        'migraciones con timestamp de 16 dígitos se ejecutan al final de toda la cola, ' +
        'rompiendo migration:fresh.'
    )
    assert.notMatch(config, /naturalSort:\s*true/)
  })
})
