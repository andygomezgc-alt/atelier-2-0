// Every user-facing string of the pilot landing (pilot-landing.tsx and landing-story.tsx), per language.
// The phone mockup uses the app's own labels from packages/i18n (es.ts, it.ts, en.ts) so it looks like the real app.
import { CREATIVE_CHAT_LIMIT, DAILY_CHAT_WEEKLY_LIMIT } from "@/lib/ai/budget-policy";
import type { LandingLocale } from "@/lib/landing-locale";

const es = {
  languageLabel: "Idioma",
  skipLink: "Saltar al contenido",
  homeLabel: "Atelier, inicio",
  navLabel: "Navegación principal",
  navHow: "Cómo funciona",
  navPlan: "El plan",
  navCta: "Probar Atelier",

  heroEyebrow: "Hecho para chefs y su equipo",
  // The headline words rise one by one; the swash words carry the underline.
  headline: { first: ["Tu", "cocina", "tiene", "ideas."], second: ["Dales"], swash: ["un", "lugar."] },
  intro: "Tus ideas, recetas y equipo, en un mismo lugar. Un cuaderno creativo que te acompaña dentro y fuera de la cocina.",
  heroCta: "Solicitar acceso al piloto",
  heroCaption: "Piloto para iPhone y Android",

  overview: {
    "title": "De la idea a la carta.",
    "items": [
      {
        "label": "Ideas",
        "title": "Captura la inspiración.",
        "text": "Anota ideas en cuanto aparecen. Un toque y quedan guardadas."
      },
      {
        "label": "Recetas",
        "title": "Dale forma y calcula su costo.",
        "text": "Convierte tus ideas en recetas con ayuda del asistente. Ajusta ingredientes y calcula su costo."
      },
      {
        "label": "Carta y equipo",
        "title": "Comparte el trabajo de tu cocina.",
        "text": "Guarda tus recetas, súmalas a la carta y trabaja con tu equipo en un mismo lugar."
      }
    ]
  },
  tour: {
    "watch": "Ver cómo funciona",
    "preview": "Vista de demostración",
    "invitation": "Conoce Atelier, paso a paso.",
    "pace": "7 pasos, a tu ritmo.",
    "open": "Ver recorrido de la app",
    "back": "Volver al inicio",
    "eyebrow": "Recorrido guiado",
    "title": "Así funciona Atelier.",
    "intro": "Conoce la app, paso a paso y a tu ritmo.",
    "stepsLabel": "Pasos del recorrido",
    "previous": "Anterior",
    "next": "Siguiente",
    "repeat": "Repetir paso",
    "pause": "Pausar",
    "of": "de",
    "demo": "Contenido de demostración"
  },

  moreEyebrow: "Y mucho más",
  moreTitle: ["Todo lo que pasa en tu cocina,", "en el mismo cuaderno."],
  moreText: "Herramientas para el trabajo de cada día, desde la primera idea hasta el servicio.",
  more: [
    { title: "Banco de productos", text: "Cargas cada precio una sola vez y vale para todas tus recetas, con su merma y su rendimiento." },
    { title: "Importa tus recetas", text: "Sube tus recetas de siempre en PDF o Word y quedan en el recetario, listas para editar." },
    { title: "Escala y comparte la ficha", text: "Cambia las porciones de una receta y descarga su ficha técnica en PDF para la partida." },
    { title: "De borrador a aprobada", text: "Cada receta pasa por borrador, en prueba y aprobada, y todos saben en qué punto está." },
    { title: "Un asistente que aprende", text: "Recuerda las tendencias de tu cocina a partir de tus elaboraciones y las tiene en cuenta al proponer." },
    { title: "En iPhone y Android", text: "Toda la brigada trabaja en el mismo espacio, cada persona desde su teléfono." },
  ],

  planEyebrow: "Cuando abramos suscripciones",
  planTitle: ["Un restaurante.", "Un mismo cuaderno."],
  planText: "Estamos probando Atelier con chefs y sus equipos. Esta es la propuesta de lanzamiento; por ahora puedes solicitar acceso al piloto.",
  planName: "Atelier Pro",
  planPer: "Por restaurante",
  price: "49 €",
  priceUnit: "/mes + IVA",
  features: [
    "Un espacio para tus recetas, ideas y menús.",
    "Trabajo compartido con tu equipo.",
    "Asistente para consultas cotidianas y trabajo creativo.",
  ],
  founderLabel: "Descuento fundador",
  founderPrice: "24,50 €/mes + IVA",
  founderBefore: "durante los primeros ",
  founderMonths: "3 meses",
  founderAfter: " de la suscripción.",
  founderLater: "Desde el cuarto mes: ",
  founderLaterPrice: "49 €/mes + IVA.",
  planFootnote: "Antes de contratar conocerás los límites de IA, las condiciones del equipo y la cancelación. Ahora no se solicitan datos de pago.",

  faqEyebrow: "Por si te lo preguntabas",
  faqTitle: ["Lo esencial,", "antes de empezar."],
  faq: [
    {
      question: "¿Puedo usarlo en iPhone y Android?",
      answer: "Sí. En el piloto, iPhone utiliza TestFlight y Android se instala mediante un APK. Al solicitar acceso te indicaremos cómo instalarlo.",
    },
    {
      question: "¿Cómo entra mi equipo?",
      answer: "Quien crea el restaurante lo administra y puede compartir su código de acceso. Cada persona entra con su propia cuenta y trabaja en el mismo espacio del restaurante.",
    },
    {
      question: "¿La IA tiene límites?",
      answer: `Sí. Durante el piloto, cada chef dispone de ${DAILY_CHAT_WEEKLY_LIMIT} mensajes cotidianos y ${CREATIVE_CHAT_LIMIT} creativos por periodo de siete días. El piloto también tiene un presupuesto compartido; puedes consultar la disponibilidad en la app. Los límites del futuro plan se confirmarán antes de contratar.`,
    },
    {
      question: "¿Solicitar acceso inicia una suscripción?",
      answer: "No. El botón abre un correo para pedir acceso al piloto. No inicia una suscripción ni solicita una tarjeta. Antes de abrir los pagos explicaremos cómo cancelar y qué ocurre con tus recetas.",
    },
  ],

  pilotEyebrow: "Probémoslo en una cocina real",
  pilotTitle: ["Tu próximo plato", "puede empezar aquí."],
  pilotText: "Cuéntanos en qué restaurante trabajas y qué teléfono usas. Te explicaremos cómo participar.",
  pilotCta: "Solicitar acceso al piloto",
  pilotHint: "Se abrirá tu aplicación de correo.",
  mailSubject: "Quiero probar Atelier",
  mailBody: "Hola, me gustaría participar en el piloto de Atelier.\n\nMi nombre:\nRestaurante:\nUsamos iPhone / Android:\n",

  footerTagline: "El cuaderno creativo de tu cocina.",
  legalLabel: "Información legal",
  privacy: "Privacidad",
  terms: "Términos",
  deleteAccount: "Eliminar cuenta",

  story: {
    eyebrow: "De la idea a la carta",
    title: "Así trabaja tu cocina en Atelier.",
    steps: [
      { title: "Apunta la idea", text: "Escríbela en el bloc de ideas en cuanto aparece. Un toque y queda guardada." },
      { title: "Dale forma con el asistente", text: "Llévala al asistente y conviértela en un plato, con ingredientes y cantidades." },
      { title: "Guárdala como receta", text: "Queda como borrador, con su costo por porción calculado con tus precios." },
      { title: "Tu equipo la encuentra", text: "Aparece en Recetas, junto a las del resto de la cocina." },
      { title: "Súmala a la carta", text: "Arma tus menús con platos del recetario, ordénalos por secciones y ponles precio." },
      { title: "Escanea tu carta", text: "Hazle una foto a tu carta de siempre y Atelier crea el estilo de la casa para tus PDF." },
      { title: "Cada uno con su rol", text: "Comparte el código del restaurante y trabaja con tu brigada, cada persona con su rol." },
    ],
    phoneLabel: "La app de Atelier: una idea pasa a receta, entra en la carta con el estilo de la casa y la ve toda la brigada. Contenido de demostración.",
    tabs: { home: "Inicio", assistant: "Asistente", recipes: "Recetas", menus: "Menús", house: "Casa" },

    homeExplain: "Tu bloc de cocina. Anota ideas sueltas y trabájalas con el Asistente cuando estés listo.",
    ideaPad: "Bloc de ideas",
    ideaPlaceholder: "Pichón con espuma de café…",
    // The idea is typed in two lines, then saved as one.
    ideaTyped: ["Berenjena asada, algo fresco", "y un crujiente al final…"],
    idea: "Berenjena asada, algo fresco y un crujiente al final…",
    save: "GUARDAR",
    latestIdeas: "Últimas ideas",
    takeToAssistant: "Llevar al asistente",
    otherIdeas: [
      { text: "Pichón, café y zapallo. ¿Para el otoño?", author: "Diego" },
      { text: "Mollejas, cítricos y pimienta larga", author: "Guadalupe" },
    ],

    pinnedIdea: "Idea anclada",
    modeDaily: "Diario",
    modeCreative: "Creativo",
    prompt: "Conviértela en un plato para la carta de otoño.",
    suggests: "Atelier · sugiere",
    answerLines: [
      { quantity: "2", text: "berenjenas, asadas enteras" },
      { quantity: "250 g", text: "de yogur griego al limón" },
      { quantity: "40 g", text: "de almendra marcona" },
      { text: "Aceite de oliva y sal en escamas" },
    ],
    saveRecipe: "Guardar como receta",
    composer: "Escribe o dicta…",

    searchRecipe: "Buscar receta…",
    filters: ["Todas", "Borrador", "En prueba", "Aprobadas"],
    costLabel: "Costo/porc.",
    // The new recipe, and the approved one that goes on the menu with it.
    recipes: {
      created: { title: "Berenjena asada, yogur al limón y almendra tostada", state: "Borrador", cost: "1,85 €" },
      inTest: { title: "Pichón, café y zapallo asado", state: "En prueba", cost: "4,10 €" },
      approved: { title: "Mollejas con cítricos y pimienta larga", state: "Aprobada", cost: "3,60 €" },
    },

    costPerPortion: "Costo por porción",
    costTotal: "Total: 7,40 €",
    portions: "4 porciones",
    noSalePrice: "Sin precio de venta",
    ingredientsLabel: "Ingredientes",
    ingredients: [
      { name: "Berenjena", quantity: "2 u" },
      { name: "Yogur griego", quantity: "250 g" },
      { name: "Almendra marcona", quantity: "40 g" },
      { name: "Limón", quantity: "1 u" },
    ],

    inService: "EN SERVICIO",
    menuMeta: "Otoño 2026 · 4 platos",
    menuTitle: "Carta de otoño",
    menuStyles: ["Elegante", "Rústica", "Minimal", "Tu estilo"],
    sectionName: "Entrantes",
    sectionCount: "2 platos",
    fromRecipeBook: "DESDE RECETARIO",
    addSection: "Agregar sección",
    reviewStyle: "Revisa tu estilo",
    styleHint: "Inspirado en tu carta: colores, letra y disposición.",
    styleRows: ["Berenjena asada, yogur al limón", "Mollejas con cítricos"],
    viewPdf: "Ver PDF real",

    houseEyebrow: "La casa",
    staff: "Staff",
    roles: { admin: "Admin", executiveChef: "Chef ejecutivo", sousChef: "Sous-chef", viewer: "Lector" },
    inviteCode: "Código de invitación",

    ideaSaved: "Idea guardada",
    recipeSaved: "Receta guardada como borrador",
    styleCreated: "Estilo de la casa creado a partir de tu carta",

    frameMenu: "Encuadra tu carta",
    analyzingMenu: "Analizando tu carta…",
    // The paper menu card the camera photographs.
    scannedMenu: [
      {
        section: "Entrantes",
        rows: [
          { name: "Croquetas de jamón", price: "9" },
          { name: "Ensaladilla de la casa", price: "11" },
          { name: "Alcachofas confitadas", price: "13" },
        ],
      },
      {
        section: "Principales",
        rows: [
          { name: "Arroz de pato", price: "22" },
          { name: "Merluza a la brasa", price: "24" },
          { name: "Carrillera al vino tinto", price: "21" },
        ],
      },
      { section: "Postres", rows: [{ name: "Torrija caramelizada", price: "8" }] },
    ],
  },
};

