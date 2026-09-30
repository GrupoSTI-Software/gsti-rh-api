# Reglas del proyecto — valanserh-api

Las reglas viven UNA sola vez, en `.claude/rules/`. Este archivo solo las importa, y
`.cursor/rules/*.mdc` apunta a los mismos archivos: nada se copia entre formatos.

@.claude/rules/design-principles.md
@.claude/rules/catalogo-modulos-permisos.md
@.claude/rules/migraciones-lucid.md
@.claude/rules/higiene-repo.md
@.claude/rules/idioma.md
@.cursorrules

## La que más se rompe, primero

El catálogo de módulos, grupos y permisos tiene **una sola fuente**:
`app/constants/system_modules_menu/system_modules.constant.ts`.

No se crean archivos nuevos que enumeren módulos o permisos, no se siembra catálogo desde
migraciones, no se escriben ids ni slugs a mano. Lee `.claude/rules/catalogo-modulos-permisos.md`
ANTES de tocar `app/constants/`, `database/seeders/`, `database/migrations/` o `start/routes/`.

## Verificación que no es negociable

```
node ace test unit --files="constants/"
```

Corre en `pre-push` y en el workflow `catalogo-modulos-permisos` de GitHub Actions. Si tu cambio
lo truena, el cambio está mal — no el test.

La suite `unit` completa NO pasa sin la BD `sae_pruebas` levantada; por eso el guardrail está
acotado a `constants/`, que no toca base de datos.
