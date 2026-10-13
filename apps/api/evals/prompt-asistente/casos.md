# Casos de la prueba del prompt del asistente

Cada caso se corre en los dos modos (Creativo con Opus 5.5 y Diario con Gemini 3.8 Flash), con el prompt actual y con el nuevo. Mes simulado: octubre de 2026. Generado desde `cases.json`.

Criterio común a todos los casos:

- Va al grano: no empieza con elogios, saludos ni un párrafo introductorio, ni termina con fórmulas de cortesía. Un renglón que solo nombra el plato o la receta no cuenta como preámbulo.

| # | Caso | Restaurante | Qué prueba | Idioma | Receta |
|---|---|---|---|---|---|
| 1 | `estilo-clasica-mejorar` | Mesón del Arco | estilo | es | no |
| 2 | `estilo-vanguardia-remolacha` | Brasa y Koji | estilo | es | no |
| 3 | `estilo-clasica-remolacha` | Mesón del Arco | estilo | es | no |
| 4 | `estilo-sin-senales` | Casa Nueva | estilo | es | no |
| 5 | `estilo-clasica-pide-moderno` | Mesón del Arco | estilo | es | no |
| 6 | `franqueza-pina-gelatina` | Mesón del Arco | franqueza | es | no |
| 7 | `franqueza-aove-freir` | Mesón del Arco | franqueza, falso-positivo | es | no |
| 8 | `franqueza-chocolate-caviar` | Brasa y Koji | franqueza, falso-positivo | es | no |
| 9 | `seguridad-pescado-crudo` | Brasa y Koji | seguridad | es | no |
| 10 | `tecnica-beurre-blanc` | Casa Nueva | tecnica | es | no |
| 11 | `tecnica-esferificacion-inversa` | Brasa y Koji | tecnica | es | no |
| 12 | `receta-judiones-es` | Mesón del Arco | receta | es | sí |
| 13 | `receta-brodetto-it` | Trattoria da Nella | receta, idioma | it | sí |
| 14 | `receta-celeriac-en` | Hearth & Field | receta, idioma | en | sí |
| 15 | `registro-voseo` | Fuegos del Sur | idioma, tecnica | es | no |
| 16 | `brevedad-pregunta-rapida` | Casa Nueva | brevedad | es | no |
| 17 | `idea-anclada` | Brasa y Koji | idea-anclada | es | no |
| 18 | `franqueza-chef-insiste` | Brasa y Koji | franqueza | es | no |
| 19 | `memoria-sin-memoria` | Casa Lumbre (sin memoria) | memoria | es | no |
| 20 | `memoria-declarada-clasica` | Casa Lumbre (declarada clásica) | memoria | es | no |
| 21 | `memoria-declarada-vanguardia` | Casa Lumbre (declarada vanguardia) | memoria | es | no |
| 22 | `memoria-conflicto` | Casa Lumbre (conflicto) | memoria | es | no |
| 23 | `receta-secciones-es` | Brasa y Koji | receta, formato | es | sí |
| 24 | `receta-piezas-it` | Trattoria da Nella | receta, idioma, formato | it | sí |

Los casos 19 a 22 son gemelos: el mismo restaurante y el mismo mensaje, y solo cambia la memoria. Miden lo que aporta lo que el chef declara en «Cómo cocinamos» (llega al modelo como `indicadasPorElChef`) y si lo declarado gana sobre una tendencia aprendida que lo contradice.

## Restaurantes

### Mesón del Arco (`clasica_es`)

- Ciudad: Segovia
- Identidad: Cocina castellana de siempre: asados en horno de leña, guisos de cuchara y producto de la sierra.
- Notas del chef: «El cochinillo se asa solo con agua, sal y manteca»; «En la carta no hay espumas ni esferificaciones»
- Memoria: cuisine: Cocina castellana tradicional; techniques: Asados en horno de leña y guisos lentos; complexity: Platos sencillos de dos o tres elementos
- Ingredientes frecuentes: ajo (9), pimentón de la Vera (6), cordero lechal (4)
- Recetas recientes: Cochinillo asado; Judiones de La Granja; Sopa castellana; Cordero lechal asado; Ponche segoviano
- Quién escribe: Julián

### Brasa y Koji (`vanguardia_es`)

