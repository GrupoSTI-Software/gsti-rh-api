import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migración USRH1783101935670 — evidencia de consentimiento por documento.
 *
 * Todo el archivo usa `this.db.rawQuery(...)` / query builder inmediato en vez de
 * `this.schema.alterTable(...)`: los builders de `this.schema` son thenables que Lucid
 * ejecuta en diferido al terminar `up()`; intercalar ALTER + backfill + DROP/ADD de
 * unicidad con `this.schema` rompería el orden estricto exigido (mismo patrón que
 * `1782900010000_alter_employees_work_schedule_hybrid.ts`).
 *
 * Orden real de ejecución (validado contra MySQL — ver nota de corrección abajo):
 *   1. Columnas aditivas: legal_document_id, user_consent_ip, user_consent_user_agent + FK.
 *   2. Quitar la unicidad legada (user_id, user_consent_document_version).
 *   3. Backfill idempotente y no destructivo: cada fila "1.0" se reexpresa en 2 filas
 *      ligadas a documento (privacy_notice + terms_conditions), conservando el
 *      acceptedAt/createdAt originales. Reutiliza la fila original (UPDATE de
 *      legal_document_id) e inserta la fila hermana → 2 filas totales por usuario
 *      (coincide con el Gherkin "queda con 2 filas").
 *   4. Unicidad nueva (user_id, legal_document_id) + índice (user_id).
 *
 * Nota de corrección de drift (validado empíricamente en 2026-07-06, ver spec §Modelo de
 * datos): el spec describe la Fase C (drop/add de unicidad) "al final, ya sin colisión",
 * después del backfill. Eso es incorrecto en la práctica: mientras la unicidad legada
 * (user_id, user_consent_document_version) siga activa, el INSERT de la fila hermana
 * ("1.0" para el segundo documento) viola esa unicidad porque ambas filas comparten el
 * mismo `(user_id, version)`. Por eso el DROP de la unicidad legada se adelanta a antes
 * del backfill; el ADD de la unicidad nueva sí se mantiene al final (una vez que cada fila
 * ya tiene su `legal_document_id` propio, no hay colisión). El estado final de columnas/
 * índices es idéntico al descrito en el spec; solo cambia el momento del DROP.
 *
 * Precondición: 1783100000000 (legal_documents) y el seeder 0047 (docs v1.0) ya corrieron.
 * El backfill hace `firstOrCreate` defensivo del doc v1.0 si el seeder no corrió.
 *
 * Cada paso DDL comprueba el estado real de la tabla antes de aplicarse (columna, FK o
 * índice ya existente se omite) y el backfill se basa en qué documentos ya están ligados
 * (no en `legal_document_id IS NULL`) — si un `up()` previo murió a la mitad (p.ej. tras el
 * UPDATE pero antes del INSERT hermano), reintentar `migration:run` retoma exactamente donde
 * quedó, sin duplicar ni con "Duplicate column name" (ver `.cursorrules`/CLAUDE.md sobre
 * migraciones Lucid).
 */
export default class extends BaseSchema {
  protected tableName = 'user_consents'

