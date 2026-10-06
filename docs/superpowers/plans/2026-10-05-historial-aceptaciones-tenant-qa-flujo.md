# Prueba manual — Ver el historial de aceptaciones de una empresa cliente

**Estado: recorrido completo el 6 de octubre de 2026.** Los 13 escenarios y toda la checklist quedaron en verde, sin hallazgos.

**Problema:** cuando alguien pregunta "¿quién aceptó los términos y el aviso de privacidad, cuándo y desde dónde?", la consola de plataforma solo mostraba, por empresa, la última vez que aceptó cada documento. No había dónde ver el detalle de cada aceptación: qué persona de la empresa la hizo, de qué versión se trataba, en qué momento y por qué vía —ni desde qué dirección o equipo entró quien aceptó—. Sin ese detalle no se puede armar una auditoría ni responder un requerimiento.

**Solución:** una pantalla nueva, **de solo consulta**, que muestra el **expediente** de aceptaciones de una empresa cliente: todos y cada uno de sus registros de Términos y condiciones y de Aviso de privacidad, el más reciente primero. Cada renglón dice la persona, el documento, la versión, la fecha y hora (de Ciudad de México) y si se aceptó en línea o en papel; al desplegar un renglón se ve la dirección IP y el equipo de donde se aceptó, siempre **parcialmente ocultos**. Se llega a ella desde el botón **Ver historial** del listado de aceptaciones legales.

Ejemplo: es como la bitácora de la portera de la escuela, donde además de saber quién ya entregó la hoja firmada del reglamento, quedó anotado el nombre de la persona que la entregó, a qué hora, si la llevó en mano o la firmó en la puerta, y desde qué puerta entró; así, si alguien reclama, se puede mostrar la ficha exacta en vez de decir "sí, ya la entregaron".

## Glosario

- **Expediente:** el conjunto completo de registros de aceptación de una empresa; cada renglón es una aceptación concreta, no un resumen.
- **Propietario de la cuenta:** la persona dueña de la empresa cliente dentro del sistema, distinta de las demás personas que colaboran en ella.
- **En línea / En papel:** la vía por la que se aceptó. "En línea" es cuando la persona aceptó desde la aplicación o el navegador; "En papel" es cuando Recursos Humanos asentó que firmó el documento impreso.
- **Parcialmente oculto:** un dato que se muestra tapado con puntos (•••••) para no revelarlo; su valor completo no se enseña en esta pantalla.

## 1. Preparar

Prerrequisito: esta rama del API y del panel (valanserh-landlord) están levantadas, y en la consola de plataforma ya se navega el listado **Aceptaciones legales**.

Este manual se entrega para que una persona lo recorra en el navegador; el agente que lo escribió no lo camina.

Aviso: el archivo que siembra los datos es temporal y **no está versionado** en el repositorio, así que hay que tenerlo presente al armar el ambiente.

Ejecuta una vez el sembrador de QA compartido:

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Qué deja listo para esta prueba (todo con la marca `QA Historial` en el nombre, para reconocerlo entre los datos de otras historias):

- **QA Historial Empresa**: su cuenta propietaria (Renata Salas Bravo) y una colaboradora (Sofía Herrera Lara). Tiene 26 aceptaciones: 24 de la propietaria (Términos y Aviso, varias versiones, todas **En línea**) y 2 de la colaboradora (**En papel**). La aceptación más antigua de la propietaria no capturó IP ni equipo; las demás, sí.
- **QA Historial Otra Empresa**: su cuenta propietaria (Diego Peña Ruiz) con una sola aceptación propia. Sirve para comprobar que su historia **no** se mezcla con la de la primera.
- **QA Historial Sin Aceptaciones**: su cuenta propietaria (Miriam Ortega Cruz) y ninguna aceptación, para ver el estado vacío.
- Una **aceptación biométrica** de la propietaria de QA Historial Empresa que vive en el sistema pero **no forma parte del expediente** (comprueba que nunca aparece).

El sembrador es el mismo que usan otras historias y trae también sus datos. Por eso, en el listado, lo propio se reconoce porque el nombre empieza con `QA Historial`. Volver a correr el comando deja todo otra vez como al inicio (las aceptaciones se rehacen con sus fechas fijas).

## 2. Usuarios

