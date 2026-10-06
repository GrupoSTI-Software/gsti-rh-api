import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'

/**
 * Siembra el departamento raíz "Dirección General" (id 1000) si no existe.
 *
 * USRH1789328927671 retiró el registro de relleno. El archivo se conserva
 * porque el cargador de seeders ejecuta todos los archivos de la carpeta.
 * No sembrar catálogo de relleno aquí.
 *
 * business_unit_id va en NULL a propósito: la columna tiene default 1 y la
 * carga inicial ya no crea esa empresa, así que omitirla revienta la llave
 * foránea. Este departamento raíz no pertenece a una empresa.
 */
export default class DepartmentGenericSeeder extends BaseSeeder {
  async run(): Promise<void> {
    const exists = await db
      .from('departments')
      .where('department_id', 1000)
      .first()

    if (!exists) {
      await db.rawQuery(`
        INSERT INTO departments
          (department_id, department_code, department_name, department_alias,
           department_is_default, department_active, department_sync_id,
           parent_department_sync_id, company_id, business_unit_id,
           department_created_at, department_updated_at)
        VALUES
          (1000, 'DIR-001', 'Dirección General', 'Dirección General',
           0, 1, 0, 0, 0, NULL,
           NOW(), NOW())
      `)
    }
  }
}