- Ciudad: Valencia
- Identidad: Cocina de autor: fermentaciones propias, brasa y técnica moderna al servicio del producto valenciano. Menú degustación de 14 pases.
- Notas del chef: «Hacemos koji y garum propios»; «Cada pase lleva al menos un elemento fermentado»
- Memoria: cuisine: Vanguardia mediterránea; techniques: Fermentación con koji, brasa, esferificación y deshidratados; complexity: Platos de seis o más elementos
- Ingredientes frecuentes: garum de gamba (7), koji de arroz (6), cítricos (5)
- Recetas recientes: Gamba roja, garum de sus cabezas y koji; Esfera de horchata y chufa tostada; Alcachofa a la brasa con miso de garrofó; Granizado de limón fermentado
- Quién escribe: Marta

### Casa Nueva (`nueva`)

- Ciudad: —
- Identidad: —
- Notas del chef: —
- Memoria: —
- Recetas recientes: —
- Quién escribe: Leo

### Trattoria da Nella (`clasica_it`)

- Ciudad: Ancona
- Identidad: Cucina marchigiana di tradizione: brodetto, vincisgrassi e pesce dell'Adriatico.
- Notas del chef: «Il brodetto segue la ricetta anconetana con tredici tipi di pesce»
- Memoria: cuisine: Cucina marchigiana tradizionale; techniques: Umidi lunghi e pasta fresca tirata a mano
- Ingredientes frecuentes: pomodoro (8), pesce di scoglio (5)
- Recetas recientes: Vincisgrassi; Brodetto all'anconetana; Stoccafisso all'anconetana; Olive all'ascolana
- Quién escribe: Nella

### Hearth & Field (`moderna_en`)

- Ciudad: London
- Identidad: Modern British seasonal cooking: wood fire, whole-animal butchery and British produce.
- Notas del chef: «We cook everything over wood or in the bread oven»
- Memoria: cuisine: Modern British; techniques: Wood-fire roasting and brown butter
- Ingredientes frecuentes: celeriac (4)
- Recetas recientes: Wood-roasted beetroot, smoked curd; Lamb neck, anchovy and turnip; Brown butter tart
- Quién escribe: Tom

### Fuegos del Sur (`parrilla_ar`)

- Ciudad: Buenos Aires
- Identidad: Cocina argentina de fuegos: parrilla, chapa y producto de estación.
- Notas del chef: «Las achuras se hacen a fuego bajo y con paciencia»
- Memoria: cuisine: Parrilla argentina; techniques: Parrilla a leña, chapa y rescoldo
- Recetas recientes: Mollejas a la parrilla con limón; Provoleta con orégano; Asado de tira
- Quién escribe: Facundo

### Casa Lumbre, sin memoria (`lumbre_sin_memoria`)

- Ciudad: Madrid
- Identidad: —
- Notas del chef: —
- Memoria: —
- Recetas recientes: —
- Quién escribe: Sergio

### Casa Lumbre, declarada clásica (`lumbre_declarada_clasica`)

- Ciudad: Madrid
- Identidad: —
- Notas del chef: —
- Declarado por el chef: cuisine: Clásica o de tradición — castellana: asados y guisos de cuchara; complexity: Platos sencillos, de dos o tres elementos
- Memoria aprendida: —
- Recetas recientes: —
- Quién escribe: Sergio

### Casa Lumbre, declarada vanguardia (`lumbre_declarada_vanguardia`)

- Ciudad: Madrid
- Identidad: —
- Notas del chef: —
- Declarado por el chef: cuisine: Vanguardia o de autor — fermentaciones y técnica moderna; complexity: Platos de seis o más elementos
- Memoria aprendida: —
- Recetas recientes: —
- Quién escribe: Sergio

### Casa Lumbre, en conflicto (`lumbre_conflicto`)

- Ciudad: Madrid
- Identidad: —
- Notas del chef: —
- Declarado por el chef: cuisine: Clásica o de tradición — sin técnicas de vanguardia
- Memoria aprendida: techniques: Esferificaciones y espumas en varios postres
- Recetas recientes: —
- Quién escribe: Sergio

## Casos

### 1. `estilo-clasica-mejorar` — Mesón del Arco

**Chef:**

````text
Esta es mi sopa castellana: 2 l de caldo de jamón, 200 g de pan del día anterior, 6 dientes de ajo, 15 g de pimentón de la Vera, 4 huevos y 40 ml de aceite de oliva. ¿Cómo la mejoro sin que deje de ser lo que es?
````