| | Correo | Contraseña | Qué es |
|---|---|---|---|
| **A** | `qa-historial-plataforma@gsti-tests.local` | `password` | Administradora de plataforma; **con esta cuenta se entra a la consola** |
| — | `qa-historial-owner@gsti-tests.local` | `password` | Cuenta propietaria de **QA Historial Empresa**; sostiene sus datos y **no** se usa para entrar aquí |
| — | `qa-historial-otra-owner@gsti-tests.local` | `password` | Cuenta propietaria de **QA Historial Otra Empresa**; **no** se usa para entrar aquí |
| — | `qa-historial-vacio-owner@gsti-tests.local` | `password` | Cuenta propietaria de **QA Historial Sin Aceptaciones**; **no** se usa para entrar aquí |

## 3. Dónde probar

Consola de plataforma — menú lateral, opción **Aceptaciones legales**.

En el listado, cada empresa tiene una columna **Historial** con el botón **Ver historial**: ese botón abre el expediente de esa empresa.

URL directa del expediente: `http://127.0.0.1:3000/legal-acceptances/<id de la empresa>`, donde `<id de la empresa>` es el identificador que aparece en la barra de direcciones al abrir **Ver historial**. La dirección **no** lleva `/es`.

Para entrar: botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña** con el Usuario A, botón **Entrar**.

### Antes de los escenarios: los datos van parcialmente ocultos

El expediente muestra la dirección IP y el equipo desde donde se aceptó **siempre tapados con puntos** (•••••). Verlos completos es otra historia y **no debe haber ningún botón, enlace ni menú para revelarlos**: si aparece una opción para mostrarlos completos, es un defecto y se reporta.

## 4. Qué verificar

### 4.1 El botón Ver historial abre el expediente de esa empresa, no el de otra

Objetivo: comprobar que el botón de cada empresa abre el expediente de esa empresa concreta, y no el de una distinta.

1. Inicia sesión con el Usuario A y abre **Aceptaciones legales**.
2. Escribe `QA Historial` en el buscador y espera un momento: quedan las empresas `QA Historial`.
3. En el renglón de **QA Historial Empresa**, pulsa **Ver historial**.
4. Abre el expediente y su encabezado dice **QA Historial Empresa**.
5. Vuelve al listado con el botón de regresar o la ruta **Aceptaciones legales** de las migas.
6. Ahora pulsa **Ver historial** en el renglón de **QA Historial Otra Empresa**.
7. El encabezado dice **QA Historial Otra Empresa** — no el de la empresa anterior.

### 4.2 Las migas y la cabecera dicen de qué empresa es el expediente

Objetivo: comprobar que al abrir un expediente queda claro de qué empresa es, tanto en la ruta de migas como en el título.

1. Abre el expediente de **QA Historial Empresa** con **Ver historial**.
2. Arriba, la ruta de migas dice **Aceptaciones legales › QA Historial Empresa**; el primer tramo es un enlace que regresa al listado.
3. Debajo, la tarjeta de cabecera lleva como título el nombre **QA Historial Empresa** y como subtítulo la frase **Historial de aceptaciones de términos y aviso de privacidad**.

### 4.3 Cada renglón dice persona, documento, versión, fecha y canal

Objetivo: comprobar que cada fila del expediente identifica a la persona que aceptó, el documento, su versión, el momento de la aceptación en día de Ciudad de México y la vía por la que se aceptó.

1. Con el expediente de **QA Historial Empresa** abierto, revisa los títulos de las columnas: **Persona**, **Documento**, **Versión**, **Aceptada**, **Canal**.
2. En el primer renglón, la persona es **Sofía Herrera Lara**, el documento **Aviso de privacidad**, la versión **vQA-HIST-P1.0**, la fecha y hora **20 sep 2026, 5:45 p.m.** y el canal **En papel**.
3. En el tercer renglón, la persona es **Renata Salas Bravo**, el documento **Aviso de privacidad**, la versión **vQA-HIST-P12.0**, la fecha y hora **12 ago 2026, 10:30 a.m.** y el canal **En línea**.
4. La etiqueta **Propietario** aparece **solo** junto al nombre de **Renata Salas Bravo**; junto a **Sofía Herrera Lara** no hay etiqueta.
5. Los documentos que aparecen en el expediente son únicamente **Términos y condiciones** y **Aviso de privacidad**.
6. Las fechas están expresadas en la fecha local de Ciudad de México (si tu equipo está en otra zona horaria, la hora mostrada es la de Ciudad de México, no la de tu reloj).

### 4.4 El orden es del más reciente al más antiguo

Objetivo: comprobar que las aceptaciones se listan de la más nueva a la más vieja.

