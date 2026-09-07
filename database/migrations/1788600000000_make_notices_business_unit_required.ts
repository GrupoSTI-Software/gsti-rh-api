import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * `notices.business_unit_id` pasa a ser obligatorio.
 *
 * ## Por qué
 * La columna nació nullable (`1784316440001`) porque el backfill desde
 * destinatarios no podía derivar la empresa de los avisos sin destinatarios.
 * Aquellos quedaron "ocultos en consultas por tenant", y eso se aceptó como el
 * precio de la migración.
 *
 * Lo que no se vio entonces: **el alta tampoco asignaba la empresa**. Ni el
 * servicio ni un hook del modelo la ponían, y el mixin de scope solo filtra
 * lecturas. Así que no era un residuo de avisos viejos — cada aviso nuevo nacía
 * igual de roto: invisible para el filtro de tenant, imposible de editar o
 * borrar desde el backoffice, y visible para todas las empresas en cuanto se
 * añadió el corte de lectura con `orWhereNull`.
 *
 * Con el alta corregida, la columna nullable deja de tener razón de ser. Que sea
 * obligatoria es lo que impide que la excepción vuelva.
 *
 * ## Seguridad del despliegue
 * El backfill se repite antes del ALTER por si alguna base tuviera filas
 * derivables pendientes. Si aun así quedara alguna sin empresa, **el ALTER falla
 * y la migración se detiene**: es deliberado. Un aviso que no pertenece a
 * ninguna empresa es un dato que hay que resolver a mano, no algo que deba
 * pasar en silencio.
 */
export default class extends BaseSchema {
  protected tableName = 'notices'

  async up() {
    this.defer(async (db) => {
      // Segundo intento de derivación, idéntico al de la migración original.
      await db.rawQuery(
        `UPDATE \`${this.tableName}\` n
         INNER JOIN (
           SELECT nr.notice_id, MIN(e.business_unit_id) AS bu
           FROM notice_recipients nr
           INNER JOIN employees e ON e.employee_id = nr.employee_id
           WHERE e.business_unit_id IS NOT NULL
           GROUP BY nr.notice_id
         ) d ON d.notice_id = n.notice_id
         SET n.business_unit_id = d.bu
         WHERE n.business_unit_id IS NULL`
      )

      const [pendientes] = await db.rawQuery(
        `SELECT COUNT(*) AS total FROM \`${this.tableName}\`
         WHERE business_unit_id IS NULL AND notice_deleted_at IS NULL`
      )
      const total = Number(pendientes?.[0]?.total ?? 0)
      if (total > 0) {
        throw new Error(
          `No se puede hacer obligatoria la empresa del aviso: quedan ${total} ` +
            'avisos sin empresa y sin destinatarios de los que derivarla. ' +
            'Resuélvelos a mano (asígnales empresa o archívalos) y vuelve a correr la migración.'
        )
      }

      // La FK y el índice ya existen desde la migración original; aquí solo
      // cambia la nulabilidad.
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NOT NULL`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.rawQuery(
        `ALTER TABLE \`${this.tableName}\`
         MODIFY COLUMN \`business_unit_id\` INT UNSIGNED NULL`
      )
    })
  }
}