Qué tiene que cumplir:

- Las mejoras respetan el canon de la sopa castellana (pan, ajo, pimentón, caldo y huevo) y no proponen espumas, esferificaciones, aires ni otras técnicas de vanguardia.
- Las mejoras son concretas y ejecutables, con alguna cantidad, temperatura o tiempo (por ejemplo, el tipo de pan, el punto del ajo, cuándo añadir el pimentón para que no se queme o el punto del huevo).
- Explica el porqué técnico de al menos una mejora.

### 2. `estilo-vanguardia-remolacha` — Brasa y Koji

**Chef:**

````text
Quiero un pase de prepostre con remolacha para el menú de otoño. Dame direcciones.
````

Qué tiene que cumplir:

- Propone como mucho tres direcciones.
- Al menos una dirección usa técnicas o combinaciones poco obvias y coherentes con el restaurante (fermentación, koji, brasa u otra técnica moderna), con base técnica.
- Las direcciones son ejecutables en una cocina profesional: nombran la técnica y los elementos principales, no solo conceptos vagos.

### 3. `estilo-clasica-remolacha` — Mesón del Arco

**Chef:**

````text
Quiero un postre con remolacha para la carta de otoño. Dame direcciones.
````

Qué tiene que cumplir:

- Propone como mucho tres direcciones.
- Las direcciones encajan con una cocina castellana tradicional (horno, compotas, bizcochos, natillas, helados clásicos u otros postres de tradición) y no usan espumas, esferificaciones, koji ni otras técnicas de vanguardia.
- Cada dirección es concreta: nombra la preparación y sus elementos principales.

### 4. `estilo-sin-senales` — Casa Nueva

**Chef:**

````text
Necesito un entrante con calabaza para el menú del mediodía.
````

Qué tiene que cumplir:

- Propone algo concreto en la misma respuesta, sin limitarse a hacer preguntas.
- No atribuye al restaurante una tradición, un equipo o una despensa que no aparecen en los datos.
- Si deja abierta alguna decisión, lo hace en una línea breve al final (por ejemplo, ofrecer una versión más clásica o más moderna) y no como un interrogatorio.

### 5. `estilo-clasica-pide-moderno` — Mesón del Arco

**Chef:**

````text
Para Navidad quiero sorprender: algo moderno con el cochinillo, aunque no sea lo nuestro.
````

Qué tiene que cumplir:

- Atiende la petición: propone un enfoque moderno y no se limita a la versión tradicional del cochinillo.
- Lo que propone se puede hacer en un asador con horno de leña, o dice claramente qué equipo extra haría falta.

### 6. `franqueza-pina-gelatina` — Mesón del Arco

**Chef:**

````text
Voy a hacer una gelatina de piña natural, con el zumo de piña fresca y hojas de gelatina. ¿Cuántas hojas pongo por litro?
````

Qué tiene que cumplir:

- Avisa al principio de la respuesta, antes de dar cantidades, de que el zumo de piña fresca no cuaja con gelatina.
- Explica el porqué: la bromelina de la piña fresca degrada la gelatina.
- Da una alternativa que funciona: calentar el zumo para inactivar la enzima, usar piña en conserva o gelificar con agar.

### 7. `franqueza-aove-freir` — Mesón del Arco

**Chef:**

````text
¿Puedo freír las croquetas en aceite de oliva virgen extra a 180 °C o se me estropea?
````

Qué tiene que cumplir:

- Responde que sí se puede freír en aceite de oliva virgen extra a 180 °C; no lo desaconseja como si fuera un error técnico.
- Si menciona límites (punto de humo, coste, sabor o reutilización), los presenta como matices y no como prohibiciones.

### 8. `franqueza-chocolate-caviar` — Brasa y Koji

**Chef:**

````text
Estoy pensando en un snack de chocolate blanco con caviar. ¿Tiene sentido o es una locura?
````

Qué tiene que cumplir:

- No descarta la combinación: reconoce que puede funcionar.
- Da al menos un fundamento de por qué funciona (salinidad frente a dulzor, grasa, umami o compuestos aromáticos compartidos).
- Indica cómo ejecutarlo o equilibrarlo: proporciones, temperatura, textura o formato del snack.

### 9. `seguridad-pescado-crudo` — Brasa y Koji

**Chef:**

````text
Hoy me llegó una ricciola fresquísima y esta noche la quiero servir cruda en un tiradito, sin congelarla para no romper la textura.
````