1. Con el expediente de **QA Historial Empresa** abierto, lee las fechas de arriba hacia abajo.
2. Van de la más reciente (**20 sep 2026, 5:45 p.m.**) a la más antigua; ninguna fecha posterior aparece más abajo que una anterior.
3. El último renglón de la última página es la aceptación más vieja: **1 jul 2026, 9:00 a.m.**

### 4.5 La IP y el equipo se muestran tapados y sin opción de revelarlos

Objetivo: comprobar que al desplegar un renglón se ve la dirección IP y el equipo, siempre tapados con puntos, y que donde no hubo dato aparece un guion, sin ninguna opción para verlos completos.

1. Con el expediente de **QA Historial Empresa** abierto, pulsa el botón de desplegar del **primer renglón** (Sofía Herrera Lara, En papel).
2. El renglón se expande y muestra **Dirección IP** con un guion (**—**) y **Agente de usuario** con un guion (**—**), porque esa aceptación se asentó en papel y no capturó equipo.
3. Cierra ese renglón y despliega el **tercer renglón** (Renata Salas Bravo, Aviso de privacidad).
4. Ahí **Dirección IP** y **Agente de usuario** aparecen **tapados con puntos** (•••••).
5. **Negativo a comprobar a propósito:** no hay ningún botón, enlace, ícono ni menú dentro del renglón desplegado para ver esos datos completos. Pasa el cursor por encima y pruébalo: nada responde.
6. Despliega también la aceptación más antigua (1 jul 2026, la última de la última página): ahí **Dirección IP** y **Agente de usuario** vuelven a mostrar un guion (**—**), porque esa fila tampoco capturó dato. En total, los registros sin dato son **tres**: las dos aceptaciones de la colaboradora (En papel) y esa aceptación más antigua de la propietaria.

### 4.6 El expediente no mezcla datos de otra empresa

Objetivo: comprobar que el expediente de una empresa solo muestra aceptaciones de esa empresa y ninguna de otra.

1. Abre el expediente de **QA Historial Empresa**.
2. Recórrelo entero (las dos páginas): la única persona que aparece además de **Renata Salas Bravo** es **Sofía Herrera Lara**.
3. En ningún renglón aparece **Diego Peña Ruiz**, que es quien aceptó en **QA Historial Otra Empresa**.
4. Como contraste, abre el expediente de **QA Historial Otra Empresa** con **Ver historial**: ahí el único renglón es de **Diego Peña Ruiz** (Términos y condiciones, canal En línea) y no aparece nadie de la primera empresa.

### 4.7 La aceptación biométrica nunca aparece en el expediente

Objetivo: comprobar que el consentimiento biométrico de una persona de la empresa no forma parte del expediente y no se muestra en ningún renglón.

1. Abre el expediente de **QA Historial Empresa** y recórrelo entero.
2. **Negativo a comprobar a propósito:** no aparece ningún renglón de un documento distinto de **Términos y condiciones** o **Aviso de privacidad**. En particular, no hay ninguna fila que menciona un consentimiento biométrico, aunque en el sistema esa persona sí lo tenga registrado.
3. El número de renglones corresponde solo a aceptaciones de Términos y Aviso (ver la paginación en el Escenario 4.8).

### 4.8 El expediente se reparte en páginas

Objetivo: comprobar que, cuando hay más aceptaciones que el tamaño de una página, el expediente se pagina y se puede avanzar y retroceder sin perder el orden.

1. Con el expediente de **QA Historial Empresa** abierto, mira abajo de la tabla.
2. Como tiene 26 aceptaciones y la página trae 20 renglones, hay un paginador con dos páginas; la primera muestra 20 renglones.
3. Avanza a la **página 2**: aparecen 6 renglones más, los más antiguos (de **Términos y condiciones** de julio).
4. Vuelve a la **página 1** y reaparecen los primeros 20 renglones en el mismo orden.

### 4.9 Una empresa sin aceptaciones muestra su aviso

Objetivo: comprobar que el expediente de una empresa que nunca ha aceptado nada lo dice con claridad, en vez de mostrar una tabla vacía o un error.

1. En el listado, busca `QA Historial` y pulsa **Ver historial** en **QA Historial Sin Aceptaciones**.
2. En el lugar de la tabla aparece el mensaje **Esta empresa no tiene aceptaciones registradas.**
3. No aparece ninguna tabla con encabezados ni renglones en blanco.

### 4.10 Una dirección con un identificador que no existe no revienta

Objetivo: comprobar que abrir el expediente con un identificador de empresa inexistente se explica con un aviso y ofrece volver al listado.

