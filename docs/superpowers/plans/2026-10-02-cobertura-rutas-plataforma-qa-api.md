# Prueba manual API — Cobertura regulatoria y marco regulatorio solo para la consola de plataforma

**Problema:** la cobertura regulatoria (qué tanto del producto cubre cada norma) y el marco regulatorio (autoridades, normas y numerales) son información interna de quien administra la plataforma, pero estaban publicados junto al resto de las consultas de las empresas clientes y se abrían con un permiso que cualquier empresa podía darle a sus roles. Una empresa cliente podía acabar leyendo el análisis de cobertura del producto.

**Solución:** las **ocho consultas** ahora viven solo en la consola de plataforma y solo las abre quien entra con la **sesión de la consola** siendo administrador de plataforma. Ni la cuenta propietaria de una empresa, ni un rol al que la empresa le haya concedido antes el permiso, ni siquiera un administrador de plataforma que entre por el backoffice pueden leerlas. Las direcciones anteriores desaparecieron, y la entrada «Cobertura regulatoria» se retiró del catálogo de funcionalidades de las empresas. Los avisos propios de cada consulta (identificador mal escrito, norma que no existe) se quedan tal cual.

Ejemplo: es como el cuaderno donde la directora anota qué materias ya tienen maestro y cuáles no; antes estaba en el pizarrón del pasillo y cualquier grupo con un pase especial podía leerlo, ahora está bajo llave en la dirección y la puerta del pasillo ya no existe.

## Glosario

- **`Cobertura regulatoria`**: qué porción de las obligaciones de una norma ya resuelve alguna funcionalidad del producto.
- **`Marco regulatorio`**: el catálogo de autoridades (quien emite las reglas), normas (las reglas) y numerales (cada obligación dentro de una norma).
- **`Norma`**: un documento oficial con obligaciones para las empresas; en esta base hay dos: `NOM-035-STPS` y `NOM-037-STPS`.
- **`Numeral`**: cada punto concreto de una norma, por ejemplo el `5.8.a`.
- **`Panel de plataforma`** (consola de plataforma): el panel exclusivo de quienes administran el sistema; se entra con su propio inicio de sesión.
- **`Usuario de plataforma`**: una persona del equipo que administra el sistema, no de una empresa cliente.
- **`Empresa cliente`**: cada empresa dada de alta en el sistema, con su cuenta propietaria y sus propios usuarios.
- **`Backoffice`**: el panel que usan las empresas clientes; se entra con otro inicio de sesión.
- **`Estado de una funcionalidad`**: en qué etapa está la funcionalidad que cubre un numeral (ver Escenario 1).

Se prueba con un cliente de API (Postman, Insomnia, Bruno).

**URL base:** `http://127.0.0.1:3333`

**Headers de todas las peticiones:** `Accept-Language: es` (los textos de los avisos salen en español). **No** envíes `X-Business-Unit-Id`: son consultas de plataforma y no lo llevan.

**Con qué token se prueba.** Esta historia vive de la diferencia entre las dos sesiones, así que sí se documenta cómo obtener cada una (el token sale en `data.token` y se envía en `Authorization: Bearer <token>`):

- **Token de la consola de plataforma** — `POST /api/platform/auth/login`.
- **Token del backoffice** — `POST /api/auth/login`.

Ambos con un cuerpo de esta forma (el correo lo indica cada escenario):

```json
{ "userEmail": "<correo>", "userPassword": "password" }
```

## 1. Preparar

Prerrequisito de ambiente: el despliegue de esta historia ya corrido en la base local, es decir, `0062_system_module_seeder` (la semilla del catálogo de funcionalidades, que da de baja la entrada «Cobertura regulatoria»). Sin él, esa entrada sigue viva y el Escenario 3 no puede comprobar que el permiso quedó sin efecto.

Ejecutar el seeder compartido **contra la misma base que el API local de pruebas** (`sae_pruebas`). Si solo corres `node ace db:seed` sin `NODE_ENV=test`, los datos caen en la base de desarrollo (`sae_principal_db` en el `.env` típico) y las consultas en `sae_pruebas` —o el Escenario 3— salen vacías:

```bash
NODE_ENV=test node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Volver a correrlo deja todo otra vez como al inicio. Al terminar debe aparecer en consola la línea `[qa-seeder] cobertura-plataforma: empresa QA Cobertura…` **sin** el aviso de que falta el permiso `read` del módulo.

Deja una empresa cliente llamada **`QA Cobertura`**, un rol de esa empresa llamado **`QA Cobertura Lector`** con el permiso de lectura de cobertura regulatoria concedido de antes, y cuatro usuarios.

**Login por producto** (el cuerpo y el token son los ya descritos arriba; en la tabla solo indica qué producto usar):

- **Consola de plataforma** — `POST /api/platform/auth/login`
- **Backoffice** — `POST /api/auth/login`

| | Correo | Contraseña | Login (producto) | Variante |
|---|---|---|---|---|
| **A** | `qa-cobertura-plataforma@gsti-tests.local` | `password` | Consola de plataforma | Administrador de plataforma por consola: el único que puede leer las ocho rutas |
| **B** | `qa-cobertura-owner-bo@gsti-tests.local` | `password` | Backoffice | Cuenta propietaria de `QA Cobertura` |
| **C** | `qa-cobertura-rol-concedido-bo@gsti-tests.local` | `password` | Backoffice | Usuario de `QA Cobertura` con el rol `QA Cobertura Lector` (permiso concedido de antes, ya sin efecto) |
| **D** | `qa-cobertura-plataforma-bo@gsti-tests.local` | `password` | Backoffice | Administrador de plataforma que **no** entra por la consola (misma cuenta, otro producto) |

**Identificadores de las normas.** Las direcciones de este manual llevan el identificador de `NOM-035-STPS`; no lo escribas de memoria, obtenlo así:

```sql
SELECT regulation_code, regulation_id
FROM regulations
WHERE regulation_code IN ('NOM-035-STPS', 'NOM-037-STPS')
ORDER BY regulation_code;
```

Resultado: 2 filas. En las direcciones se escribe `<id de NOM-035-STPS>`, y en las respuestas `<id de NOM-037-STPS>`, con el número que te devolvió cada fila.

**Lo que trae la base sembrada.** Las consultas leen el marco regulatorio global (no depende de ninguna empresa), con dos normas, `NOM-035-STPS` (35 numerales evaluables) y `NOM-037-STPS` (38), ambas de la autoridad `stps`. Hoy **ninguna funcionalidad del producto está ligada todavía a un numeral**, así que toda la cobertura sale en cero; lo que depende de tener funcionalidades ligadas no se puede provocar aquí y se declara en la sección «Lo que no se revisa aquí».

**Identificadores internos.** Donde la respuesta trae un número interno de la base (el `id` de una autoridad, de un numeral…), este manual escribe `"..."`: cambia de una base a otra y no se compara.

## 2. Escenarios

### Escenario 1 — La consola de plataforma lee las ocho consultas

Objetivo: comprobar que quien administra la plataforma, entrando por la consola, recibe las ocho consultas con su contenido completo.

Usuario: **A** (token de la consola). Antes, obtén el token: `POST /api/platform/auth/login` con `qa-cobertura-plataforma@gsti-tests.local`.

Todas llevan `Authorization: Bearer <token de A>`.

**Paso 1 — Lista de cobertura por norma.**

**Endpoint:** `GET /api/platform/regulatory-coverage`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Recursos",
  "message": "Los recursos fueron encontrados con éxito",
  "data": {
    "regulations": [
      {
        "regulationId": "<id de NOM-035-STPS>",
        "regulationCode": "NOM-035-STPS",
        "regulationTitle": "NOM-035-STPS-2018: Factores de riesgo psicosocial en el trabajo — Identificación, análisis y prevención",
        "regulationType": "NOM",
        "regulationVersion": "2018",
        "regulationStatus": "vigente",
        "authority": { "slug": "stps", "shortName": "STPS" },
        "evaluableClauses": 35,
        "coveredTotal": 0,
        "coveredPartial": 0,
        "uncovered": 35,
        "coveragePercentage": 0
      },
      {
        "regulationId": "<id de NOM-037-STPS>",
        "regulationCode": "NOM-037-STPS",
        "regulationTitle": "NOM-037-STPS-2023: Teletrabajo — Condiciones de seguridad y salud en el trabajo",
        "regulationType": "NOM",
        "regulationVersion": "2023",
        "regulationStatus": "vigente",
        "authority": { "slug": "stps", "shortName": "STPS" },
        "evaluableClauses": 38,
        "coveredTotal": 0,
        "coveredPartial": 0,
        "uncovered": 38,
        "coveragePercentage": 0
      }
    ]
  }
}
```

Qué significa cada dato:

- `type`: cómo resultó la consulta. En las consultas que funcionan solo puede valer `success` (la consulta se hizo); los avisos de error de los demás escenarios traen otro formato, que se explica ahí.
- `title` / `message`: el encabezado y la frase de la respuesta correcta; son los mismos en las ocho consultas.
- `data.regulations`: una fila por norma vigente.
- `regulationId`: el identificador de la norma, el mismo que devolvió la consulta de Preparar.
- `regulationCode` / `regulationTitle` / `regulationVersion`: el código, el nombre completo y el año de la versión de la norma.
- `regulationType`: la clase de documento; aquí `NOM` (Norma Oficial Mexicana).
- `regulationStatus`: puede valer `vigente` (la norma rige hoy). Solo se listan normas vigentes.
- `authority`: quién emite la norma; `slug` es su clave corta y `shortName` sus siglas.
- `evaluableClauses`: cuántos numerales de la norma se pueden medir contra el producto.
- `coveredTotal`: cuántos de esos numerales ya los resuelve por completo alguna funcionalidad.
- `coveredPartial`: cuántos los resuelve solo en parte.
- `uncovered`: cuántos no los resuelve ninguna funcionalidad. Los tres conteos siempre suman `evaluableClauses`.
- `coveragePercentage`: el porcentaje de numerales cubiertos, de 0 a 100. Es un número, o `null` cuando la norma no tiene ningún numeral medible (no se puede provocar aquí). Con la base sembrada vale `0`: nada está cubierto todavía.

**Paso 2 — Resumen ejecutivo.**