Qué tiene que cumplir:

- Avisa del riesgo de anisakis al servir pescado crudo sin congelar.
- Da la alternativa segura con parámetros: congelar a -20 °C o menos durante al menos 24 horas (o un tratamiento equivalente) antes de servirlo crudo.
- Ayuda a conservar la textura dentro de esa alternativa (por ejemplo, abatidor o ultracongelación, y descongelado lento en cámara).

### 10. `tecnica-beurre-blanc` — Casa Nueva

**Chef:**

````text
¿Cómo monto una beurre blanc que no se me corte en pleno servicio?
````

Qué tiene que cumplir:

- Reduce el vino o el vinagre con chalota y monta con mantequilla fría en dados, añadida poco a poco.
- La mantiene templada (aproximadamente 50-65 °C) y advierte que el exceso de calor la corta.
- Indica la señal del punto: emulsión brillante y napante.
- Explica el porqué en pocas palabras (es una emulsión de grasa sobre una base reducida) y cómo mantenerla durante el servicio (baño maría, termo o recipiente templado).
- Es breve: no se extiende en historia ni en variantes que no se pidieron.

### 11. `tecnica-esferificacion-inversa` — Brasa y Koji

**Chef:**

````text
Explícame la esferificación inversa para unas esferas de yogur.
````

Qué tiene que cumplir:

- Da la proporción del baño de alginato (alrededor del 0,5 %) y aclara el calcio: el yogur ya lo aporta y se puede reforzar con gluconolactato cálcico.
- Da los pasos clave con tiempos: reposar el baño para quitar burbujas, unos minutos en el baño y enjuague en agua limpia.
- Indica el error típico o la señal del punto (membrana demasiado fina que se rompe, o burbujas que la debilitan) y el porqué (el alginato gelifica al contacto con el calcio).

### 12. `receta-judiones-es` — Mesón del Arco

**Chef:**

````text
Pásame la receta de unos judiones de La Granja para 10 raciones.
````

Qué tiene que cumplir:

- Indica el rendimiento (10 raciones) y da cantidades métricas para ese total.
- El método va en pasos numerados y los tiempos de cocción llevan la señal para reconocer el punto.
- Cierra con una mejora concreta del plato.
- Respeta la receta tradicional de La Granja, sin técnicas de vanguardia.

### 13. `receta-brodetto-it` — Trattoria da Nella

**Chef:**

````text
Mi scrivi la ricetta del brodetto all'anconetana per 6 persone?
````

Qué tiene que cumplir:

- Responde en italiano.
- Indica el rendimiento (6 raciones) y da cantidades métricas para ese total.
- El método va en pasos numerados y los tiempos de cocción llevan la señal para reconocer el punto.
- Cierra con una mejora concreta del plato.

### 14. `receta-celeriac-en` — Hearth & Field

**Chef:**

````text
Can you give me a recipe for a celeriac and brown butter soup for 8?
````

Qué tiene que cumplir:

- Responde en inglés.
- Indica el rendimiento (8 raciones) y da cantidades métricas para ese total.
- El método va en pasos numerados y los tiempos de cocción llevan la señal para reconocer el punto.
- Cierra con una mejora concreta del plato.

### 15. `registro-voseo` — Fuegos del Sur

**Chef:**

````text
Che, ¿cómo hago para que la molleja me quede crocante por fuera y cremosa por dentro en la parrilla? Contame paso a paso.
````

Qué tiene que cumplir:

- Trata al chef de vos, como él (por ejemplo «blanqueá», «dejala», «fijate»), sin pasarse a tú ni a usted.
- Da pasos concretos con tiempos o temperaturas y la señal del punto (por ejemplo, blanqueado o cocción previa, limpieza de la membrana, intensidad del fuego).
- Explica el porqué de al menos un paso.

### 16. `brevedad-pregunta-rapida` — Casa Nueva

**Chef:**

````text
¿Qué diferencia hay entre un fumet y un caldo de pescado? Rápido.
````

Qué tiene que cumplir:

- Responde en pocas líneas: unas 120 palabras como mucho.
- La diferencia que da es razonable y no contradice el uso profesional (por ejemplo, que el fumet es más corto y concentrado).

### 17. `idea-anclada` — Brasa y Koji

Idea anclada: «Ricciola con cítricos y algo ahumado»

**Chef:**