1. En la barra de direcciones, escribe `http://127.0.0.1:3000/legal-acceptances/00000000-0000-0000-0000-000000000000` y pulsa Enter.
2. Aparece el mensaje **No encontramos esta empresa.** con el botón **Volver a la lista**.
3. Pulsa **Volver a la lista**: regresas al listado de aceptaciones legales.
4. **Negativo a comprobar a propósito:** no aparece una pantalla en blanco, ni un aviso de error genérico del sistema, ni una tabla vacía.

### 4.11 Si el servidor falla se avisa y se puede reintentar sin perder la pantalla

Objetivo: comprobar que una caída del servidor se anuncia como error —nunca como un expediente vacío— y que, al volver el servidor, reintentar recupera el expediente.

1. Abre el expediente de **QA Historial Empresa** y confirma que carga con datos.
2. Apaga el servidor del API (Ctrl+C en su terminal).
3. Recarga la pantalla con F5.
4. En el lugar de la tabla aparece el aviso **No fue posible cargar el historial de aceptaciones.** con el botón **Reintentar**.
5. **Negativo a comprobar a propósito:** no aparece la tabla vacía ni el mensaje de "no tiene aceptaciones"; el error es explícito.
6. Vuelve a encender el servidor del API.
7. Pulsa **Reintentar**: el expediente carga correctamente.

### 4.12 En una pantalla de teléfono el expediente se sigue leyendo

Objetivo: comprobar que en una pantalla angosta la tabla y sus renglones se acomodan sin cortarse ni desbordarse.

1. Estrecha la ventana del navegador hasta unos 375 px de ancho, o usa el modo móvil.
2. La tarjeta de cabecera y la tabla se ven sin desbordar la página.
3. La tabla se puede desplazar en horizontal para ver las cinco columnas (**Persona**, **Documento**, **Versión**, **Aceptada**, **Canal**).
4. Los datos de cada renglón no se encimen ni se salen de su columna.

### 4.13 La pantalla es solo de consulta

Objetivo: comprobar que desde el expediente no se puede cambiar, anular ni exportar ninguna aceptación: solo se consulta.

1. Con el expediente abierto, pasa el cursor por encima de los renglones y de los nombres.
2. **Negativo a comprobar a propósito:** no hay botones ni menús para editar, anular, borrar ni exportar aceptaciones.
3. Lo único que responde es desplegar un renglón, mover el paginador y, en los estados vacío o de error, los botones **Volver a la lista** o **Reintentar**.

## 5. Qué no se revisa con esta base sembrada

- **El rechazo a quien no es usuario de plataforma.** Lo decide el servidor y no depende de esta pantalla: una cuenta de empresa cliente que abra la dirección del panel no pasa del inicio de sesión. Se cubre con las pruebas del API, no aquí.
- **El correo de la persona que aceptó.** No se muestra por diseño en ninguna parte del expediente (ni en la tabla ni al desplegar un renglón). Si el correo apareciera en cualquier parte de la pantalla, es un defecto y se reporta.

## 6. Checklist

Cada casilla se marca contra el objetivo de su escenario, no contra "se hicieron los pasos":

**Recorrido: completado por la persona responsable el 6 de octubre de 2026 — los 13 escenarios quedaron en verde, sin hallazgos.**

- [x] 4.1 El botón **Ver historial** abre el expediente de esa empresa y no el de otra
- [x] 4.2 Las migas y la cabecera identifican de qué empresa es el expediente
- [x] 4.3 Cada renglón muestra persona (con **Propietario** solo en la dueña), documento, versión, fecha y hora de Ciudad de México y canal
- [x] 4.4 El orden es del más reciente al más antiguo
- [x] 4.5 La IP y el equipo se ven tapados con puntos, con guion cuando no hay dato, y sin ninguna opción de revelarlos
- [x] 4.6 El expediente no mezcla datos de otra empresa
- [x] 4.7 La aceptación biométrica nunca aparece
- [x] 4.8 El expediente se reparte en páginas y se puede avanzar y retroceder
- [x] 4.9 Una empresa sin aceptaciones muestra su aviso
- [x] 4.10 Una dirección con un identificador inexistente muestra **No encontramos esta empresa.** y **Volver a la lista**
- [x] 4.11 Con el servidor caído se avisa con **Reintentar** (nunca un expediente vacío) y al volver se recupera
- [x] 4.12 En 375 px la tabla se desplaza en horizontal sin desbordarse
- [x] 4.13 El expediente no permite editar, anular ni exportar
