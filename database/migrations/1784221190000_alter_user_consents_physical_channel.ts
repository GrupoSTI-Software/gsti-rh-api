import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migración USRH1784146205513 — canal físico del consentimiento biométrico.
 *
 * Todo el archivo usa `this.db.rawQuery(...)` en vez de `this.schema.alterTable(...)`:
 * los builders de `this.schema` son thenables que Lucid ejecuta en diferido al terminar
 * `up()`; un `await` manual sobre ellos ejecutaría el SQL DOS VECES (ver `.cursorrules`/
 * CLAUDE.md). Mismo patrón que `1783100000001_alter_user_consents_granular_by_document.ts`
 * (misma tabla): cada paso DDL comprueba el estado real contra `information_schema` antes
 * de aplicarse, así que `migration:run` es resumible ante un fallo a medio camino.
 *
 * Qué agrega (spec §9):
 *  1. `employee_id` — ancla directa del canal físico (el empleado de kiosco puede no
 *     tener usuario).
 *  2. `MODIFY user_id` a NULL — sin tocar la FK CASCADE existente hacia `users` (deuda
 *     pre-existente H10, no se corrige aquí).
 *  3. `user_consent_channel` ENUM(`digital`,`physical`) default `digital` — backfill
 *     implícito correcto: todo lo existente es digital.
 *  4. `user_consent_registered_by_user_id` — quién asentó (RH), NULL en digital.
 *  5. `user_consent_signed_at` — fecha de firma en papel (capturada o, en su defecto,
 *     la fecha del asiento — decisión Wilvardo 2026-07-15).
 *  6. `user_consent_evidence_file` / `user_consent_evidence_original_name` — Key S3
 *     privada del escaneo firmado + su nombre original saneado.
 *  7. FKs nuevas RESTRICT (nunca CASCADE — evidencia legal, H10 no se replica).
 *  8. UNIQUE `(employee_id, legal_document_id)` — evita doble asiento físico por
 *     empleado+documento a nivel motor (la UNIQUE legada por `user_id` no cubre las
 *     filas físicas sin usuario: MySQL permite múltiples NULL).
 *
 * Sin CHECK constraint (cero precedente en el repo, MySQL <8.0.16 lo ignora en
 * silencio): la invariante de anclaje (todo asiento físico lleva `employee_id`,
 * y además `user_id` si el empleado tiene usuario) vive en el service, no en el esquema.
 */
export default class extends BaseSchema {
  protected tableName = 'user_consents'

  async up() {
    if (!(await this.columnExists('employee_id'))) {
      await this.db.rawQuery(`
        ALTER TABLE ${this.tableName}
          ADD COLUMN employee_id INT UNSIGNED NULL,
          ADD COLUMN user_consent_channel ENUM('digital', 'physical') NOT NULL DEFAULT 'digital',
          ADD COLUMN user_consent_registered_by_user_id INT UNSIGNED NULL,
          ADD COLUMN user_consent_signed_at DATE NULL,
          ADD COLUMN user_consent_evidence_file VARCHAR(2048) NULL,
          ADD COLUMN user_consent_evidence_original_name VARCHAR(255) NULL
      `)
    }

    if (await this.columnIsNotNullable('user_id')) {
      await this.db.rawQuery(`
        ALTER TABLE ${this.tableName}
          MODIFY user_id INT UNSIGNED NULL
      `)
    }

    if (!(await this.foreignKeyExists('fk_user_consents_employee'))) {
      await this.db.rawQuery(`
        ALTER TABLE ${this.tableName}
          ADD CONSTRAINT fk_user_consents_employee
          FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
          ON DELETE RESTRICT
      `)
    }

    if (!(await this.foreignKeyExists('fk_user_consents_registered_by'))) {
      await this.db.rawQuery(`
        ALTER TABLE ${this.tableName}
          ADD CONSTRAINT fk_user_consents_registered_by
          FOREIGN KEY (user_consent_registered_by_user_id) REFERENCES users(user_id)
          ON DELETE RESTRICT
      `)
    }

    if (!(await this.indexExists('user_consents_employee_id_legal_document_id_unique'))) {
      await this.db.rawQuery(`
        ALTER TABLE ${this.tableName}
          ADD UNIQUE KEY user_consents_employee_id_legal_document_id_unique (employee_id, legal_document_id)
      `)
    }
  }