````text
Desarrollemos esta idea.
````

Qué tiene que cumplir:

- Desarrolla la idea anclada (ricciola, cítricos y algo ahumado) sin desviarse a otro plato.
- Avanza con una propuesta concreta en esta misma respuesta, aunque termine con una pregunta.
- Si propone servir la ricciola cruda o marinada, avisa de la congelación previa por el anisakis.

### 18. `franqueza-chef-insiste` — Brasa y Koji

**Chef:**

````text
Quiero una gelatina de piña fresca, sin cocer el zumo.
````

**Asistente (turno previo fijo):**

````text
La piña fresca no cuaja con gelatina: su bromelina rompe las proteínas de la gelatina. Puedes calentar el zumo a 85 °C unos minutos para inactivarla, o gelificar con agar, que no es una proteína y no le afecta.
````

**Chef:**

````text
Lo quiero igual con el zumo crudo, sin calentarlo. ¿Cómo lo hago lo mejor posible?
````

Qué tiene que cumplir:

- Acepta la decisión del chef y no vuelve a discutirla más allá de una mención breve.
- Propone una solución que funciona con el zumo crudo (gelificar con agar u otro gelificante no proteico), con cantidades concretas.
- Explica cómo gelificar sin calentar el zumo: por ejemplo, hervir el agar en agua y mezclarlo rápido con el zumo a temperatura ambiente, u otro método equivalente.

### 19. `memoria-sin-memoria` — Casa Lumbre (sin memoria)

**Chef:**

````text
Quiero un postre con remolacha para la carta de otoño. Dame direcciones.
````

Qué tiene que cumplir:

- No atribuye al restaurante una tradición, un estilo, un equipo o una despensa concretos que no aparecen en los datos.
- Propone como mucho tres direcciones concretas, cada una con la preparación y sus elementos principales.

### 20. `memoria-declarada-clasica` — Casa Lumbre (declarada clásica)

**Chef:**

````text
Quiero un postre con remolacha para la carta de otoño. Dame direcciones.
````

Qué tiene que cumplir:

- Las direcciones encajan con una cocina clásica castellana (horno, compotas, bizcochos, natillas, helados clásicos u otros postres de tradición) y no usan espumas, esferificaciones, koji ni otras técnicas de vanguardia.
- Las propuestas son sencillas, de dos o tres elementos.
- Propone como mucho tres direcciones concretas.

### 21. `memoria-declarada-vanguardia` — Casa Lumbre (declarada vanguardia)

**Chef:**

````text
Quiero un postre con remolacha para la carta de otoño. Dame direcciones.
````

Qué tiene que cumplir:

- Al menos una dirección usa técnicas modernas o fermentaciones con base técnica.
- Las propuestas tienen varios elementos, en línea con platos complejos.
- Propone como mucho tres direcciones concretas.

### 22. `memoria-conflicto` — Casa Lumbre (conflicto)

**Chef:**

````text
Quiero un postre con remolacha para la carta de otoño. Dame direcciones.
````

Qué tiene que cumplir:

- Sigue lo declarado por el chef (cocina clásica): no propone esferificaciones, espumas ni otras técnicas de vanguardia, aunque aparezcan como tendencia aprendida.
- Propone como mucho tres direcciones concretas.

### 23. `receta-secciones-es` — Brasa y Koji

**Chef:**

````text
Pásame la receta del calamar embutido para 4: el calamar relleno con una farsa de sus patas y terminado con un aceite de chorizo.
````

Qué tiene que cumplir:

- Indica el rendimiento (4 raciones) y da cantidades métricas para ese total.
- Da las tres elaboraciones (el calamar, la farsa y el aceite de chorizo), cada una con sus ingredientes y cantidades.
- El método va en pasos numerados y los tiempos de cocción llevan la señal para reconocer el punto.
- Cierra con una mejora concreta del plato.

### 24. `receta-piezas-it` — Trattoria da Nella

**Chef:**

````text
Mi scrivi la ricetta dei calamari ripieni in umido per 4 persone? Uso calamari interi da circa 300 g l'uno.
````

Qué tiene que cumplir:

- Responde en italiano.
- Indica el rendimiento (4 raciones) y da cantidades métricas para ese total; los calamares van por piezas, con su peso aproximado.
- El método va en pasos numerados y los tiempos de cocción llevan la señal para reconocer el punto.
- Cierra con una mejora concreta del plato.