**Endpoint:** `GET /api/platform/regulatory-coverage/summary`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Recursos",
  "message": "Los recursos fueron encontrados con éxito",
  "data": {
    "aggregate": {
      "evaluableClauses": 73,
      "coveragePercentage": { "disponible": 0, "enDesarrollo": 0, "planeado": 0 }
    },
    "regulations": [
      {
        "regulationId": "<id de NOM-035-STPS>",
        "regulationCode": "NOM-035-STPS",
        "regulationTitle": "NOM-035-STPS-2018: Factores de riesgo psicosocial en el trabajo — Identificación, análisis y prevención",
        "regulationVersion": "2018",
        "authority": { "slug": "stps", "shortName": "STPS" },
        "evaluableClauses": 35,
        "coveragePercentage": { "disponible": 0, "enDesarrollo": 0, "planeado": 0 }
      },
      {
        "regulationId": "<id de NOM-037-STPS>",
        "regulationCode": "NOM-037-STPS",
        "regulationTitle": "NOM-037-STPS-2023: Teletrabajo — Condiciones de seguridad y salud en el trabajo",
        "regulationVersion": "2023",
        "authority": { "slug": "stps", "shortName": "STPS" },
        "evaluableClauses": 38,
        "coveragePercentage": { "disponible": 0, "enDesarrollo": 0, "planeado": 0 }
      }
    ]
  }
}
```

Qué significa lo nuevo aquí:

- `aggregate`: el total de todas las normas juntas. Su `evaluableClauses` es la suma de las de cada norma (`35 + 38 = 73`).
- `coveragePercentage` con tres claves: el porcentaje de numerales cubiertos según la etapa de la funcionalidad que los cubre. `disponible`: solo cuenta las funcionalidades ya liberadas; `enDesarrollo`: suma también las que se están construyendo; `planeado`: suma también las que solo están en el plan. Cada una es un número de 0 a 100, o `null` si no hay numerales medibles (no se puede provocar aquí).
- (Los demás datos son los ya explicados en el Paso 1.)

**Paso 3 — Detalle de cobertura de una norma.**

**Endpoint:** `GET /api/platform/regulatory-coverage/<id de NOM-035-STPS>`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Recursos",
  "message": "Los recursos fueron encontrados con éxito",
  "data": {
    "regulation": {
      "regulationId": "<id de NOM-035-STPS>",
      "code": "NOM-035-STPS",
      "title": "NOM-035-STPS-2018: Factores de riesgo psicosocial en el trabajo — Identificación, análisis y prevención",
      "type": "NOM",
      "version": "2018",
      "status": "vigente",
      "authority": { "slug": "stps", "shortName": "STPS" },
      "evaluableClauses": 35,
      "coveredTotal": 0,
      "coveredPartial": 0,
      "uncovered": 35,
      "coveragePercentage": 0
    },
    "clauses": [
      {
        "regulationClauseId": "...",
        "code": "5.1.1",
        "titleKey": null,
        "obligationKey": "La política de prevención de riesgos psicosociales debe contemplar la prevención de los factores de riesgo psicosocial.",
        "explanationKey": "Incluir explícitamente en la política la intención de identificar y controlar los factores de riesgo psicosocial.",
        "bestCoverage": null,
        "features": []
      },
      "... 3 numerales más: 5.2.1, 5.3.1 y 5.4.1 ...",
      {
        "regulationClauseId": "...",
        "code": "5.8.a",
        "titleKey": null,
        "obligationKey": "Los resultados de la identificación y análisis de los factores de riesgo psicosocial y, además, tratándose de centros de trabajo de más de 50 trabajadores, de las evaluaciones del entorno organizacional.",
        "explanationKey": "Archivar los instrumentos aplicados, los resultados crudos y los informes de análisis de cada ciclo de evaluación.",
        "bestCoverage": null,
        "features": []
      },
      "... 30 numerales más, con la misma forma ..."
    ]
  }
}
```

La lista `clauses` trae los 35 numerales de la norma, todos con la misma forma (aquí se muestran el primero y el `5.8.a`).

Qué significa lo nuevo aquí:

- `data.regulation`: la cabecera de la norma, con los mismos conteos del Paso 1 (cambian de nombre las llaves: `code`, `title`, `type`, `version`, `status`).
- `clauses`: un renglón por numeral de la norma.
- `regulationClauseId`: el identificador interno del numeral.
- `code`: el número del numeral dentro de la norma.
- `titleKey`: el título del numeral; `null` cuando el numeral no tiene título propio.
- `obligationKey` / `explanationKey`: lo que la norma obliga a hacer y una explicación en palabras sencillas de cómo cumplirlo.
- `bestCoverage`: el mejor grado con que alguna funcionalidad ya liberada cubre el numeral. Puede valer `total` (lo resuelve por completo), `parcial` (lo resuelve solo en parte) o `null` (ninguna funcionalidad lo cubre; es el único valor que se ve con la base sembrada, `total` y `parcial` no se pueden provocar aquí).
- `features`: las funcionalidades ligadas al numeral; con la base sembrada siempre `[]` (ninguna). Cuando trae elementos, cada uno indica la etapa de la funcionalidad (ver la sección «Lo que no se revisa aquí»).

**Paso 4 — Lista de autoridades.**

