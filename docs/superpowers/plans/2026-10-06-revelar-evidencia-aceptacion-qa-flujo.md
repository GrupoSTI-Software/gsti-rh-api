# Prueba manual — Revelar la dirección y el equipo de una aceptación

**Problema:** en el historial de una empresa, la dirección y el equipo desde donde se aceptó se ven tapados. Si un cliente dice que él no aceptó, quien opera la plataforma no puede mostrar desde qué equipo se aceptó, y tampoco debe destapar de un golpe todas las demás aceptaciones.

**Solución:** en el renglón desplegado, cuando sí hubo dirección o equipo, aparece un botón para verlos completos. Al pulsarlo se destapa **solo ese renglón**, sin preguntar si se está seguro, y la pantalla avisa que la consulta queda anotada. Los demás renglones siguen tapados. Al cambiar de página o al salir, vuelven a taparse. Si no hubo ni dirección ni equipo, el botón no está. Desde el historial de una empresa no se llega a la aceptación de otra, ni a un consentimiento de huella o de rostro.

Ejemplo: es como si en la tienda de la esquina un cliente dijera que él no firmó el vale, y quien atiende tuviera que mostrar, solo en ese vale y dejando anotado que lo miró, desde qué caja y con qué aparato se firmó, sin destapar los vales de las demás personas.

## Glosario

- **Expediente:** el historial completo de aceptaciones de una empresa; cada renglón es una aceptación concreta.
- **Revelar:** mostrar completos, en ese renglón, la dirección y el equipo que estaban tapados.
- **Parcialmente oculto:** un dato tapado con puntos (•••••); su valor completo no se enseña hasta revelarlo.
- **Bitácora de acceso a datos personales:** la anotación de que alguien consultó un dato personal. En esta pantalla solo se avisa que la consulta queda anotada; la anotación misma no se abre aquí.
- **Agente de usuario:** la descripción del programa y del equipo con los que la persona aceptó.

## 1. Preparar

Prerrequisito: esta rama del API y del panel de la consola están levantadas, y en la consola de plataforma ya se abre el expediente desde **Aceptaciones legales**.

Este manual se entrega para que una persona lo recorra en el navegador; quien lo escribió no lo camina.

Aviso: el archivo que siembra los datos es temporal y **no está versionado** en el repositorio, así que hay que tenerlo presente al armar el ambiente.

Ejecuta una vez el sembrador de QA compartido:

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Qué deja listo para esta prueba (todo con la marca `QA Revelar` en el nombre, para reconocerlo entre los datos de otras historias):

- **QA Revelar Empresa**: su cuenta propietaria (Carla Rios Vega), Bruno Salas Mora y Elena Cruz Diaz. Tiene **21** aceptaciones de Términos y Aviso, en dos páginas (20 y 1). Las tres personas tienen dirección y equipo capturados. Una aceptación de Carla no capturó ninguno. El equipo de Elena es un texto largo, de más de cien caracteres, y dentro lleva las letras `<script>`. Las demás filas son relleno de Carla, para poder cambiar de página. Además hay un consentimiento de huella o de rostro de Carla que **no** forma parte del expediente.
- **QA Revelar Otra Empresa**: su cuenta propietaria (Diego Pena Ruiz) con una sola aceptación propia. Sirve para comprobar que desde el expediente de la primera no se puede revelar la de esta.

El sembrador es el mismo que usan otras historias y trae también sus datos. Por eso, en el listado, lo propio se reconoce porque el nombre empieza con `QA Revelar`. Volver a correr el comando deja las aceptaciones otra vez como al inicio. Salir del expediente y volver a entrar tapa lo revelado sin tener que sembrar de nuevo.

Cómo reconocer los renglones de **QA Revelar Empresa**, de arriba hacia abajo (el más reciente primero). La etiqueta **Propietario** aparece solo junto a Carla Rios Vega:

1. **Elena Cruz Diaz**, **Aviso de privacidad**, **vQA-REV-LARGO**, **5 oct 2026, 11:00 a.m.**, **En línea**.
2. **Bruno Salas Mora**, **Términos y condiciones**, **vQA-REV-BRUNO**, **4 oct 2026, 11:00 a.m.**, **En línea**.
3. **Carla Rios Vega**, **Aviso de privacidad**, **vQA-REV-CARLA**, **3 oct 2026, 11:00 a.m.**, **En línea**.
4. **Carla Rios Vega**, **Términos y condiciones**, **vQA-REV-SIN**, **2 oct 2026, 11:00 a.m.**, **En línea**. Esta es la que no capturó dirección ni equipo.
5. En adelante, hasta el final de la primera página, relleno de Carla: **Términos y condiciones**, versiones **vQA-REV-F01** (**16 sep 2026, 11:00 a.m.**) hasta **vQA-REV-F16** (**1 sep 2026, 11:00 a.m.**), todas **En línea**.
6. La segunda página tiene un solo renglón: Carla, **Términos y condiciones**, **vQA-REV-F17**, **31 ago 2026, 11:00 a.m.**, **En línea**.

No hay ningún renglón del **6 oct 2026**. Si apareciera, el consentimiento de huella o de rostro se coló en el expediente.

## 2. Usuarios

| | Correo | Contraseña | Qué es |
|---|---|---|---|
| **A** | `qa-revelar-plataforma@gsti-tests.local` | `password` | Administradora de plataforma; **con esta cuenta se entra a la consola** |
| — | `qa-revelar-owner@gsti-tests.local` | `password` | Cuenta propietaria de **QA Revelar Empresa** (Carla Rios Vega); sostiene sus datos y **no** se usa para entrar aquí |
| — | `qa-revelar-bruno@gsti-tests.local` | `password` | Cuenta de Bruno Salas Mora en esa empresa; **no** se usa para entrar aquí |
| — | `qa-revelar-elena@gsti-tests.local` | `password` | Cuenta de Elena Cruz Diaz en esa empresa; **no** se usa para entrar aquí |
| — | `qa-revelar-otra-owner@gsti-tests.local` | `password` | Cuenta propietaria de **QA Revelar Otra Empresa** (Diego Pena Ruiz); **no** se usa para entrar aquí |

## 3. Dónde probar

Consola de plataforma — menú lateral, opción **Aceptaciones legales**.

En el listado, cada empresa tiene una columna **Historial** con el botón **Ver historial**: ese botón abre el expediente de esa empresa.

URL directa del expediente: `http://127.0.0.1:3000/legal-acceptances/<id de la empresa>`, donde `<id de la empresa>` es el identificador que aparece en la barra de direcciones al abrir **Ver historial**. La dirección **no** lleva `/es`.

Para entrar: botón **Continuar con contraseña**, llena **Correo electrónico** y **Contraseña** con el Usuario A, botón **Entrar**.

**Antes de los escenarios.** La pantalla con la que se prueba es el expediente (la que se abre con **Ver historial**), no el listado. Cada vez que se pulsa **Revelar IP y agente de usuario**, esa consulta queda anotada en la bitácora de acceso a datos personales. Desde esta consola no se abre esa bitácora: aquí solo se comprueba el aviso en el renglón.

Recorre los escenarios **4.1 a 4.5 en ese orden**, con el expediente de **QA Revelar Empresa** recién abierto. Si ya revelaste un renglón, sal y vuelve a entrar antes de empezar el 4.1. Los escenarios 4.6, 4.7 y 4.8 no dependen de haber revelado. El 4.9 revela el renglón de Elena; hazlo después del 4.5. El 4.10 va justo después del 4.9, con ese renglón todavía desplegado.

## 4. Qué verificar

### 4.1 El renglón desplegado muestra la dirección y el equipo tapados, el botón y el aviso

Objetivo: comprobar que, al desplegar un renglón que sí capturó dirección y equipo, ambos se ven tapados con puntos, aparece el botón para revelarlos y el aviso de que la consulta queda anotada.