export type LandingCopy = typeof es;

const it: LandingCopy = {
  languageLabel: "Lingua",
  skipLink: "Vai al contenuto",
  homeLabel: "Atelier, pagina iniziale",
  navLabel: "Navigazione principale",
  navHow: "Come funziona",
  navPlan: "Il piano",
  navCta: "Prova Atelier",

  heroEyebrow: "Pensato per gli chef e la loro brigata",
  headline: { first: ["La", "tua", "cucina", "ha", "idee."], second: ["Dagli"], swash: ["una", "casa."] },
  intro: "Le tue idee, le ricette e la brigata, tutto in un unico posto. Un quaderno creativo che ti accompagna dentro e fuori dalla cucina.",
  heroCta: "Richiedi accesso al pilota",
  heroCaption: "Fase pilota per iPhone e Android",

  overview: {
    "title": "Dall’idea al menu.",
    "items": [
      {
        "label": "Idee",
        "title": "Cattura l’ispirazione.",
        "text": "Annota le idee appena arrivano. Un tocco e sono salvate."
      },
      {
        "label": "Ricette",
        "title": "Dai forma alle idee e calcola il costo.",
        "text": "Trasforma le idee in ricette con l’aiuto dell’assistente. Modifica gli ingredienti e calcola il costo."
      },
      {
        "label": "Menu e brigata",
        "title": "Condividi il lavoro della tua cucina.",
        "text": "Salva le ricette, aggiungile al menu e lavora con la brigata in un unico posto."
      }
    ]
  },
  tour: {
    "watch": "Scopri come funziona",
    "preview": "Anteprima dimostrativa",
    "invitation": "Scopri Atelier, passo dopo passo.",
    "pace": "7 passi, al tuo ritmo.",
    "open": "Esplora l’app",
    "back": "Torna alla pagina iniziale",
    "eyebrow": "Percorso guidato",
    "title": "Ecco come funziona Atelier.",
    "intro": "Scopri l’app, passo dopo passo e al tuo ritmo.",
    "stepsLabel": "Passi del percorso",
    "previous": "Indietro",
    "next": "Avanti",
    "repeat": "Ripeti il passo",
    "pause": "Pausa",
    "of": "di",
    "demo": "Contenuto dimostrativo"
  },

  moreEyebrow: "E molto altro",
  moreTitle: ["Tutto quello che succede nella tua cucina,", "nello stesso quaderno."],
  moreText: "Strumenti per il lavoro di ogni giorno, dalla prima idea al servizio.",
  more: [
    { title: "Banco prodotti", text: "Inserisci ogni prezzo una volta sola e vale per tutte le tue ricette, con il suo scarto e la sua resa." },
    { title: "Importa le tue ricette", text: "Carica le tue ricette di sempre in PDF o Word e finiscono nel ricettario, pronte da modificare." },
    { title: "Scala e condividi la scheda", text: "Cambia le porzioni di una ricetta e scarica la sua scheda tecnica in PDF per la partita." },
    { title: "Da bozza ad approvata", text: "Ogni ricetta passa da bozza a in prova fino ad approvata, e tutti sanno a che punto è." },
    { title: "Un assistente che impara", text: "Ricorda le tendenze della tua cucina a partire dalle tue preparazioni e ne tiene conto quando propone." },
    { title: "Su iPhone e Android", text: "Tutta la brigata lavora nello stesso spazio, ognuno dal proprio telefono." },
  ],

  planEyebrow: "Quando apriremo gli abbonamenti",
  planTitle: ["Un ristorante.", "Un unico quaderno."],
  planText: "Stiamo provando Atelier con gli chef e le loro brigate. Questa è la proposta di lancio; per ora puoi richiedere l’accesso al pilota.",
  planName: "Atelier Pro",
  planPer: "Per ristorante",
  price: "49 €",
  priceUnit: "/mese + IVA",
  features: [
    "Uno spazio per le tue ricette, le idee e i menù.",
    "Lavoro condiviso con la tua brigata.",
    "Un assistente per le domande di tutti i giorni e per il lavoro creativo.",
  ],
  founderLabel: "Sconto fondatore",
  founderPrice: "24,50 €/mese + IVA",
  founderBefore: "per i primi ",
  founderMonths: "3 mesi",
  founderAfter: " di abbonamento.",
  founderLater: "Dal quarto mese: ",
  founderLaterPrice: "49 €/mese + IVA.",
  planFootnote: "Prima di abbonarti conoscerai i limiti dell’IA, le condizioni per la brigata e come disdire. Per ora non ti chiediamo dati di pagamento.",

  faqEyebrow: "Se te lo stavi chiedendo",
  faqTitle: ["L’essenziale,", "prima di iniziare."],
  faq: [
    {
      question: "Posso usarlo su iPhone e Android?",
      answer: "Sì. Durante il pilota, su iPhone si usa TestFlight e su Android si installa con un APK. Quando richiedi l’accesso ti spieghiamo come installarlo.",
    },
    {
      question: "Come entra la mia brigata?",
      answer: "Chi crea il ristorante lo amministra e può condividere il suo codice d’invito. Ognuno entra con il proprio account e lavora nello stesso spazio del ristorante.",
    },
    {
      question: "L’IA ha dei limiti?",
      answer: `Sì. Durante il pilota, ogni chef ha ${DAILY_CHAT_WEEKLY_LIMIT} messaggi quotidiani e ${CREATIVE_CHAT_LIMIT} creativi ogni sette giorni. Il pilota ha anche un budget condiviso; puoi controllare la disponibilità nell’app. I limiti del piano futuro verranno confermati prima dell’abbonamento.`,
    },
    {
      question: "Richiedere l’accesso avvia un abbonamento?",
      answer: "No. Il pulsante apre un’email per chiedere l’accesso al pilota. Non avvia nessun abbonamento e non ti chiede una carta. Prima di aprire i pagamenti ti spiegheremo come disdire e cosa succede alle tue ricette.",
    },
  ],

  pilotEyebrow: "Proviamolo in una cucina vera",
  pilotTitle: ["Il tuo prossimo piatto", "può nascere qui."],
  pilotText: "Raccontaci in che ristorante lavori e che telefono usi. Ti spiegheremo come partecipare.",
  pilotCta: "Richiedi l’accesso al pilota",
  pilotHint: "Si aprirà la tua app di posta.",
  mailSubject: "Voglio provare Atelier",
  mailBody: "Ciao, mi piacerebbe partecipare al pilota di Atelier.\n\nIl mio nome:\nRistorante:\nUsiamo iPhone / Android:\n",

  footerTagline: "Il quaderno creativo della tua cucina.",
  legalLabel: "Note legali",
  privacy: "Privacy",
  terms: "Termini",
  deleteAccount: "Elimina account",

  story: {
    eyebrow: "Dall’idea alla carta",
    title: "Così lavora la tua cucina in Atelier.",
    steps: [
      { title: "Annota l’idea", text: "Scrivila nel blocco delle idee appena arriva. Un tocco e resta salvata." },
      { title: "Dalle forma con l’assistente", text: "Portala all’assistente e trasformala in un piatto, con ingredienti e quantità." },
      { title: "Salvala come ricetta", text: "Resta in bozza, con il costo per porzione calcolato sui tuoi prezzi." },
      { title: "La tua brigata la trova", text: "Compare in Ricette, insieme a quelle del resto della cucina." },
      { title: "Mettila in carta", text: "Componi i tuoi menù con i piatti del ricettario, ordinali per sezioni e dai a ognuno il suo prezzo." },
      { title: "Scansiona la tua carta", text: "Fai una foto alla tua carta di sempre e Atelier crea lo stile della casa per i tuoi PDF." },
      { title: "Ognuno con il suo ruolo", text: "Condividi il codice del ristorante e lavora con la tua brigata, ognuno con il proprio ruolo." },
    ],
    phoneLabel: "L’app di Atelier: un’idea diventa ricetta, entra in carta con lo stile della casa e la vede tutta la brigata. Contenuti dimostrativi.",
    tabs: { home: "Inizio", assistant: "Assistente", recipes: "Ricette", menus: "Menù", house: "Casa" },

    homeExplain: "Il tuo blocco di cucina. Annota idee sciolte e lavorale con l'Assistente quando vorrai.",
    ideaPad: "Blocco delle idee",
    ideaPlaceholder: "Piccione con spuma di caffè…",
    ideaTyped: ["Melanzana arrosto, qualcosa di fresco", "e una nota croccante alla fine…"],
    idea: "Melanzana arrosto, qualcosa di fresco e una nota croccante alla fine…",
    save: "SALVA",
    latestIdeas: "Ultime idee",
    takeToAssistant: "Porta all'assistente",
    otherIdeas: [
      { text: "Piccione, caffè e zucca. Per l’autunno?", author: "Diego" },
      { text: "Animelle, agrumi e pepe lungo", author: "Guadalupe" },
    ],

    pinnedIdea: "Idea ancorata",
    modeDaily: "Quotidiano",
    modeCreative: "Creativo",
    prompt: "Trasformala in un piatto per la carta d’autunno.",
    suggests: "Atelier · suggerisce",
    answerLines: [
      { quantity: "2", text: "melanzane, arrostite intere" },
      { quantity: "250 g", text: "di yogurt greco al limone" },
      { quantity: "40 g", text: "di mandorle di Avola" },
      { text: "Olio extravergine e sale in fiocchi" },
    ],
    saveRecipe: "Salva come ricetta",
    composer: "Scrivi o detta…",

    searchRecipe: "Cerca ricetta…",
    filters: ["Tutte", "Bozza", "In prova", "Approvate"],
    costLabel: "Costo/porz.",
    recipes: {
      created: { title: "Melanzana arrosto, yogurt al limone e mandorla tostata", state: "Bozza", cost: "1,85 €" },
      inTest: { title: "Piccione, caffè e zucca arrosto", state: "In prova", cost: "4,10 €" },
      approved: { title: "Animelle con agrumi e pepe lungo", state: "Approvata", cost: "3,60 €" },
    },

    costPerPortion: "Costo per porzione",
    costTotal: "Totale: 7,40 €",
    portions: "4 porzioni",
    noSalePrice: "Senza prezzo di vendita",
    ingredientsLabel: "Ingredienti",
    ingredients: [
      { name: "Melanzana", quantity: "2 pz" },
      { name: "Yogurt greco", quantity: "250 g" },
      { name: "Mandorle di Avola", quantity: "40 g" },
      { name: "Limone", quantity: "1 pz" },
    ],

    inService: "IN SERVIZIO",
    menuMeta: "Autunno 2026 · 4 piatti",
    menuTitle: "Carta d’autunno",
    menuStyles: ["Elegante", "Rustico", "Minimal", "Il tuo stile"],
    sectionName: "Antipasti",
    sectionCount: "2 piatti",
    fromRecipeBook: "DAL RICETTARIO",
    addSection: "Aggiungi sezione",
    reviewStyle: "Controlla il tuo stile",
    styleHint: "Ispirato alla tua carta: colori, carattere e disposizione.",
    styleRows: ["Melanzana arrosto, yogurt al limone", "Animelle con agrumi"],
    viewPdf: "Vedi il PDF reale",

    houseEyebrow: "La casa",
    staff: "Staff",
    roles: { admin: "Admin", executiveChef: "Chef esecutivo", sousChef: "Sous-chef", viewer: "Lettore" },
    inviteCode: "Codice d'invito",

    ideaSaved: "Idea salvata",
    recipeSaved: "Ricetta salvata come bozza",
    styleCreated: "Stile della casa creato dalla tua carta",

    frameMenu: "Inquadra la tua carta",
    analyzingMenu: "Stiamo analizzando la tua carta…",
    scannedMenu: [
      {
        section: "Antipasti",
        rows: [
          { name: "Crocchette di baccalà", price: "9" },
          { name: "Insalata russa della casa", price: "11" },
          { name: "Carciofi confit", price: "13" },
        ],
      },
      {
        section: "Secondi",
        rows: [
          { name: "Riso all’anatra", price: "22" },
          { name: "Nasello alla brace", price: "24" },
          { name: "Guancia al vino rosso", price: "21" },
        ],
      },
      { section: "Dolci", rows: [{ name: "Pan perduto caramellato", price: "8" }] },
    ],
  },
};