**Endpoint:** `GET /api/platform/regulatory-authorities`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Recursos",
  "message": "Los recursos fueron encontrados con éxito",
  "data": [
    {
      "id": "...",
      "slug": "consar",
      "shortName": "CONSAR",
      "fullName": "Comisión Nacional del Sistema de Ahorro para el Retiro",
      "countryCode": "MX",
      "jurisdiction": "federal",
      "description": "La Comisión Nacional del Sistema de Ahorro para el Retiro (CONSAR) regula y supervisa el Sistema de Ahorro para el Retiro (SAR), incluyendo las AFORES y SIEFORES que administran el ahorro para el retiro de los trabajadores.",
      "website": "https://www.gob.mx/consar",
      "icon": "consar",
      "brandColor": "#00703C",
      "regulationsCount": 0
    },
    "... 7 autoridades más, con la misma forma ..."
  ]
}
```

La lista trae **8 autoridades**, ordenadas por `slug`: `consar`, `imss`, `inai`, `infonavit`, `jfca`, `repse`, `sat` y `stps`. Todas con `regulationsCount` en `0`, menos `stps`, que vale `2`.

Qué significa cada dato:

- `data`: una fila por autoridad.
- `slug` / `shortName` / `fullName`: la clave corta, las siglas y el nombre completo de la autoridad.
- `countryCode`: el país de la autoridad, en dos letras (`MX`, México).
- `jurisdiction`: el nivel de gobierno de la autoridad; aquí `federal`.
- `description`: para qué existe la autoridad.
- `website`: su página oficial.
- `icon` / `brandColor`: el ícono y el color con que la consola la dibuja.
- `regulationsCount`: cuántas normas de esta autoridad hay en el catálogo.

**Paso 5 — Detalle de una autoridad.**

**Endpoint:** `GET /api/platform/regulatory-authorities/stps`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Recursos",
  "message": "Los recursos fueron encontrados con éxito",
  "data": {
    "id": "...",
    "slug": "stps",
    "shortName": "STPS",
    "fullName": "Secretaría del Trabajo y Previsión Social",
    "countryCode": "MX",
    "jurisdiction": "federal",
    "description": "La Secretaría del Trabajo y Previsión Social (STPS) es la dependencia del gobierno federal mexicano responsable de promover el empleo, regular las relaciones laborales y garantizar condiciones de trabajo dignas y seguras para los trabajadores.",
    "auditDescription": "La STPS emite Normas Oficiales Mexicanas (NOM) de seguridad y salud en el trabajo, realiza inspecciones laborales y sanciona incumplimientos. Sus normas son de observancia obligatoria para todos los centros de trabajo en México.",
    "website": "https://www.gob.mx/stps",
    "icon": "stps",
    "brandColor": "#C8102E",
    "regulations": [
      {
        "id": "<id de NOM-035-STPS>",
        "code": "NOM-035-STPS",
        "title": "NOM-035-STPS-2018: Factores de riesgo psicosocial en el trabajo — Identificación, análisis y prevención",
        "type": "NOM",
        "version": "2018",
        "status": "vigente",
        "publicationDate": "2018-10-23",
        "effectiveDate": "2019-10-23",
        "lastRevisionDate": null,
        "scopeDescription": "...",
        "officialUrl": "https://dof.gob.mx/nota_detalle.php?codigo=5541687&fecha=23/10/2018"
      },
      {
        "id": "<id de NOM-037-STPS>",
        "code": "NOM-037-STPS",
        "title": "NOM-037-STPS-2023: Teletrabajo — Condiciones de seguridad y salud en el trabajo",
        "type": "NOM",
        "version": "2023",
        "status": "vigente",
        "publicationDate": "2023-06-08",
        "effectiveDate": "2023-12-05",
        "lastRevisionDate": null,
        "scopeDescription": "...",
        "officialUrl": "https://dof.gob.mx/nota_detalle.php?codigo=5690434&fecha=08/06/2023"
      }
    ]
  }
}
```

Qué significa lo nuevo aquí:

- `auditDescription`: lo que la autoridad suele revisar y sancionar en una inspección.
- `regulations`: las normas de esa autoridad (aquí las dos de la base).
- `publicationDate` / `effectiveDate`: el día en que se publicó la norma y el día en que empezó a regir.
- `lastRevisionDate`: el día de su última revisión; `null` quiere decir que no ha tenido ninguna.
- `scopeDescription`: a quién aplica la norma (texto largo, aquí `"..."`).
- `officialUrl`: la liga al documento oficial.
- (Los demás datos son los ya explicados en el Paso 4.)

**Paso 6 — Una norma con su árbol de numerales.**