1. Inicia sesión con el Usuario A y abre **Aceptaciones legales**.
2. Escribe `QA Revelar` en el buscador y espera un momento: quedan las empresas `QA Revelar`.
3. En el renglón de **QA Revelar Empresa**, pulsa **Ver historial**.
4. El encabezado dice **QA Revelar Empresa** y el subtítulo **Historial de aceptaciones de términos y aviso de privacidad**. El primer renglón es el de **Elena Cruz Diaz** del **5 oct 2026, 11:00 a.m.**
5. Pulsa el botón de desplegar del renglón de **Elena Cruz Diaz**.
6. Se leen **Dirección IP** y **Agente de usuario**, los dos tapados con puntos (•••••).
7. Ahí está el botón **Revelar IP y agente de usuario** y el aviso **Esta consulta queda registrada en la bitácora de acceso a datos personales.**
8. Cierra ese renglón y despliega el de **Bruno Salas Mora** (**4 oct 2026, 11:00 a.m.**) y el de **Carla Rios Vega** del **3 oct 2026** (**vQA-REV-CARLA**). En los dos se repite lo mismo: puntos, el botón y el aviso.
9. **Negativo a comprobar a propósito:** todavía no pulses el botón. En este escenario los tres renglones siguen tapados.

### 4.2 Revelar no pide confirmación y enseña los datos de ese renglón

Objetivo: comprobar que al pulsar el botón no aparece ninguna pregunta de confirmación y, enseguida, se ven la dirección y el equipo completos de ese renglón.

1. Sigue en el expediente del escenario 4.1. Si ya pulsaste revelar, sal y vuelve a entrar. Despliega el renglón de **Bruno Salas Mora**.
2. Pulsa **Revelar IP y agente de usuario**.
3. **Negativo a comprobar a propósito:** no aparece ninguna pregunta, ni una segunda pantalla, ni otro botón para confirmar. A lo más el botón se queda un momento ocupado.
4. En ese mismo renglón, **Dirección IP** pasa a **198.51.100.20** y **Agente de usuario** pasa a **Mozilla/5.0 QA-Revelar-Bruno**.

### 4.3 Solo ese renglón queda destapado

Objetivo: comprobar que, tras el revelado del escenario 4.2, solo el renglón de Bruno queda destapado, los demás siguen tapados, el botón de ese renglón desaparece y se lee que los datos siguen visibles hasta salir de la pantalla.

1. En el renglón de **Bruno Salas Mora** que acabas de revelar, ya no está el botón **Revelar IP y agente de usuario** ni el aviso de la bitácora.
2. En su lugar se lee **Visible hasta que salgas de esta página.**
3. La dirección y el equipo de Bruno siguen siendo **198.51.100.20** y **Mozilla/5.0 QA-Revelar-Bruno**.
4. Despliega el renglón de **Elena Cruz Diaz**, el de **Carla Rios Vega** del **3 oct 2026** (**vQA-REV-CARLA**) y el relleno **vQA-REV-F01** (**16 sep 2026, 11:00 a.m.**).
5. En esos tres, **Dirección IP** y **Agente de usuario** siguen tapados con puntos (•••••), y cada uno conserva su botón **Revelar IP y agente de usuario** y el aviso de la bitácora.
6. **Negativo a comprobar a propósito:** no pulses el botón de esos tres renglones.

### 4.4 Al cambiar de página o al salir, los datos se tapan otra vez

Objetivo: comprobar que al cambiar de página del expediente, y también al salir y volver a entrar, la dirección y el equipo se vuelven a ver tapados y el botón de revelar reaparece.

1. Con el renglón de **Bruno Salas Mora** todavía revelado, baja al paginador y pasa a la **página 2**.
2. Ahí hay un solo renglón: **Carla Rios Vega**, **Términos y condiciones**, **vQA-REV-F17**, **31 ago 2026, 11:00 a.m.**, **En línea**, con la etiqueta **Propietario**.
3. Vuelve a la **página 1**. Despliega el renglón de Bruno si se cerró.
4. **Dirección IP** y **Agente de usuario** están otra vez en puntos (•••••). Volvieron el botón **Revelar IP y agente de usuario** y el aviso **Esta consulta queda registrada en la bitácora de acceso a datos personales.**
5. Pulsa otra vez ese botón, solo para dejar el renglón revelado, y sal al listado con el enlace **Aceptaciones legales** de las migas.
6. Entra de nuevo con **Ver historial** en **QA Revelar Empresa** y despliega el renglón de Bruno.
7. Otra vez están tapados con puntos y el botón **Revelar IP y agente de usuario** está de nuevo.