  async up() {
    // ---- Columnas aditivas ----
    if (!(await this.columnExists('legal_document_id'))) {
      await this.db.rawQuery(`
        ALTER TABLE ${this.tableName}
          ADD COLUMN legal_document_id INT UNSIGNED NULL,
          ADD COLUMN user_consent_ip VARCHAR(191) NULL,
          ADD COLUMN user_consent_user_agent TEXT NULL
      `)
    }
    if (!(await this.foreignKeyExists('fk_user_consents_legal_document'))) {
      await this.db.rawQuery(`
        ALTER TABLE ${this.tableName}
          ADD CONSTRAINT fk_user_consents_legal_document
          FOREIGN KEY (legal_document_id) REFERENCES legal_documents(legal_document_id)
          ON DELETE RESTRICT
      `)
    }

    // ---- Quitar la unicidad legada ANTES del backfill ----
    // Orden crítico #1: `user_id` sostiene la FK hacia `users` (definida en la migración
    // original de la tabla) usando como índice de soporte el único legado. MySQL no permite
    // dropear ese índice mientras sea el único que cubre la FK — se crea primero un índice
    // de reemplazo que empiece por `user_id` (el índice simple) antes de poder dropearlo.
    if (!(await this.indexExists('user_consents_user_id_index'))) {
      await this.db.rawQuery(`
        CREATE INDEX user_consents_user_id_index ON ${this.tableName} (user_id)
      `)
    }
    // Orden crítico #2 (corrección de drift, ver docblock): el backfill inserta una fila
    // hermana con el mismo (user_id, version='1.0') que la fila original, lo que viola la
    // unicidad legada si sigue activa. Por eso se dropea aquí, antes del backfill.
    const legacyUniqueName = await this.findUniqueIndexName([
      'user_id',
      'user_consent_document_version',
    ])
    if (legacyUniqueName) {
      await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP INDEX ${legacyUniqueName}`)
    }

    // ---- Backfill 1 → 2 (idempotente, no destructivo, resumible) ----
    await this.backfillGranularAcceptances()

    // ---- Unicidad nueva (ya sin colisión: cada fila tiene su propio legal_document_id) ----
    if (!(await this.indexExists('user_consents_user_id_legal_document_id_unique'))) {
      await this.db.rawQuery(`
        ALTER TABLE ${this.tableName}
          ADD UNIQUE KEY user_consents_user_id_legal_document_id_unique (user_id, legal_document_id)
      `)
    }
  }

  async down() {
    if (await this.indexExists('user_consents_user_id_legal_document_id_unique')) {
      await this.db.rawQuery(
        `ALTER TABLE ${this.tableName} DROP INDEX user_consents_user_id_legal_document_id_unique`
      )
    }
    // Recrea la unicidad legada. Solo funciona si no quedaron 2 filas "1.0" por usuario
    // (esperado: el rollback se usa antes de re-ejecutar la migración corregida, no en prod;
    // en prod, revertir requeriría antes deshacer manualmente el backfill).
    if (!(await this.indexExists('user_consents_user_id_user_consent_document_version_unique'))) {
      await this.db.rawQuery(`
        ALTER TABLE ${this.tableName}
          ADD UNIQUE KEY user_consents_user_id_user_consent_document_version_unique
          (user_id, user_consent_document_version)
      `)
    }
    if (await this.indexExists('user_consents_user_id_index')) {
      await this.db.rawQuery(`DROP INDEX user_consents_user_id_index ON ${this.tableName}`)
    }

    // El backfill NO se revierte: es aditivo por diseño (evidencia legal, nunca se borra).
    if (await this.foreignKeyExists('fk_user_consents_legal_document')) {
      await this.db.rawQuery(
        `ALTER TABLE ${this.tableName} DROP FOREIGN KEY fk_user_consents_legal_document`
      )
    }
    if (await this.columnExists('legal_document_id')) {
      await this.db.rawQuery(`
        ALTER TABLE ${this.tableName}
          DROP COLUMN legal_document_id,
          DROP COLUMN user_consent_ip,
          DROP COLUMN user_consent_user_agent
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

  /**
   * Resuelve el nombre real del índice único legado en vez de asumir el nombre por
   * default de Knex (evita que un ambiente con un índice nombrado distinto rompa el DROP).
   */
  private async findUniqueIndexName(columns: string[]): Promise<string | null> {
    const result = await this.db.rawQuery(
      `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
       FROM information_schema.statistics
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND NON_UNIQUE = 0 AND INDEX_NAME <> 'PRIMARY'
       GROUP BY INDEX_NAME`,
      [this.tableName]
    )
    const rows = (result?.[0] ?? []) as Array<{ INDEX_NAME: string; cols: string }>
    const target = columns.join(',')
    const match = rows.find((row) => row.cols === target)
    return match ? match.INDEX_NAME : null
  }

  /**
   * Backfill: por cada usuario con evidencia "1.0", garantiza que exista una fila ligada al
   * aviso de privacidad vigente y otra a los términos vigentes (2 filas totales), reutilizando
   * una fila original vía UPDATE cuando esté disponible e insertando la hermana faltante.
   *
   * Agrupa por `user_id` (no por fila individual) para ser resumible ante un fallo a medio
   * camino: si un run previo dejó el UPDATE aplicado pero el INSERT hermano falló, este query
   * detecta "qué documento ya está ligado" por el valor real de `legal_document_id`, no por
   * `IS NULL` (que ya no aplicaría a la fila reutilizada). Nunca hace DELETE/UPDATE de
   * `user_consent_accepted_at`/`created_at`: los timestamps originales se preservan siempre.
   */
  private async backfillGranularAcceptances(): Promise<void> {
    const privacyDoc = await this.findOrCreateCurrentDocument('privacy_notice', '1.0')
    const termsDoc = await this.findOrCreateCurrentDocument('terms_conditions', '1.0')

    const legacyRows = await this.db
      .from(this.tableName)
      .where('user_consent_document_version', '1.0')
      .select(
        'user_consent_id',
        'user_id',
        'legal_document_id',
        'user_consent_accepted_at',
        'user_consent_created_at',
        'user_consent_updated_at'
      )

    const rowsByUser = new Map<number, typeof legacyRows>()
    for (const row of legacyRows) {
      const list = rowsByUser.get(row.user_id) ?? []
      list.push(row)
      rowsByUser.set(row.user_id, list)
    }

    for (const [userId, rows] of rowsByUser) {
      const hasPrivacy = rows.some((row) => row.legal_document_id === privacyDoc.legal_document_id)
      const hasTerms = rows.some((row) => row.legal_document_id === termsDoc.legal_document_id)
      if (hasPrivacy && hasTerms) {
        continue
      }

      const unlinkedRow = rows.find((row) => row.legal_document_id === null)
      const representative = unlinkedRow ?? rows[0]

      if (!hasPrivacy) {
        if (!unlinkedRow) {
          console.warn(
            `[backfill user_consents] user_id=${userId}: no hay fila sin vincular para asignar ` +
              'a privacy_notice y ya existe una fila con otro legal_document_id. Se omite ' +
              '(requiere revisión manual).'
          )
          continue
        }
        await this.db
          .from(this.tableName)
          .where('user_consent_id', unlinkedRow.user_consent_id)
          .update({ legal_document_id: privacyDoc.legal_document_id })
      }

      if (!hasTerms) {
        await this.db.table(this.tableName).insert({
          user_id: userId,
          user_consent_document_version: '1.0',
          legal_document_id: termsDoc.legal_document_id,
          user_consent_accepted_at: representative.user_consent_accepted_at,
          user_consent_created_at: representative.user_consent_created_at,
          user_consent_updated_at: representative.user_consent_updated_at,
        })
      }
    }
  }

  /** Robustez ante ausencia del seeder 0047: crea la versión "1.0" vigente si no existe. */
  private async findOrCreateCurrentDocument(
    type: 'privacy_notice' | 'terms_conditions',
    version: string
  ): Promise<{ legal_document_id: number }> {
    const existing = await this.db
      .from('legal_documents')
      .where('legal_document_type', type)
      .where('legal_document_version', version)
      .first()

    if (existing) {
      return existing
    }

    const now = new Date()
    const [insertedId] = await this.db.table('legal_documents').insert({
      legal_document_type: type,
      legal_document_version: version,
      legal_document_content: null,
      legal_document_is_current: true,
      legal_document_status: 'published',
      legal_document_published_at: now,
      legal_document_published_by_user_id: null,
      legal_document_created_at: now,
      legal_document_updated_at: now,
    })

    return { legal_document_id: insertedId }
  }
}