  async down() {
    if (await this.indexExists('user_consents_employee_id_legal_document_id_unique')) {
      await this.db.rawQuery(
        `ALTER TABLE ${this.tableName} DROP INDEX user_consents_employee_id_legal_document_id_unique`
      )
    }

    if (await this.foreignKeyExists('fk_user_consents_registered_by')) {
      await this.db.rawQuery(
        `ALTER TABLE ${this.tableName} DROP FOREIGN KEY fk_user_consents_registered_by`
      )
    }
    if (await this.foreignKeyExists('fk_user_consents_employee')) {
      await this.db.rawQuery(
        `ALTER TABLE ${this.tableName} DROP FOREIGN KEY fk_user_consents_employee`
      )
    }

    if (await this.columnExists('employee_id')) {
      await this.db.rawQuery(`
        ALTER TABLE ${this.tableName}
          DROP COLUMN employee_id,
          DROP COLUMN user_consent_channel,
          DROP COLUMN user_consent_registered_by_user_id,
          DROP COLUMN user_consent_signed_at,
          DROP COLUMN user_consent_evidence_file,
          DROP COLUMN user_consent_evidence_original_name
      `)
    }

    // Revertir `user_id` a NOT NULL destruiría evidencia legal si ya existen asientos
    // físicos (user_id NULL). Se aborta con mensaje claro en vez de perder filas
    // silenciosamente (mismo criterio que el down de 1783100000001).
    const orphanRows = await this.db.rawQuery(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE user_id IS NULL`
    )
    const orphanCount = Number(orphanRows?.[0]?.[0]?.count ?? 0)
    if (orphanCount > 0) {
      throw new Error(
        `No se puede revertir user_id a NOT NULL: existen ${orphanCount} asientos físicos ` +
          'con user_id NULL (evidencia legal). Revertir los borraría o los dejaría inválidos.'
      )
    }
    if (await this.columnIsNullable('user_id')) {
      await this.db.rawQuery(`
        ALTER TABLE ${this.tableName}
          MODIFY user_id INT UNSIGNED NOT NULL
      `)
    }
  }

  private async columnExists(column: string): Promise<boolean> {
    const result = await this.db.rawQuery(
      `SELECT COUNT(*) as count FROM information_schema.columns
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [this.tableName, column]
    )
    return Number(result?.[0]?.[0]?.count ?? 0) > 0
  }

  private async columnIsNotNullable(column: string): Promise<boolean> {
    const result = await this.db.rawQuery(
      `SELECT IS_NULLABLE as isNullable FROM information_schema.columns
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [this.tableName, column]
    )
    return result?.[0]?.[0]?.isNullable === 'NO'
  }

  private async columnIsNullable(column: string): Promise<boolean> {
    const result = await this.db.rawQuery(
      `SELECT IS_NULLABLE as isNullable FROM information_schema.columns
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [this.tableName, column]
    )
    return result?.[0]?.[0]?.isNullable === 'YES'
  }

  private async foreignKeyExists(constraintName: string): Promise<boolean> {
    const result = await this.db.rawQuery(
      `SELECT COUNT(*) as count FROM information_schema.table_constraints
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
         AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
      [this.tableName, constraintName]
    )
    return Number(result?.[0]?.[0]?.count ?? 0) > 0
  }

  private async indexExists(indexName: string): Promise<boolean> {
    const result = await this.db.rawQuery(
      `SELECT COUNT(*) as count FROM information_schema.statistics
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
      [this.tableName, indexName]
    )
    return Number(result?.[0]?.[0]?.count ?? 0) > 0
  }
}
