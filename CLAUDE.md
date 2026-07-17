# Reglas del proyecto — valanserh-api

@.claude/rules/design-principles.md

## Migraciones (AdonisJS Lucid)

- NUNCA usar `await` con `this.schema` dentro de `up()`/`down()`: el getter `schema` registra cada builder y Lucid los ejecuta de forma diferida al terminar el método; como los builders de Knex son thenables, el `await` manual provoca que el SQL se ejecute DOS VECES.
- Síntoma de la doble ejecución: los `ALTER MODIFY` pasan en silencio (idempotentes), pero los `ADD COLUMN` fallan con "Duplicate column name" y dejan columnas huérfanas (creadas en BD pero sin registro en `adonis_schema`).
- Correcto: `this.schema.alterTable(...)` / `this.schema.raw(...)` sin `await`. El orden entre varias llamadas se respeta (se ejecutan en secuencia al terminar `up()`).
- Incorrecto: `await this.schema.alterTable(...)`
- Si al migrar aparece "Duplicate column name", sospechar de columna huérfana: comparar `SHOW COLUMNS` contra `adonis_schema`; si la columna coincide con lo que crearía la migración, registrarla manualmente con `INSERT` en `adonis_schema` en lugar de eliminarla.