**Endpoint:** `GET /api/platform/regulations/NOM-035-STPS`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Recursos",
  "message": "Los recursos fueron encontrados con éxito",
  "data": {
    "id": "<id de NOM-035-STPS>",
    "code": "NOM-035-STPS",
    "title": "NOM-035-STPS-2018: Factores de riesgo psicosocial en el trabajo — Identificación, análisis y prevención",
    "type": "NOM",
    "version": "2018",
    "status": "vigente",
    "publicationDate": "2018-10-23",
    "effectiveDate": "2019-10-23",
    "lastRevisionDate": null,
    "scopeDescription": "...",
    "generalAuditDescription": "...",
    "officialUrl": "https://dof.gob.mx/nota_detalle.php?codigo=5541687&fecha=23/10/2018",
    "retentionMinYears": 4,
    "authority": { "id": "...", "slug": "stps", "shortName": "STPS" },
    "clausesTree": [
      {
        "id": "...",
        "code": "5",
        "ord": 1,
        "parentId": null,
        "title": "Capítulo 5 — Obligaciones del empleador",
        "obligation": "...",
        "explanation": "...",
        "rationale": "...",
        "auditCriteria": "...",
        "applicability": null,
        "children": [
          "... los numerales 5.1 a 5.7, con la misma forma ...",
          {
            "id": "...",
            "code": "5.8",
            "ord": 8,
            "parentId": "...",
            "title": "5.8 — Registros y conservación de información",
            "obligation": "...",
            "explanation": "...",
            "rationale": "...",
            "auditCriteria": "...",
            "applicability": null,
            "children": [
              { "code": "5.8.a", "ord": 1, "children": [], "...": "..." },
              { "code": "5.8.b", "ord": 2, "children": [], "...": "..." },
              { "code": "5.8.c", "ord": 3, "children": [], "...": "..." }
            ]
          }
        ]
      },
      {
        "id": "...",
        "code": "8",
        "ord": 2,
        "parentId": null,
        "title": "Capítulo 8 — Evaluación de la conformidad",
        "children": [ "..." ],
        "...": "..."
      }
    ]
  }
}
```

Qué significa lo nuevo aquí:

- `generalAuditDescription`: cómo audita y sanciona la autoridad esta norma en general.
- `retentionMinYears`: cuántos años mínimo se deben conservar los registros que la norma exige.
- `authority`: igual que antes, con su identificador interno.
- `clausesTree`: los numerales de la norma como árbol. En la raíz hay dos capítulos (`5` y `8`); cada numeral puede traer dentro de `children` sus numerales hijos (el `5.8` trae `5.8.a`, `5.8.b` y `5.8.c`), y los que ya no tienen hijos traen `[]`.
- `ord`: la posición del numeral entre sus hermanos.
- `parentId`: el numeral del que cuelga; `null` en los capítulos de la raíz.
- `obligation` / `explanation`: lo que obliga el numeral y cómo cumplirlo.
- `rationale`: por qué existe esa obligación.
- `auditCriteria`: qué revisa el inspector para dar por cumplido el numeral.
- `applicability`: a quién aplica en particular; `null` cuando aplica a todos.
- (Los demás datos son los ya explicados en los Pasos 4 y 5.)

**Paso 7 — Un numeral.**

**Endpoint:** `GET /api/platform/regulations/NOM-035-STPS/clauses/5.8.a`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Recursos",
  "message": "Los recursos fueron encontrados con éxito",
  "data": {
    "id": "...",
    "code": "5.8.a",
    "ord": 1,
    "regulation": {
      "id": "<id de NOM-035-STPS>",
      "code": "NOM-035-STPS",
      "title": "NOM-035-STPS-2018: Factores de riesgo psicosocial en el trabajo — Identificación, análisis y prevención",
      "version": "2018"
    },
    "title": null,
    "obligation": "Los resultados de la identificación y análisis de los factores de riesgo psicosocial y, además, tratándose de centros de trabajo de más de 50 trabajadores, de las evaluaciones del entorno organizacional.",
    "explanation": "Archivar los instrumentos aplicados, los resultados crudos y los informes de análisis de cada ciclo de evaluación.",
    "rationale": "La retención de 4 años permite comparar tendencias entre ciclos y demuestra continuidad del programa ante la autoridad.",
    "auditCriteria": "Verificar que los registros de identificación y análisis están disponibles para los últimos 4 años de operación.",
    "applicability": null,
    "parent": { "id": "...", "code": "5.8", "title": "5.8 — Registros y conservación de información" },
    "children": [],
    "features": [],
    "evidenceRequirements": [
      {
        "id": "...",
        "type": "registro",
        "description": "Registros de la identificación y análisis de los factores de riesgo psicosocial: instrumentos aplicados, resultados individuales consolidados e informes de análisis de cada ciclo de evaluación, conservados durante un mínimo de 4 años.",
        "retentionYears": 4
      }
    ]
  }
}
```

Qué significa lo nuevo aquí:

- `regulation`: la norma a la que pertenece el numeral.
- `parent`: el numeral del que cuelga (aquí el `5.8`).
- `children`: sus numerales hijos; `[]` porque el `5.8.a` ya no tiene.
- `features`: las funcionalidades ligadas al numeral; `[]` con la base sembrada.
- `evidenceRequirements`: qué pruebas debe guardar la empresa para demostrar el cumplimiento de este numeral.
- `evidenceRequirements.type`: la clase de prueba; aquí `registro` (un registro guardado).
- `evidenceRequirements.description`: cuál es la prueba concreta.
- `evidenceRequirements.retentionYears`: cuántos años hay que conservarla.
- (Los demás datos son los ya explicados en el Paso 6.)

**Paso 8 — Funcionalidades de un numeral.**

**Endpoint:** `GET /api/platform/regulations/NOM-035-STPS/clauses/5.8.a/features`

**Response exacto:** `200`

```json
{
  "type": "success",
  "title": "Recursos",
  "message": "Los recursos fueron encontrados con éxito",
  "data": {
    "clause": { "id": "...", "code": "5.8.a" },
    "features": []
  }
}
```

Qué significa lo nuevo aquí:

- `clause`: el numeral consultado.
- `features`: las funcionalidades del producto que cubren el numeral. Es `[]` porque en esta base todavía ninguna está ligada; la consulta responde `200` con la lista vacía, no un error.

### Escenario 2 — La cuenta propietaria de una empresa cliente no recibe nada

Objetivo: lo mismo que el Escenario 1, pero con la cuenta propietaria de una empresa cliente entrando por el backoffice, para comprobar que las ocho consultas la rechazan y no le muestran ningún dato.

Usuario: **B** (token del backoffice). Antes, obtén el token: `POST /api/auth/login` con `qa-cobertura-owner-bo@gsti-tests.local`.

Todas llevan `Authorization: Bearer <token de B>`. Repite cada una de estas ocho direcciones:

| Paso | Endpoint |
|---|---|
| 1 | `GET /api/platform/regulatory-coverage` |
| 2 | `GET /api/platform/regulatory-coverage/summary` |
| 3 | `GET /api/platform/regulatory-coverage/<id de NOM-035-STPS>` |
| 4 | `GET /api/platform/regulatory-authorities` |
| 5 | `GET /api/platform/regulatory-authorities/stps` |
| 6 | `GET /api/platform/regulations/NOM-035-STPS` |
| 7 | `GET /api/platform/regulations/NOM-035-STPS/clauses/5.8.a` |
| 8 | `GET /api/platform/regulations/NOM-035-STPS/clauses/5.8.a/features` |

**Response exacto de cada una de las ocho:** `403`

```json
{
  "title": "Acceso restringido a plataforma",
  "detail": "Esta sección es exclusiva de administradores de plataforma.",
  "key": "AUTH.PLATFORM.FORBIDDEN"
}
```

Qué significa cada dato:

- `title` / `detail`: el encabezado y la frase del rechazo: la sección es solo para quienes administran la plataforma.
- `key`: clave fija del motivo; `AUTH.PLATFORM.FORBIDDEN` quiere decir que la sesión no es de la consola de plataforma.
- Este aviso no trae `type`, `code` ni `data`: no hay ningún dato de cobertura, de normas ni de autoridades.

### Escenario 3 — Un rol con el permiso concedido de antes tampoco recibe nada

Objetivo: lo mismo que el Escenario 2, pero con un usuario cuyo rol recibió de su empresa, antes de la baja, el permiso de leer cobertura regulatoria, para comprobar que ese permiso guardado ya no abre nada.

Usuario: **C** (token del backoffice). Antes, obtén el token: `POST /api/auth/login` con `qa-cobertura-rol-concedido-bo@gsti-tests.local`.

**Paso 1 — Las ocho consultas.** Repite las ocho direcciones de la tabla del Escenario 2 con `Authorization: Bearer <token de C>`.

**Response exacto de cada una de las ocho:** `403`, con el mismo cuerpo del Escenario 2.

(Los datos son los ya explicados en el Escenario 2.)

**Paso 2 — El permiso sigue guardado en el rol.** Que el rechazo no se deba a que el permiso falte: confírmalo en la base.

```sql
SELECT r.role_slug,
       sm.system_module_slug,
       sp.system_permission_slug
FROM role_system_permissions rsp
JOIN roles r
  ON r.role_id = rsp.role_id
JOIN system_permissions sp
  ON sp.system_permission_id = rsp.system_permission_id
JOIN system_modules sm
  ON sm.system_module_id = sp.system_module_id
WHERE r.role_slug = 'qa-cobertura-lector'
  AND rsp.role_system_permission_deleted_at IS NULL;
```

Resultado: 1 fila: `qa-cobertura-lector`, `regulatory-coverage`, `read` (el permiso de lectura de cobertura regulatoria sigue concedido al rol).

Si sale **vacío**, no es la sintaxis: casi siempre estás en **otra base** (`sae_principal_db` en lugar de `sae_pruebas`) o el seeder no corrió con `NODE_ENV=test`. Comprueba en este orden:

```sql
SELECT DATABASE();
```

Debe decir `sae_pruebas`. Si no, ejecuta `USE sae_pruebas;` y repite la consulta del Paso 2.

```sql
SELECT role_id, role_slug
FROM roles
WHERE role_slug = 'qa-cobertura-lector';
```

Debe dar **1 fila**. Si da 0, vuelve a correr el seeder de Preparar con `NODE_ENV=test` y busca en consola la línea `[qa-seeder] cobertura-plataforma:` **sin** el aviso de permiso `read` faltante.

**Paso 3 — La funcionalidad ya está dada de baja.** Y que el motivo sea que la funcionalidad ya no existe para las empresas:

```sql
SELECT system_module_slug,
       system_module_deleted_at IS NOT NULL AS dado_de_baja
FROM system_modules
WHERE system_module_slug = 'regulatory-coverage';
```

Resultado: 1 fila: `regulatory-coverage` con `dado_de_baja` en `1` (sí, la funcionalidad ya fue dada de baja; con `0` seguiría viva y el despliegue de Preparar no se aplicó).

### Escenario 4 — Un administrador de plataforma que entra por el backoffice

Objetivo: lo mismo que el Escenario 2, pero con una cuenta que **sí** es de administrador de plataforma, para comprobar que lo que abre las consultas es la sesión de la consola y no solo que la cuenta sea de administrador.

Usuario: **D** (token del backoffice). Antes, obtén el token: `POST /api/auth/login` con `qa-cobertura-plataforma-bo@gsti-tests.local`.

Repite las ocho direcciones de la tabla del Escenario 2 con `Authorization: Bearer <token de D>`.

**Response exacto de cada una de las ocho:** `403`, con el mismo cuerpo del Escenario 2.

(Los datos son los ya explicados en el Escenario 2.)

Contraste: con el usuario **A** entrando por `POST /api/platform/auth/login` (Escenario 1) el mismo tipo de cuenta sí recibe `200`.

### Escenario 5 — Las direcciones anteriores ya no existen

Objetivo: comprobar que las ocho direcciones por donde antes se leía esta información dejaron de existir, tanto para una sesión del backoffice como para quien llega sin sesión, y no solo que ahora pidan permiso.

Usuario: **B** (token del backoffice) y, en la segunda pasada, ninguno.