### 4.5 Revelar el mismo renglón otra vez vuelve a funcionar

Objetivo: comprobar que, después de que los datos volvieron a taparse, revelar el mismo renglón otra vez vuelve a mostrar la dirección y el equipo completos.

1. Con el expediente recién abierto al terminar el escenario 4.4, despliega el renglón de **Bruno Salas Mora** (está tapado y el botón está visible).
2. Pulsa **Revelar IP y agente de usuario**.
3. **Dirección IP** vuelve a ser **198.51.100.20** y **Agente de usuario** vuelve a ser **Mozilla/5.0 QA-Revelar-Bruno**.
4. El botón desaparece y se lee **Visible hasta que salgas de esta página.**
5. Que esa segunda consulta deje otra anotación en la bitácora no se comprueba en esta pantalla (ver la sección 5).

### 4.6 Sin dirección ni equipo no hay botón

Objetivo: comprobar que la aceptación que no capturó dirección ni equipo muestra un guion en ambos y no ofrece el botón de revelar.

1. En el expediente de **QA Revelar Empresa**, despliega el renglón de **Carla Rios Vega** del **2 oct 2026, 11:00 a.m.**, **Términos y condiciones**, **vQA-REV-SIN**.
2. **Dirección IP** muestra un guion (**—**) y **Agente de usuario** muestra un guion (**—**).
3. **Negativo a comprobar a propósito:** en ese renglón no hay botón **Revelar IP y agente de usuario**, ni el aviso de la bitácora, ni la frase de que sigue visible hasta salir.

### 4.7 Desde este expediente no se revela la aceptación de la otra empresa

Objetivo: comprobar que en el expediente de QA Revelar Empresa no aparece la aceptación de la otra empresa y no hay forma de revelarla desde aquí.

1. Abre el expediente de **QA Revelar Empresa** y recórrelo entero (las dos páginas).
2. **Negativo a comprobar a propósito:** en ningún renglón aparece **Diego Pena Ruiz**. No hay un enlace, un botón ni un menú que abra la aceptación de **QA Revelar Otra Empresa** desde esta pantalla.
3. Como contraste, vuelve al listado y pulsa **Ver historial** en **QA Revelar Otra Empresa**.
4. El encabezado dice **QA Revelar Otra Empresa**. El único renglón es de **Diego Pena Ruiz**, **Términos y condiciones**, **vQA-REV-OTRA**, **1 oct 2026, 11:00 a.m.**, **En línea**, con la etiqueta **Propietario**.
5. No aparece **Carla Rios Vega**, ni **Bruno Salas Mora**, ni **Elena Cruz Diaz**.

### 4.8 El consentimiento de huella o de rostro no aparece y no se puede revelar

Objetivo: comprobar que el consentimiento de huella o de rostro de una persona de la empresa no forma parte del expediente y, por eso, no se puede revelar desde aquí.

1. Abre el expediente de **QA Revelar Empresa** y recórrelo entero.
2. Los documentos que aparecen son únicamente **Términos y condiciones** y **Aviso de privacidad**.
3. **Negativo a comprobar a propósito:** no hay ningún renglón del **6 oct 2026**, ni una fila de un documento distinto de esos dos, aunque Carla sí tenga ese consentimiento en el sistema.
4. El expediente sigue en 21 renglones (20 en la primera página y 1 en la segunda). No hay un renglón de más que se pueda desplegar para revelarlo.

### 4.9 Un agente de usuario largo con script se ve como texto

Objetivo: comprobar que el equipo largo de Elena, que incluye las letras de una etiqueta script, se lee como texto y no rompe la pantalla.

