# Contenido de plantillas de puesto — formato v1

Guía para quien escribe puestos tipo. HU: VLRH-H1792026425571 (CAP VLRH-C0197, EPIC VLRH-E0046).

Esta carpeta guarda el contenido de plantillas que Valanserh ofrece a sus clientes. El contenido
lo escriben Wilvardo y Claude a partir de fuentes públicas y criterio propio; un importador lo
carga después (VLRH-H1792026438056). Aquí no hay nada de ninguna empresa ni de sus empleados.

La única definición ejecutable del formato es el esquema
`app/modules/position-templates/validators/position_template_file.validator.ts` y las constantes
`app/constants/position_template_format.ts` y `app/constants/competency_standard_levels.ts`. Esta
guía lo explica; si algo no coincide, manda el código y la guía se corrige.

## 1. Cómo se revisa

```
node ace position-templates:validate                      # toda esta carpeta
node ace position-templates:validate database/data/position_templates/puestos_hoteleria.json
```

- Solo lee: nunca corrige, completa ni carga nada, y no necesita base de datos.
- Revisa juntos todos los `.json` de la carpeta (sin subcarpetas) y reporta **todos** los
  hallazgos de una vez, cada uno como `[código] archivo#ruta.del.dato: detalle`.
- Con un archivo suelto, los demás `.json` de su carpeta cuentan como contexto (para detectar
  código y versión repetidos), pero solo se reporta lo del archivo pedido.
- Sale con código 1 ante cualquier hallazgo, y también si no encuentra ningún `.json`: mientras
  esta carpeta solo tenga esta guía, la revisión falla. Es a propósito: nunca da por bueno lo que
  no revisó.
- Solo acepta archivos `.json` dentro del repo, sin enlaces simbólicos.
- Un archivo con errores de esquema no muestra todavía sus campos desconocidos: aparecen en la
  siguiente corrida, una vez corregidos los primeros.

El catálogo completo de hallazgos (`TPL.VAL.*`) está en `app/constants/position_template_error_codes.ts`.

## 2. El archivo

Un archivo es un objeto JSON con este sobre:

| Campo | Obligatorio | Regla |
|---|---|---|
| `version_formato` | sí | Exactamente el número `1` (no el texto `"1"`). Versiona el esquema, no el contenido |
| `idioma` | sí | `"es"`. Todo el contenido va en español |
| `descripcion` | no | Nota libre para quien lee el archivo, 1 a 500 caracteres |
| `puestos` | no | Lista de 0 a 500 puestos tipo |

El archivo debe traer al menos una lista con elementos. Nombre de archivo sugerido:
`puestos_<giro>.json` en kebab o snake case, sin acentos ni espacios.

Reglas que aplican a todo el archivo:

- **Nada de `null`.** Si un dato opcional no aplica, se omite la clave.
- **Nada de campos inventados.** Una clave que el formato no define (por ejemplo `requisito` en
  lugar de `requisitos`) es un hallazgo, no se ignora.
- **Sin datos de clientes.** Nada de empresas, empleados, ids numéricos ni salarios. Esto lo cuida
  la revisión humana de Wilvardo, no la automática.

## 3. Atribución: en cada dato

Cada sección de texto y cada función, competencia, herramienta y certificación lleva:

```json
"atribucion": { "fuente": "onet", "id_en_fuente": "53-2012.00", "adaptado": true }
```

| Campo | Regla |
|---|---|
| `fuente` | Una de las claves de la tabla de fuentes (sección 7) |
| `id_en_fuente` | Identificador del dato en esa fuente (código O*NET-SOC, código SINCO, URI o código ESCO, código EC de CONOCER, tipo de licencia AFAC, tipo de constancia DC-3). Obligatorio salvo con `propio`; **prohibido** con `propio` |
| `adaptado` | `true` o `false`, booleano. `true` si el texto se tradujo o se modificó. **Traducir es adaptar**: todo lo tomado de O*NET y traducido al español va con `true` |

Si la descripción o el objetivo son redacción propia, la fuente es `propio`.

## 4. El puesto tipo

```json
{
  "codigo": "pt-hot-recepcionista",
  "version": 1,
  "estado": "en_revision",
  "nombre": "Recepcionista de hotel",
  "codigo_sinco": "4213",
  "alcance": "giro",
  "giros": ["hoteleria"],
  "descripcion": { "texto": "…", "atribucion": { … } },
  "objetivo": { "texto": "…", "atribucion": { … } },
  "requisitos": { "texto": "…", "atribucion": { … } },
  "funciones": [ … ],
  "competencias": [ … ],
  "herramientas": [ … ],
  "certificaciones": [ … ]
}
```

