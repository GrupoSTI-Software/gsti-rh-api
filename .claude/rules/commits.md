# Commits — Conventional Commits en español

## Regla base

Todos los commits siguen [Conventional Commits 1.0.0](https://www.conventionalcommits.org/es/v1.0.0/)
y pasan `commitlint` (`@commitlint/config-conventional`, hook `commit-msg` de husky). El tipo va en
inglés (lo exige el estándar) y la descripción y el cuerpo en **español**.

```
<tipo>(<alcance opcional>): <descripción imperativa en español>

[cuerpo opcional: el porqué del cambio]

Refs: <código de la HU>
```

## Tipos permitidos

`feat` · `fix` · `refactor` · `perf` · `style` · `test` · `docs` · `build` · `ci` · `chore` · `revert`.
No se inventan tipos.

## Alcance

Opcional pero recomendado: el módulo o área tocada, corto y en minúsculas. Un solo alcance por
commit; si el cambio cruza dos áreas sin relación, son dos commits.

## Descripción

- Modo imperativo en español: "agrega", "corrige", "elimina".
- Sin punto final. Describe **qué** cambia; el porqué va en el cuerpo.

## Código de la HU (trazabilidad)

Todo commit que pertenece a una HU lleva su código en el footer `Refs:`. Es un footer válido de
Conventional Commits, así que no rompe el estándar ni commitlint.

```
feat(turnos): valida el traslape de turnos al asignar

Refs: VLRH-H1789101459906
```

- El código es el de la HU de la rama (`feature/VLRH-H…-slug`, `fix/…`, `refactor/…`, `hotfix/…`).
- Un spillover usa su propio código: `Refs: VLRH-H1789101459906-S1`.
- Mientras existan HU con código viejo, se usa el que tenga la HU: `Refs: USRH1789101459906`.
- Un commit que no pertenece a ninguna HU (configuración compartida, dependencias) no lleva `Refs:`
  y normalmente es `chore`, `build` o `ci`.
- Nunca se pone el código en el tipo ni en la descripción.

## Footers adicionales

- `BREAKING CHANGE: <descripción>` o `!` después del tipo/alcance para cambios incompatibles.
- `Co-Authored-By: Nombre <email>` si aplica.

## Reglas operativas

- Un commit = un cambio lógico. Si la descripción necesita "y" o "además", son dos commits.
- No mezclar refactor con cambio de comportamiento en el mismo commit.
- Nunca `--no-verify` para saltar hooks salvo orden explícita del usuario.
- El agente puede commitear, pero **nunca hace push**; subir es decisión del usuario.

Fuente: marco de trabajo v3.1, `06-metodologia/08-marco-v3/01-marco/10-trazabilidad-con-git.md` (00-brain).
