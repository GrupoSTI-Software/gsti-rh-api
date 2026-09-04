import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cierre del acceso cruzado a la foto biométrica del colaborador.
 *
 * Las tres lecturas de `employee_biometric_face_id_routes.ts` dejaron de
 * confiar en el interruptor de exigencia del módulo `employees` —apagado— y
 * ahora resuelven con `evaluateEnforced`: el dueño de la foto pasa por
 * identidad y cualquier otra sesión necesita `tab-biometricos-read` concedido.
 *
 * Sin esta concesión el backoffice de Recursos Humanos se quedaría en 403 el
 * día del despliegue, porque ningún rol tenía el permiso: hasta ahora pasaba
 * todo el mundo por `module-not-enforced`.
 *
 * El rol `kiosco` se crea aquí porque la terminal compartida sí necesita leer
 * las fotos de todo el directorio, y dárselo al rol `empleado` devolvería el
 * agujero que este cambio cierra: cualquier colaborador podría pedir la foto de
 * sus compañeros de unidad. Las cuentas de las terminales deben moverse a este
 * rol; mientras sigan en `empleado`, el kiosco no sincroniza.
 *
 * Idempotente en las dos direcciones: `up()` no duplica lo que ya exista y
 * `down()` retira exactamente lo que esta corrida creó, reconocible por la
 * marca literal del archivo.
 */
const ADMIN_ROLE_SLUGS = ['rh-manager', 'super-administrador', 'kiosco'] as const
const BIOMETRIC_READ_SLUG = 'tab-biometricos-read'
const KIOSK_ROLE_SLUG = 'kiosco'

/** Marca única de la corrida: `down()` retira solo lo que agregó `up()`. */
const GRANTED_AT = '2026-09-04 00:00:00'

const ROLE_PLACEHOLDERS = ADMIN_ROLE_SLUGS.map(() => '?').join(', ')

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      // La terminal de kiosco necesita un rol propio: es el único consumidor
      // legítimo que lee fotos ajenas sin ser backoffice.
      await db.rawQuery(
        `INSERT INTO \`roles\`
           (\`role_name\`, \`role_slug\`, \`role_description\`, \`role_active\`,
            \`role_business_access\`, \`role_created_at\`, \`role_updated_at\`)
         SELECT 'Kiosco', ?, 'Terminal compartida de registro de asistencia', 1,
                'gsti-rh', ?, ?
         FROM DUAL
         WHERE NOT EXISTS (
           SELECT 1 FROM \`roles\`
           WHERE \`role_slug\` = ? AND \`role_deleted_at\` IS NULL
         )`,
        [KIOSK_ROLE_SLUG, GRANTED_AT, GRANTED_AT, KIOSK_ROLE_SLUG]
      )

      // Si la instalación no tiene el módulo `employees` o el permiso, el JOIN
      // no resuelve filas y la migración termina sin hacer nada ni fallar.
      await db.rawQuery(
        `INSERT INTO \`role_system_permissions\`
           (\`role_id\`, \`system_permission_id\`,
            \`role_system_permission_created_at\`, \`role_system_permission_updated_at\`)
         SELECT \`r\`.\`role_id\`, \`sp\`.\`system_permission_id\`, ?, ?
         FROM \`roles\` AS \`r\`
         INNER JOIN \`system_permissions\` AS \`sp\`
           ON \`sp\`.\`system_permission_slug\` = ?
          AND \`sp\`.\`system_permission_deleted_at\` IS NULL
         INNER JOIN \`system_modules\` AS \`sm\`
           ON \`sm\`.\`system_module_id\` = \`sp\`.\`system_module_id\`
          AND \`sm\`.\`system_module_slug\` = 'employees'
          AND \`sm\`.\`system_module_deleted_at\` IS NULL
         WHERE \`r\`.\`role_slug\` IN (${ROLE_PLACEHOLDERS})
           AND \`r\`.\`role_deleted_at\` IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM \`role_system_permissions\` AS \`existente\`
             WHERE \`existente\`.\`role_id\` = \`r\`.\`role_id\`
               AND \`existente\`.\`system_permission_id\` = \`sp\`.\`system_permission_id\`
               AND \`existente\`.\`role_system_permission_deleted_at\` IS NULL
           )`,
        [GRANTED_AT, GRANTED_AT, BIOMETRIC_READ_SLUG, ...ADMIN_ROLE_SLUGS]
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      // Solo las concesiones que creó esta corrida: la marca las identifica y
      // deja intactas las que existieran antes por otro motivo.
      await db.rawQuery(
        `DELETE \`rsp\` FROM \`role_system_permissions\` AS \`rsp\`
         INNER JOIN \`system_permissions\` AS \`sp\`
           ON \`sp\`.\`system_permission_id\` = \`rsp\`.\`system_permission_id\`
         WHERE \`sp\`.\`system_permission_slug\` = ?
           AND \`rsp\`.\`role_system_permission_created_at\` = ?`,
        [BIOMETRIC_READ_SLUG, GRANTED_AT]
      )

      // El rol solo se retira si lo creó esta corrida y nadie lo está usando.
      await db.rawQuery(
        `DELETE FROM \`roles\`
         WHERE \`role_slug\` = ?
           AND \`role_created_at\` = ?
           AND NOT EXISTS (
             SELECT 1 FROM \`users\` AS \`u\`
             WHERE \`u\`.\`role_id\` = \`roles\`.\`role_id\`
           )`,
        [KIOSK_ROLE_SLUG, GRANTED_AT]
      )
    })
  }
}
