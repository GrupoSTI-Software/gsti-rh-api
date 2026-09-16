import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import SystemModuleSeeder from '#database/seeders/0062_system_module_seeder'
import RoleSystemPermission from '#models/role_system_permission'
import SystemModule from '#models/system_module'
import SystemPermission from '#models/system_permission'
import { SYSTEM_MODULES } from '#constants/system_modules_menu/system_modules.constant'

/**
 * `0062_system_module_seeder` — idempotencia, bajas y alcance de la siembra.
 *
 * Esta cobertura se perdió al retirar la sincronización de permisos: quien la
 * ejercitaba de rebote era el endpoint de exigencia, y con él fuera nadie
 * volvía a correr 0062 dos veces contra la misma base. El seeder corre en cada
 * `migration:fresh --seed` y en cada despliegue sobre bases CON datos, así que
 * las tres promesas de su cabecera —no duplica, no revive bajas y no reparte
 * concesiones— son justo las que, al romperse, se notan en producción y no en
 * local: en una base vacía todo alta es correcta.
 *
 * Los casos no afirman ningún id literal ni ningún conteo absoluto de módulos:
 * el catálogo cambia con cada HU. Afirman que la SEGUNDA corrida deja la base
 * exactamente como la dejó la primera.
 */

/** Ids de los módulos vivos por slug: detecta altas duplicadas y cambios de id. */
async function idsDeModulosVivos(): Promise<Map<string, number>> {
  const modulos = await SystemModule.query().whereNull('system_module_deleted_at')
  return new Map(modulos.map((modulo) => [modulo.systemModuleSlug, modulo.systemModuleId]))
}

/** Filas totales, bajas incluidas: una duplicación no se ve contando solo vivas. */
async function totalFilas(): Promise<{ modulos: number; permisos: number }> {
  const modulos = await SystemModule.query().withTrashed().count('* as total')
  const permisos = await SystemPermission.query().withTrashed().count('* as total')
  return {
    modulos: Number(modulos[0].$extras.total),
    permisos: Number(permisos[0].$extras.total),
  }
}

async function totalConcesiones(): Promise<number> {
  const filas = await RoleSystemPermission.query().count('* as total')
  return Number(filas[0].$extras.total)
}

/** Fecha de baja de un módulo, leyendo también las filas dadas de baja. */
async function fechaDeBaja(slug: string): Promise<string | null> {
  const modulo = await SystemModule.query()
    .withTrashed()
    .where('system_module_slug', slug)
    .orderByRaw('system_module_deleted_at IS NULL DESC')
    .orderBy('system_module_id')
    .firstOrFail()
  return modulo.deletedAt ? modulo.deletedAt.toISO() : null
}

/**
 * Cliente real, no un `{} as never`: hoy `BaseSeeder` solo lo guarda y 0062 no
 * lo usa, pero el día que abra una transacción con `this.client` el spec
 * reventaría en runtime en vez de fallar al compilar.
 */
const correrSeeder = () => new SystemModuleSeeder(db.connection()).run()

test.group('0062_system_module_seeder', () => {
  test('correrlo dos veces no duplica filas ni cambia ningún id', async ({ assert }) => {
    await correrSeeder()
    const idsPrimera = await idsDeModulosVivos()
    const filasPrimera = await totalFilas()

    await correrSeeder()
    const idsSegunda = await idsDeModulosVivos()
    const filasSegunda = await totalFilas()

    assert.deepEqual(
      Object.fromEntries(idsSegunda),
      Object.fromEntries(idsPrimera),
      'La segunda corrida no debe crear, retirar ni reasignar el id de ningún módulo'
    )
    assert.deepEqual(
      filasSegunda,
      filasPrimera,
      'La segunda corrida no debe agregar filas de módulo ni de permiso'
    )
  }).timeout(60_000)

  test('un módulo dado de baja no revive ni mueve su fecha de baja', async ({ assert }) => {
    const retirados = SYSTEM_MODULES.filter((modulo) => modulo.systemModuleRetired).map(
      (modulo) => modulo.systemModuleSlug
    )
    assert.isAbove(
      retirados.length,
      0,
      'La constante debe declarar al menos un módulo retirado para que este caso pruebe algo'
    )

    await correrSeeder()
    const bajasPrimera = await Promise.all(retirados.map((slug) => fechaDeBaja(slug)))

    for (const [indice, slug] of retirados.entries()) {
      assert.isNotNull(
        bajasPrimera[indice],
        `El módulo retirado "${slug}" debe quedar dado de baja`
      )
    }

    await correrSeeder()
    const bajasSegunda = await Promise.all(retirados.map((slug) => fechaDeBaja(slug)))

    assert.deepEqual(
      bajasSegunda,
      bajasPrimera,
      'Re-ejecutar el seeder no debe revivir un módulo retirado ni mover su fecha de baja'
    )
  }).timeout(60_000)

  /**
   * 0062 siembra catálogo, no reparte acceso. Las concesiones que ningún atajo
   * de rol cubre se declaran por slug en `0063_system_role_permission_seeder`;
   * si 0062 empezara a escribir aquí, cada siembra devolvería permisos que
   * alguien quitó a mano desde Roles y permisos.
   */
  test('no escribe ninguna concesión en role_system_permissions', async ({ assert }) => {
    const antes = await totalConcesiones()

    await correrSeeder()

    assert.equal(await totalConcesiones(), antes, '0062 no debe tocar las concesiones de rol')
  }).timeout(60_000)
})