const en: LandingCopy = {
  languageLabel: "Language",
  skipLink: "Skip to content",
  homeLabel: "Atelier, home",
  navLabel: "Main navigation",
  navHow: "How it works",
  navPlan: "The plan",
  navCta: "Try Atelier",

  heroEyebrow: "Made for chefs and their team",
  headline: { first: ["Your", "kitchen", "has", "ideas."], second: ["Give", "them"], swash: ["a", "home."] },
  intro: "Your ideas, recipes and team, all in one place. A creative notebook that goes with you in and out of the kitchen.",
  heroCta: "Request pilot access",
  heroCaption: "Pilot for iPhone and Android",

  overview: {
    "title": "From idea to menu.",
    "items": [
      {
        "label": "Ideas",
        "title": "Capture the inspiration.",
        "text": "Note ideas as they come. One tap and they are saved."
      },
      {
        "label": "Recipes",
        "title": "Shape your idea and cost it.",
        "text": "Turn ideas into recipes with the assistant. Adjust ingredients and calculate the cost."
      },
      {
        "label": "Menu and team",
        "title": "Share the work of your kitchen.",
        "text": "Save your recipes, add them to the menu and work with your team in one place."
      }
    ]
  },
  tour: {
    "watch": "See how it works",
    "preview": "Demo preview",
    "invitation": "Get to know Atelier, step by step.",
    "pace": "7 steps, at your own pace.",
    "open": "Explore the app",
    "back": "Back to home",
    "eyebrow": "Guided tour",
    "title": "This is how Atelier works.",
    "intro": "Discover the app, step by step and at your own pace.",
    "stepsLabel": "Tour steps",
    "previous": "Previous",
    "next": "Next",
    "repeat": "Replay step",
    "pause": "Pause",
    "of": "of",
    "demo": "Demonstration content"
  },

  moreEyebrow: "And much more",
  moreTitle: ["Everything that happens in your kitchen,", "in the same notebook."],
  moreText: "Tools for everyday kitchen work, from the first idea to service.",
  more: [
    { title: "Product bank", text: "Enter each price once and it works for all your recipes, with its waste and yield." },
    { title: "Import your recipes", text: "Upload the recipes you already use as PDF or Word and they land in the recipe book, ready to edit." },
    { title: "Scale and share the sheet", text: "Change a recipe’s portions and download its spec sheet as a PDF for the station." },
    { title: "From draft to approved", text: "Every recipe goes from draft to in test to approved, and everyone knows where it stands." },
    { title: "An assistant that learns", text: "It remembers your kitchen’s tendencies from your preparations and takes them into account when it suggests." },
    { title: "On iPhone and Android", text: "The whole brigade works in the same space, each person from their own phone." },
  ],

  planEyebrow: "When subscriptions open",
  planTitle: ["One restaurant.", "One notebook."],
  planText: "We’re testing Atelier with chefs and their teams. This is the launch offer; for now you can request access to the pilot.",
  planName: "Atelier Pro",
  planPer: "Per restaurant",
  price: "€49",
  priceUnit: "/month + VAT",
  features: [
    "A space for your recipes, ideas and menus.",
    "Shared work with your team.",
    "An assistant for everyday questions and creative work.",
  ],
  founderLabel: "Founder discount",
  founderPrice: "€24.50/month + VAT",
  founderBefore: "for the first ",
  founderMonths: "3 months",
  founderAfter: " of your subscription.",
  founderLater: "From the fourth month: ",
  founderLaterPrice: "€49/month + VAT.",
  planFootnote: "Before you subscribe, you’ll know the AI limits, the team terms and how to cancel. No payment details are requested now.",

  faqEyebrow: "In case you were wondering",
  faqTitle: ["The essentials,", "before you start."],
  faq: [
    {
      question: "Can I use it on iPhone and Android?",
      answer: "Yes. During the pilot, iPhone uses TestFlight and Android installs from an APK. When you request access, we’ll tell you how to install it.",
    },
    {
      question: "How does my team join?",
      answer: "Whoever creates the restaurant manages it and can share its invite code. Each person signs in with their own account and works in the same restaurant space.",
    },
    {
      question: "Does the AI have limits?",
      answer: `Yes. During the pilot, each chef gets ${DAILY_CHAT_WEEKLY_LIMIT} everyday messages and ${CREATIVE_CHAT_LIMIT} creative ones per seven-day period. The pilot also has a shared budget; you can check what’s left in the app. The limits of the future plan will be confirmed before you subscribe.`,
    },
    {
      question: "Does requesting access start a subscription?",
      answer: "No. The button opens an email to request pilot access. It doesn’t start a subscription or ask for a card. Before payments open, we’ll explain how to cancel and what happens to your recipes.",
    },
  ],

  pilotEyebrow: "Let’s try it in a real kitchen",
  pilotTitle: ["Your next dish", "can start here."],
  pilotText: "Tell us which restaurant you work at and which phone you use. We’ll explain how to take part.",
  pilotCta: "Request pilot access",
  pilotHint: "Your email app will open.",
  mailSubject: "I want to try Atelier",
  mailBody: "Hi, I’d like to take part in the Atelier pilot.\n\nMy name:\nRestaurant:\nWe use iPhone / Android:\n",

  footerTagline: "Your kitchen’s creative notebook.",
  legalLabel: "Legal information",
  privacy: "Privacy",
  terms: "Terms",
  deleteAccount: "Delete account",

  story: {
    eyebrow: "From idea to menu",
    title: "This is how your kitchen works in Atelier.",
    steps: [
      { title: "Jot down the idea", text: "Write it in the idea pad the moment it comes. One tap and it’s saved." },
      { title: "Shape it with the assistant", text: "Take it to the assistant and turn it into a dish, with ingredients and quantities." },
      { title: "Save it as a recipe", text: "It stays as a draft, with its cost per portion worked out from your prices." },
      { title: "Your team finds it", text: "It shows up in Recipes, next to the rest of the kitchen’s." },
      { title: "Put it on the menu", text: "Build your menus from recipe book dishes, sort them into sections and price them." },
      { title: "Scan your menu card", text: "Take a photo of the menu card you already have and Atelier creates the house style for your PDFs." },
      { title: "Everyone in their role", text: "Share the restaurant code and work with your brigade, each person in their own role." },
    ],
    phoneLabel: "The Atelier app: an idea becomes a recipe, goes on the menu in the house style and the whole brigade sees it. Demo content.",
    tabs: { home: "Home", assistant: "Assistant", recipes: "Recipes", menus: "Menus", house: "House" },

    homeExplain: "Your kitchen notebook. Jot down loose ideas and work them with the Assistant when you're ready.",
    ideaPad: "Idea pad",
    ideaPlaceholder: "Pigeon with coffee foam…",
    ideaTyped: ["Roast aubergine, something fresh", "and a crunch to finish…"],
    idea: "Roast aubergine, something fresh and a crunch to finish…",
    save: "SAVE",
    latestIdeas: "Latest ideas",
    takeToAssistant: "Take to assistant",
    otherIdeas: [
      { text: "Pigeon, coffee and squash. For autumn?", author: "Diego" },
      { text: "Sweetbreads, citrus and long pepper", author: "Guadalupe" },
    ],

    pinnedIdea: "Anchored idea",
    modeDaily: "Everyday",
    modeCreative: "Creative",
    prompt: "Turn it into a dish for the autumn menu.",
    suggests: "Atelier · suggests",
    answerLines: [
      { quantity: "2", text: "aubergines, roasted whole" },
      { quantity: "250 g", text: "lemon Greek yogurt" },
      { quantity: "40 g", text: "Marcona almonds" },
      { text: "Olive oil and flaky salt" },
    ],
    saveRecipe: "Save as recipe",
    composer: "Type or dictate…",

    searchRecipe: "Search recipe…",
    filters: ["All", "Draft", "In test", "Approved"],
    costLabel: "Cost/portion",
    recipes: {
      created: { title: "Roast aubergine, lemon yogurt and toasted almond", state: "Draft", cost: "€1.85" },
      inTest: { title: "Pigeon, coffee and roast squash", state: "In test", cost: "€4.10" },
      approved: { title: "Sweetbreads with citrus and long pepper", state: "Approved", cost: "€3.60" },
    },

    costPerPortion: "Cost per portion",
    costTotal: "Total: €7.40",
    portions: "4 portions",
    noSalePrice: "No sale price",
    ingredientsLabel: "Ingredients",
    ingredients: [
      { name: "Aubergine", quantity: "2 pcs" },
      { name: "Greek yogurt", quantity: "250 g" },
      { name: "Marcona almonds", quantity: "40 g" },
      { name: "Lemon", quantity: "1 pc" },
    ],

    inService: "IN SERVICE",
    menuMeta: "Autumn 2026 · 4 dishes",
    menuTitle: "Autumn menu",
    menuStyles: ["Elegant", "Rustic", "Minimal", "Your style"],
    sectionName: "Starters",
    sectionCount: "2 dishes",
    fromRecipeBook: "FROM RECIPE BOOK",
    addSection: "Add section",
    reviewStyle: "Review your style",
    styleHint: "Inspired by your menu card: colors, type, and layout.",
    styleRows: ["Roast aubergine, lemon yogurt", "Sweetbreads with citrus"],
    viewPdf: "View real PDF",

    houseEyebrow: "The house",
    staff: "Staff",
    roles: { admin: "Admin", executiveChef: "Executive chef", sousChef: "Sous chef", viewer: "Viewer" },
    inviteCode: "Invite code",

    ideaSaved: "Idea saved",
    recipeSaved: "Recipe saved as draft",
    styleCreated: "House style created from your menu card",

    frameMenu: "Frame your menu card",
    analyzingMenu: "Analyzing your menu card…",
    scannedMenu: [
      {
        section: "Starters",
        rows: [
          { name: "Ham croquettes", price: "9" },
          { name: "House potato salad", price: "11" },
          { name: "Confit artichokes", price: "13" },
        ],
      },
      {
        section: "Mains",
        rows: [
          { name: "Duck rice", price: "22" },
          { name: "Grilled hake", price: "24" },
          { name: "Beef cheek in red wine", price: "21" },
        ],
      },
      { section: "Desserts", rows: [{ name: "Caramelised French toast", price: "8" }] },
    ],
  },
};

export const landingCopy: Record<LandingLocale, LandingCopy> = { it, es, en };
