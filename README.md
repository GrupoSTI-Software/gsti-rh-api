![Logo](https://sae.com.mx/wp-content/uploads/2024/03/logo_sae.svg)

# API Principal SAE

API REST Principal para el control de servicios en los proyectos internos de SAE

## Tech Stack

**Server:** AdonisJS, MySQL, Swagger Docs

**Node Version:** 20.13.1 LTS

## Installation

Install my-project with npm

```bash
  npm install
  npm run prepare
  node ace configure adonisjs-6-swagger
```

Create docs spec file

```bash
  mkdir docs
  touch docs/swagger.json
```

Generate projectunique key

```bash
  node ace generate:key
```

Run migrations and seeders (Create database with name "**db_sae**")

```bash
  node ace migration:run
  node ace db:seed
```

## Local Launching

To deploy this project run

```bash
  npm run dev
```

Inicia por defecto en localhost:3333

## Lint de neutralidad terminológica

Existe un lint en `scripts/lint-terminology.mjs` que valida que el código fuente
no contenga términos restringidos asociados a herramientas o etiquetas
psicométricas. Funciona en modo *block*: si detecta al menos un hit, falla con
código de salida `1` y bloquea el merge desde el workflow de GitHub Actions
(`.github/workflows/lint-terminology.yml`), que se ejecuta en cada PR y push a
`main` o `develop`.

### Ejecución local

```bash
  npm run lint:terminology
```

El script no requiere dependencias adicionales (sólo Node 20+). Imprime los
hallazgos en formato `archivo:línea:columna [término] -> "match"` y, si todo
está limpio, reporta el conteo de archivos analizados.

### Términos restringidos

`psico*`, `psychomet*`, `DISC`, `Cleaver`, `Wonderlic`, `16PF`, `MMPI`, `TERMAN`,
`Raven`, `Big Five`, `OCEAN`, `PAPI`, `Kostick`, `Beck`, `IQ`,
`coeficiente intelectual`.

### Exclusiones

Las exclusiones están embebidas al inicio de `scripts/lint-terminology.mjs`:

- Carpetas: `node_modules`, `.git`, `.husky`, `build`, `dist`, `tmp`,
  `coverage`, `docs`, `.github`.
- Archivos: `CHANGELOG`, `README.md`, `package-lock.json`, `pnpm-lock.yaml`,
  `yarn.lock` y el propio script.
- Migraciones históricas (`1774641305000_*` originales y `1776400000000_*`
  renames de la fase de refactor).
- Exclusiones temporales por residuos del refactor HU1-HU6 (marcadas con
  `TODO` dentro del set `EXCLUDED_RELATIVE_PATHS`).

Para agregar una nueva exclusión:

1. Si es un archivo puntual, añade su path relativo (formato POSIX) al set
   `EXCLUDED_RELATIVE_PATHS`.
2. Si es una carpeta nueva, añade el nombre al set `EXCLUDED_DIRS`.
3. Documenta el motivo con un comentario al lado de la entrada.