1. En el expediente de **QA Revelar Empresa**, despliega el renglón de **Elena Cruz Diaz** (**5 oct 2026, 11:00 a.m.**, **vQA-REV-LARGO**). Si ya lo habías revelado en esta visita, sal y vuelve a entrar antes.
2. Pulsa **Revelar IP y agente de usuario**.
3. **Dirección IP** es **198.51.100.30**.
4. **Agente de usuario** es este texto, en una sola línea (si aquí se parte, el corte es del manual, no del dato):

```text
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) QA-Revelar Chrome/120.0.0.0 Safari/537.36 <script>alert(1)</script>
```

5. Dentro de ese texto se leen las letras `<script>` y `</script>`.
6. **Negativo a comprobar a propósito:** no salta ninguna ventana, la pantalla no se queda en blanco y el texto no se convierte en un botón ni en un enlace. Se queda escrito dentro del renglón y, si no cabe, baja de línea dentro de él.

### 4.10 En una pantalla de teléfono el expediente se sigue leyendo

Objetivo: comprobar que en una pantalla angosta el expediente, el renglón desplegado y el texto largo del equipo se leen sin salirse de la página ni encimarse.

1. Hazlo justo después del escenario 4.9, con el renglón de **Elena Cruz Diaz** todavía desplegado y el texto largo a la vista. Si saliste de la pantalla, revela ese renglón otra vez y no salgas.
2. Estrecha la ventana del navegador hasta unos 375 px de ancho, o usa el modo móvil.
3. La tarjeta de cabecera se ve dentro de la página, sin desbordarla.
4. La tabla se puede desplazar en horizontal para ver las cinco columnas (**Persona**, **Documento**, **Versión**, **Aceptada**, **Canal**).
5. En el renglón desplegado, el texto largo del **Agente de usuario** baja de línea dentro del renglón y no estira la página hacia un lado.
6. Se sigue leyendo **Visible hasta que salgas de esta página.** El texto largo no se encima con la dirección ni deja la página más ancha que la ventana.

## 5. Qué no se revisa con esta base sembrada

- **Que la anotación quede en la bitácora con el dato correcto** (incluida la anotación de más que deja revelar otra vez). La pantalla de la bitácora se consulta en el backoffice del cliente, no en esta consola.
- **El rechazo a quien no es usuario de plataforma.** Lo decide el servidor: una cuenta de empresa cliente que abra la dirección del panel no pasa del inicio de sesión. Se cubre con las pruebas del servidor, no aquí.
- **El aviso cuando el revelado falla.** Hace falta provocar un error del servidor, y esta base sembrada no lo produce. No hay pasos para apagar el servidor ni para simular el fallo.

## 6. Checklist

Cada casilla se marca contra el objetivo de su escenario, no contra "se hicieron los pasos":

- [ ] 4.1 Al desplegar un renglón con dirección y equipo capturados se ven tapados con puntos, con el botón **Revelar IP y agente de usuario** y el aviso de que la consulta queda registrada
- [ ] 4.2 Al pulsar revelar no aparece ninguna confirmación y enseguida se ven la dirección y el equipo de ese renglón
- [ ] 4.3 Solo ese renglón queda destapado; los demás siguen tapados, el botón desaparece y se lee que siguen visibles hasta salir
- [ ] 4.4 Al cambiar de página, y al salir y volver, los datos se tapan otra vez y el botón reaparece
- [ ] 4.5 Revelar el mismo renglón otra vez vuelve a mostrar la dirección y el equipo completos
- [ ] 4.6 Una aceptación sin dirección ni equipo muestra un guion y no tiene el botón
- [ ] 4.7 Desde el expediente de **QA Revelar Empresa** no se puede revelar la aceptación de **QA Revelar Otra Empresa**
- [ ] 4.8 El consentimiento de huella o de rostro no aparece en el expediente y no hay forma de revelarlo
- [ ] 4.9 El agente de usuario largo con script se lee como texto y la pantalla no se rompe
- [ ] 4.10 En 375 px el expediente, el renglón desplegado y el texto largo se leen sin desbordarse