| Campo | Obligatorio | Regla |
|---|---|---|
| `codigo` | sí | Identificador estable, en minúsculas con guiones (`pt-<giro>-<puesto>`), 2 a 60 caracteres. **Nunca cambia** entre versiones |
| `version` | sí | Entero desde 1. Ver sección 6 |
| `estado` | sí | `en_revision` o `estandar`. Solo Wilvardo pasa un puesto a `estandar` |
| `nombre` | sí | 1 a 100 caracteres |
| `codigo_sinco` | sí | Código de **grupo unitario** de SINCO 2019 del INEGI: 4 dígitos |
| `alcance` | sí | `transversal` (aplica a todo giro) o `giro` |
| `giros` | según alcance | Con `alcance: giro`, de 1 a 20 códigos de giro. Con `transversal`, la clave no va |
| `descripcion` | sí | `{ texto, atribucion }`, texto de 1 a 5000 caracteres |
| `objetivo` | sí | `{ texto, atribucion }`, igual que la descripción |
| `requisitos` | no | `{ texto, atribucion }`, igual que la descripción |
| `funciones` | sí | 1 a 30 funciones específicas |
| `competencias` | sí | 1 a 20 competencias |
| `herramientas` | no | 0 a 30 herramientas de trabajo |
| `certificaciones` | no | 0 a 20 certificaciones requeridas |

KPIs y valores **no** forman parte del puesto tipo.

Dentro de un mismo puesto no se repite una función, competencia, herramienta ni certificación.
Dos nombres son el mismo si coinciden sin importar mayúsculas, acentos ni espacios de más
("Liderazgo", "  LIDERAZGO " y "Líderazgo" son el mismo).

### Funciones

`{ "nombre": "…", "frecuencia": "Diaria", "atribucion": { … } }`

- `nombre`: 1 a 500 caracteres, redactado como acción ("Registrar la entrada y salida de huéspedes").
- `frecuencia`: obligatoria, 1 a 100 caracteres ("Diaria", "Semanal", "Mensual", "Por evento").
  El sistema la exige al registrar las funciones de un puesto.

### Competencias

`{ "nombre": "…", "tipo": "technical", "nivel_esperado": 4, "atribucion": { … } }`

- `nombre`: 1 a 255 caracteres.
- `tipo`: `technical` (técnica) o `functional` (funcional). Ningún otro.
- Una misma competencia tiene **el mismo tipo en todo el contenido**: si "Liderazgo" es
  `functional` en un puesto, lo es en todos.
- `nivel_esperado`: número entero de la escala estándar (sección 5).

### Herramientas de trabajo

```json
{
  "nombre": "Computadora de escritorio",
  "tipo_activo_sugerido": { "nombre": "Equipo de cómputo", "categoria_teletrabajo": "computing_equipment" },
  "atribucion": { … }
}
```

- `nombre`: 1 a 255 caracteres.
- `tipo_activo_sugerido.nombre`: obligatorio, 1 a 100 caracteres. Cada empresa tiene sus propios
  tipos de activo; este nombre sirve para encontrar o crear el que corresponda.
- `tipo_activo_sugerido.categoria_teletrabajo`: solo cuando aplica. `ergonomic_chair` (silla
  ergonómica), `computing_equipment` (equipo de cómputo) o `accessory` (accesorio).

### Certificaciones requeridas

```json
{
  "nombre": "Licencia de piloto comercial",
  "categoria": "operacion",
  "emisor": "AFAC",
  "id_en_emisor": "piloto-comercial",
  "atribucion": { … }
}
```

- `nombre`: 1 a 200 caracteres.
- `categoria`: `seguridad`, `operacion`, `tecnico` o `administrativo`.
- `emisor`: la **autoridad que respalda** la certificación, no quien firma el documento:
  - Constancia DC-3: la expide el patrón o un agente capacitador registrado ante la STPS; se
    registra con emisor `STPS`.
  - Certificado de competencia de CONOCER: lo expide una entidad de certificación acreditada; se
    registra con emisor `CONOCER` y el código del estándar en `id_en_emisor`.
  - Licencia aeronáutica: emisor `AFAC` y el tipo de licencia en `id_en_emisor`.
- `id_en_emisor`: cuando lo tiene, 1 a 100 caracteres (código EC de CONOCER, tipo de licencia AFAC).

## 5. Escala estándar de niveles

Toda competencia expresa su nivel esperado en esta escala de 5 niveles ordenados. Cada empresa
puede tener su propia escala: el importador traduce el nivel por posición.