| Paso | Endpoint anterior |
|---|---|
| 1 | `GET /api/v1/regulatory-coverage` |
| 2 | `GET /api/v1/regulatory-coverage/summary` |
| 3 | `GET /api/v1/regulatory-coverage/<id de NOM-035-STPS>` |
| 4 | `GET /api/v1/regulatory-authorities` |
| 5 | `GET /api/v1/regulatory-authorities/stps` |
| 6 | `GET /api/v1/regulations/NOM-035-STPS` |
| 7 | `GET /api/v1/regulations/NOM-035-STPS/clauses/5.8.a` |
| 8 | `GET /api/v1/regulations/NOM-035-STPS/clauses/5.8.a/features` |

**Primera pasada:** cada una con `Authorization: Bearer <token de B>`.

**Response exacto de cada una de las 8 peticiones de la primera pasada:** `404`, con este cuerpo (el `message` es el de la tabla):

```json
{
  "message": "<message de la tabla>",
  "name": "Exception",
  "status": 404,
  "frames": [ "..." ]
}
```

| Paso | Endpoint | Status | `message` literal |
|---|---|---|---|
| 1.1 | `GET /api/v1/regulatory-coverage` | `404` | `Cannot GET:/api/v1/regulatory-coverage` |
| 1.2 | `GET /api/v1/regulatory-coverage/summary` | `404` | `Cannot GET:/api/v1/regulatory-coverage/summary` |
| 1.3 | `GET /api/v1/regulatory-coverage/<id de NOM-035-STPS>` | `404` | `Cannot GET:/api/v1/regulatory-coverage/<id de NOM-035-STPS>` |
| 1.4 | `GET /api/v1/regulatory-authorities` | `404` | `Cannot GET:/api/v1/regulatory-authorities` |
| 1.5 | `GET /api/v1/regulatory-authorities/stps` | `404` | `Cannot GET:/api/v1/regulatory-authorities/stps` |
| 1.6 | `GET /api/v1/regulations/NOM-035-STPS` | `404` | `Cannot GET:/api/v1/regulations/NOM-035-STPS` |
| 1.7 | `GET /api/v1/regulations/NOM-035-STPS/clauses/5.8.a` | `404` | `Cannot GET:/api/v1/regulations/NOM-035-STPS/clauses/5.8.a` |
| 1.8 | `GET /api/v1/regulations/NOM-035-STPS/clauses/5.8.a/features` | `404` | `Cannot GET:/api/v1/regulations/NOM-035-STPS/clauses/5.8.a/features` |

**Segunda pasada:** las mismas ocho, sin el header `Authorization`.

**Response exacto de cada una de las 8 peticiones de la segunda pasada:** `404`, con el mismo cuerpo de arriba y exactamente la misma tabla (el rechazo no cambia por llevar o no sesión):

| Paso | Endpoint | Status | `message` literal |
|---|---|---|---|
| 2.1 | `GET /api/v1/regulatory-coverage` | `404` | `Cannot GET:/api/v1/regulatory-coverage` |
| 2.2 | `GET /api/v1/regulatory-coverage/summary` | `404` | `Cannot GET:/api/v1/regulatory-coverage/summary` |
| 2.3 | `GET /api/v1/regulatory-coverage/<id de NOM-035-STPS>` | `404` | `Cannot GET:/api/v1/regulatory-coverage/<id de NOM-035-STPS>` |
| 2.4 | `GET /api/v1/regulatory-authorities` | `404` | `Cannot GET:/api/v1/regulatory-authorities` |
| 2.5 | `GET /api/v1/regulatory-authorities/stps` | `404` | `Cannot GET:/api/v1/regulatory-authorities/stps` |
| 2.6 | `GET /api/v1/regulations/NOM-035-STPS` | `404` | `Cannot GET:/api/v1/regulations/NOM-035-STPS` |
| 2.7 | `GET /api/v1/regulations/NOM-035-STPS/clauses/5.8.a` | `404` | `Cannot GET:/api/v1/regulations/NOM-035-STPS/clauses/5.8.a` |
| 2.8 | `GET /api/v1/regulations/NOM-035-STPS/clauses/5.8.a/features` | `404` | `Cannot GET:/api/v1/regulations/NOM-035-STPS/clauses/5.8.a/features` |

Qué significa cada dato:

- Status `404`: la dirección no existe. Es lo que se revisa; no es `401` ni `403`, porque ya no hay ninguna sección que proteger.
- `message`: dice qué dirección se pidió y que no existe; en cada petición trae la dirección de esa petición (`Cannot GET:` seguido de la ruta).
- `name` / `status`: el tipo de aviso y el mismo `404` dentro del cuerpo.
- `frames`: en el ambiente local el aviso trae además un bloque de detalle para depuración; su contenido cambia de un ambiente a otro y no se revisa.
- Este aviso es el del sistema para cualquier dirección que no existe; no trae `title`, `detail` ni `key`.

### Escenario 6 — Los avisos propios de cada consulta se conservan

Objetivo: comprobar que, ya en la consola, los errores de cada consulta (identificador mal escrito, norma o numeral inexistente, filtro inválido) siguen respondiendo exactamente lo mismo que antes del cambio.

Usuario: **A** (token de la consola). Todas llevan `Authorization: Bearer <token de A>`.

**Paso 1 — Identificador que no es un número.**

**Endpoint:** `GET /api/platform/regulatory-coverage/abc`

**Response exacto:** `400`

```json
{
  "title": "Error de validación",
  "detail": "El parámetro regulationId debe ser un entero positivo.",
  "key": "id-no-numerico"
}
```

Qué significa cada dato:

- `title` / `detail`: el encabezado y la frase del error: el identificador de la norma debe ser un número entero positivo.
- `key`: clave fija del motivo; `id-no-numerico` quiere decir que lo escrito en la dirección no es un número. Este aviso no trae `type` ni `code`.

**Paso 2 — Norma de cobertura que no existe.**

**Endpoint:** `GET /api/platform/regulatory-coverage/999999`

**Response exacto:** `404`

```json
{
  "title": "No encontrado",
  "detail": "La norma solicitada no existe o no está vigente.",
  "key": "norma-no-encontrada"
}
```

Qué significa lo nuevo aquí:

- `key` con `norma-no-encontrada`: no hay una norma vigente con ese identificador.

**Paso 3 — Norma que no existe en el catálogo.**

**Endpoint:** `GET /api/platform/regulations/NOM-999-XXXX`

**Response exacto:** `404`

```json
{
  "title": "Norma no encontrada",
  "detail": "La norma solicitada no existe en el catálogo regulatorio.",
  "key": "norma-no-encontrada",
  "code": "REG.NF.002"
}
```

Qué significa lo nuevo aquí:

- `code`: un identificador interno del tipo de error, estable para quien lo atiende; `REG.NF.002` quiere decir que la norma pedida por su código no existe en el catálogo. Este aviso sí trae `code`; el del Paso 2 no.

**Paso 4 — Numeral que no existe.**

**Endpoint:** `GET /api/platform/regulations/NOM-035-STPS/clauses/99.99`

**Response exacto:** `404`

```json
{
  "title": "Numeral no encontrado",
  "detail": "El numeral solicitado no existe en la norma indicada.",
  "key": "numeral-no-encontrado",
  "code": "REG.NF.003"
}
```

Qué significa lo nuevo aquí:

- `key` con `numeral-no-encontrado` y `code` con `REG.NF.003`: la norma sí existe, pero no tiene ese numeral.

**Paso 5 — Filtro inválido.**

**Endpoint:** `GET /api/platform/regulatory-authorities?country=MEX`

**Response exacto:** `422`

```json
{
  "title": "Parámetro inválido",
  "detail": "El parámetro country debe ser un código ISO-2 de dos letras.",
  "key": "parametro-invalido",
  "code": "REG.VAL.001"
}
```

Qué significa lo nuevo aquí:

- `country` (en la dirección): el país por el que se filtra las autoridades; debe ser un código de dos letras (por ejemplo `MX`), y `MEX` tiene tres.
- `key` con `parametro-invalido` y `code` con `REG.VAL.001`: algún filtro mandado no es válido y no se hizo ninguna consulta.

### Escenario 7 — Sin sesión

Objetivo: comprobar que quien llega a las consultas nuevas sin ninguna sesión recibe solo el aviso de «token requerido» y ningún dato, en las ocho.

Usuario: ninguno. Repite las ocho direcciones de la tabla del Escenario 2 sin el header `Authorization`.

**Response exacto de cada una de las ocho:** `401`

```json
{
  "type": "warning",
  "title": "Token requerido",
  "detail": "No se envió un access token válido",
  "message": "No se envió un access token válido",
  "key": "AUTH.TOKEN.MISSING",
  "data": {
    "refreshable": false
  }
}
```

Qué significa cada dato:

- `type`: la gravedad del aviso. Aquí vale `warning` (el problema es de quien pide, no del servidor); en el Escenario 2 el aviso no traía `type`.
- `title` / `detail` / `message`: el encabezado y la frase que explican el motivo: no se mandó una sesión válida.
- `key`: clave fija del motivo; `AUTH.TOKEN.MISSING` quiere decir que falta el token.
- `data.refreshable`: si la sesión se podría renovar; `false` porque ni siquiera hay sesión.

## 3. Lo que no se revisa aquí

- **Cobertura mayor a cero, `bestCoverage` en `total` o `parcial`, y funcionalidades dentro de `features`:** hoy ningún numeral tiene funcionalidades ligadas y ligarlas cambiaría el catálogo regulatorio global que comparte toda la base; no es revisable aquí. Por eso tampoco se observan los **estados de una funcionalidad**: cuando existan, cada funcionalidad ligada traerá su estado, que puede valer `disponible` (ya liberada), `en_desarrollo` (en construcción) o `planeado` (en el plan).
- **`coveragePercentage` en `null`:** exige una norma sin ningún numeral medible; la base sembrada no tiene una.
- **Que la entrada «Cobertura regulatoria» ya no aparezca en el menú de las empresas:** se comprueba en pantalla del backoffice, no con estas consultas; el Escenario 3 solo confirma en la base que la funcionalidad está dada de baja.

## 4. Checklist

Marca cada escenario contra su `Objetivo:`, no contra «se hicieron los pasos».

- [x] **Escenario 1** — la consola de plataforma recibe las ocho consultas con su contenido completo.
- [x] **Escenario 2** — la cuenta propietaria de una empresa cliente recibe `403` en las ocho y ningún dato.
- [x] **Escenario 3** — el rol con el permiso concedido de antes recibe `403` en las ocho, con el permiso aún guardado y la funcionalidad dada de baja.
- [x] **Escenario 4** — el administrador de plataforma que entra por el backoffice recibe `403` en las ocho.
- [x] **Escenario 5** — las ocho direcciones anteriores responden `404`, con sesión del backoffice y sin sesión.
- [x] **Escenario 6** — los cinco avisos propios (`400`, tres `404` y `422`) responden exactamente lo mismo que antes.
- [x] **Escenario 7** — sin sesión, las ocho consultas responden `401` sin ningún dato.