| `nivel_esperado` | Nivel |
|---|---|
| 1 | Inicial |
| 2 | Básico |
| 3 | Intermedio |
| 4 | Avanzado |
| 5 | Experto |

Va como número (`4`), nunca como texto (`"4"`). Ningún otro valor es válido.

## 6. Versiones

- La pareja `codigo` + `version` es única en todo el contenido, entre todos los archivos.
- **Una versión publicada no se edita.** Todo cambio a un puesto tipo se publica como una
  versión nueva con el mismo `codigo` y `version` + 1, **incluido un cambio solo de estado**
  (de `en_revision` a `estandar`).
- Reordenar puestos o moverlos entre archivos no sube la versión.
- Lo que una empresa ya copió de una versión anterior no cambia: las plantillas se aplican como
  copias que conservan su origen (código y versión).
- La revisión automática detecta código y versión repetidos; que una versión publicada no se
  haya editado lo cuida la revisión del PR de contenido.

## 7. Fuentes y crédito

| `fuente` | Fuente | Qué citar |
|---|---|---|
| `sinco_2019` | Sistema Nacional de Clasificación de Ocupaciones 2019, INEGI | "Fuente: INEGI, Sistema Nacional de Clasificación de Ocupaciones (SINCO) 2019" |
| `scian_2023` | Sistema de Clasificación Industrial de América del Norte 2023, INEGI | "Fuente: INEGI, Sistema de Clasificación Industrial de América del Norte (SCIAN) 2023" |
| `esco` | ESCO, Comisión Europea | Reconocer la fuente, indicar los cambios y no distorsionar el sentido original |
| `onet` | O*NET 31.0 Database, USDOL/ETA | Crédito CC BY 4.0, abajo |
| `conocer` | Registro Nacional de Estándares de Competencia, CONOCER | Código y nombre del estándar. Se parafrasea y se cita |
| `afac` | Agencia Federal de Aviación Civil | Ley de Aviación Civil y disposiciones de la AFAC |
| `stps_dc3` | Constancia DC-3, STPS | Acuerdo de capacitación (DOF 14-06-2013) |
| `propio` | Redacción propia de GSTI / Valanserh | Sin identificador |

La cita, licencia y URL de cada fuente viven una sola vez en `POSITION_TEMPLATE_SOURCES`
(`app/constants/position_template_format.ts`).

### INEGI

Los términos de libre uso del INEGI permiten uso comercial. Piden citar la fuente como en la
tabla, avisar cuando la información se analizó o transformó, y no presentarla como postura
oficial del INEGI.

### O*NET (CC BY 4.0)

La licencia permite copiar y adaptar si se da crédito, se enlaza la licencia y se indica qué se
modificó. Todo lo que se publique con datos de O*NET lleva este crédito, en inglés como lo exige
la licencia, con la versión de la base usada:

> This page includes information from the O*NET 31.0 Database by the U.S. Department of Labor,
> Employment and Training Administration (USDOL/ETA). Used under the CC BY 4.0 license. O*NET® is
> a trademark of USDOL/ETA. GSTI / Valanserh has modified all or some of this information.
> USDOL/ETA has not approved, endorsed, or tested these modifications.

Versión en español, que acompaña al crédito y no lo sustituye:

> Esta página incluye información de la base de datos O*NET 31.0 del Departamento del Trabajo de
> los Estados Unidos, Administración de Empleo y Capacitación (USDOL/ETA). Se usa bajo la licencia
> CC BY 4.0. O*NET® es una marca registrada de USDOL/ETA. GSTI / Valanserh modificó toda o parte de
> esta información. USDOL/ETA no aprobó, respaldó ni probó estas modificaciones.

Las dos últimas oraciones van solo si hubo adaptación; como traducir es adaptar, en la práctica
siempre van. Al nombrar O*NET se usa el símbolo de marca registrada y el nombre como adjetivo
("la base O*NET", nunca "las O*NETs" ni "de O*NET's"). Lo adaptado nunca se presenta como postura
oficial de la fuente.

## 8. Cuidados al escribir

- El lint de terminología del repo (`npm run lint:terminology`) revisa los `.json` y rechaza
  palabras que empiezan con "psico" y nombres de pruebas de personalidad o de inteligencia. Donde
  la AFAC habla de aptitud de esa clase, escribe "aptitud física y mental".
- Los códigos SINCO, O*NET-SOC, ESCO, CONOCER y AFAC se verifican contra el catálogo oficial antes
  de escribirlos. El formato solo valida su forma.
- El ejemplo `tests/fixtures/position_templates/valid_example.json` muestra un archivo válido con
  datos ilustrativos: sirve de molde, pero sus códigos no se copian a contenido real.
