export type Lang = "it" | "es";

export type LandingCopy = {
  langLabel: string;
  otherLangHref: string;
  otherLangLabel: string;
  hero: {
    title: string;
    subtitle: string;
    cta: string;
    ctaNote: string;
    whatsapp: string;
  };
  trust: string[];
  problem: {
    title: string;
    pains: { title: string; body: string }[];
  };
  how: {
    title: string;
    steps: { title: string; body: string }[];
  };
  features: {
    title: string;
    items: { title: string; body: string }[];
  };
  pricing: {
    title: string;
    proLabel: string;
    proPrice: string;
    proVat: string;
    proFeatures: string[];
    founderLabel: string;
    founderPrice: string;
    founderForever: string;
    founderAnchor: string;
    founderSeats: (left: number) => string;
    founderWhy: string;
    cta: string;
    ctaNote: string;
    finePrint: string;
  };
  founder: {
    title: string;
    body: string[];
  };
  faq: {
    title: string;
    items: { q: string; a: string }[];
  };
  finalCta: {
    title: string;
    cta: string;
    note: string;
  };
  reserve: {
    title: string;
    subtitle: string;
    emailLabel: string;
    restaurantLabel: string;
    submit: string;
    sending: string;
    ok: string;
    error: string;
    whatsappAlt: string;
  };
  sticky: {
    price: string;
    cta: string;
  };
  mockup: {
    dish: string;
    ingredients: string[];
    costLabel: string;
    cost: string;
    marginLabel: string;
    margin: string;
  };
  footer: {
    tagline: string;
    privacy: string;
    terms: string;
    deleteAccount: string;
  };
};

export const it: LandingCopy = {
  langLabel: "IT",
  otherLangHref: "/es",
  otherLangLabel: "ES",
  hero: {
    title: "Il food cost di ogni piatto, senza Excel",
    subtitle:
      "Atelier è il quaderno dello chef: ricette, food cost, menù e un assistente IA, sul tuo telefono. Fatto per ristoranti indipendenti.",
    cta: "Prenota il tuo posto da Socio Fondatore",
    ctaNote: "Nessun pagamento ora · Ti rispondo io, Andy",
    whatsapp: "Scrivimi su WhatsApp",
  },
  trust: [
    "Usato ogni sera in un ristorante vero, nelle Marche",
    "Nato in una cucina, non in un ufficio",
    "Dati al sicuro nell’UE",
  ],
  problem: {
    title: "Ti suona familiare?",
    pains: [
      {
        title: "Soldi che scappano da ogni piatto",
        body: "Prezzi fatti a occhio. Se il food cost supera il 35%, stai regalando margine ogni sera.",
      },
      {
        title: "Ricette nei quaderni e nella testa",
        body: "Le ricette vivono nei quaderni e nella testa dello chef. Quando manca lui, manca tutto.",
      },
      {
        title: "L’Excel di mezzanotte",
        body: "L’unico momento per aggiornare i costi è dopo il servizio, alle 23:30, davanti a un foglio di calcolo.",
      },
    ],
  },
  how: {
    title: "Come funziona",
    steps: [
      {
        title: "Carica le tue ricette",
        body: "Scrivile, fotografa il quaderno o carica il PDF: l’IA le trasforma in schede complete.",
      },
      {
        title: "Guarda il costo di ogni piatto",
        body: "Food cost automatico con i tuoi prezzi. Aumenta o riduci le porzioni senza rifare i conti.",
      },
      {
        title: "Componi il menù e condividilo",
        body: "Modelli pronti + “Il tuo stile”: l’IA copia il design del tuo menù attuale. PDF pronto da stampare.",
      },
    ],
  },
  features: {
    title: "Tutto quello che serve. Niente di più.",
    items: [
      {
        title: "Conosci il tuo margine prima di fare il prezzo",
        body: "Food cost e margine di ogni ricetta, aggiornati con i tuoi prezzi reali.",
      },
      {
        title: "Tutte le ricette del locale, in tutti i telefoni",
        body: "La brigata intera con le stesse schede, senza costi per utente.",
      },
      {
        title: "Da ricetta a menù stampato in minuti",
        body: "Menù con il tuo design, esportati in PDF pronti per la sala.",
      },
      {
        title: "Un aiutante che capisce di cucina",
        body: "Mostragli la foto di una ricetta e ti prepara la scheda. Chat e dettatura vocale incluse.",
      },
    ],
  },
  pricing: {
    title: "Un prezzo solo, tutto incluso",
    proLabel: "Pro",
    proPrice: "49 €/mese",
    proVat: "+ IVA · prezzi IVA esclusa",
    proFeatures: [
      "Assistente IA incluso (politica di fair use)",
      "Ricette, menù e food cost illimitati",
      "Utenti illimitati, zero costi a persona",
      "Export PDF e CSV, sempre tuoi",
      "Senza vincoli: disdici quando vuoi",
    ],
    founderLabel: "Socio Fondatore",
    founderPrice: "24,50 €/mese",
    founderForever: "per sempre",
    founderAnchor: "49 €",
    founderSeats: (left) =>
      left === 1 ? "Resta 1 posto su 10" : `Restano ${left} posti su 10`,
    founderWhy:
      "Per i primi 10 ristoranti che ci aiutano a rifinire Atelier con il loro feedback. Metà prezzo, bloccato per sempre.",
    cta: "Prenota il tuo posto",
    ctaNote: "Nessun pagamento ora · Ti rispondo io, Andy",
    finePrint:
      "La prenotazione garantisce il prezzo da fondatore. Quando attiveremo i pagamenti riceverai il link: il posto resta bloccato per te per 14 giorni. Le prenotazioni si scalano dal contatore.",
  },
  founder: {
    title: "Nato in una cucina vera",
    body: [
      "Prima: ricette sui quaderni, prezzi fatti a occhio, l’Excel dopo il servizio.",
      "Dopo: ogni ricetta con costo, margine e scheda, sul telefono di tutta la brigata.",
      "Atelier è nato dentro un ristorante vero, non in un ufficio. Lo costruisco ogni giorno con gli chef che lo usano ogni sera. Se mi scrivi, ti rispondo io. — Andy",
    ],
  },
  faq: {
    title: "Domande dirette, risposte dirette",
    items: [
      {
        q: "Devo capire di informatica?",
        a: "No. Se usi WhatsApp, sai già usare Atelier.",
      },
      {
        q: "Le mie ricette sono mie? Posso portarle via?",
        a: "Sì, sempre: export in PDF e CSV in qualsiasi momento, anche se te ne vai. L’export non si blocca mai.",
      },
      {
        q: "Quanto ci vuole per partire?",
        a: "Minuti, non settimane. Carichi le prime ricette e sei operativo.",
      },
      {
        q: "Il prezzo include l’IVA? C’è un vincolo?",
        a: "49 € + IVA. Nessun vincolo di permanenza: disdici quando vuoi.",
      },
      {
        q: "Quanti utenti posso avere?",
        a: "Illimitati: tutta la brigata senza costi a persona.",
      },
      {
        q: "Funziona sul mio telefono?",
        a: "Oggi su Android; iPhone in arrivo.",
      },
      {
        q: "Che fine fanno i miei dati?",
        a: "Sono tuoi, su server nell’UE, nel rispetto del GDPR. Puoi eliminare l’account dall’app quando vuoi.",
      },
    ],
  },
  finalCta: {
    title: "10 posti da fondatore. Metà prezzo, per sempre.",
    cta: "Prenota il tuo posto",
    note: "Nessun pagamento ora · Ti rispondo io, Andy",
  },
  reserve: {
    title: "Prenota il tuo posto da Socio Fondatore",
    subtitle:
      "Lasciami email e nome del ristorante: ti scrivo io per completare la prenotazione. Nessun pagamento ora.",
    emailLabel: "La tua email",
    restaurantLabel: "Nome del ristorante",
    submit: "Prenota il posto",
    sending: "Invio…",
    ok: "Fatto! Ti scrivo entro 24 ore per confermare il posto.",
    error: "Qualcosa è andato storto. Riprova, o scrivimi su WhatsApp.",
    whatsappAlt: "Preferisci WhatsApp?",
  },
  sticky: {
    price: "Fondatore 24,50 €/mese per sempre",
    cta: "Prenota il posto",
  },
  mockup: {
    dish: "Tagliatelle al ragù bianco",
    ingredients: ["Tagliatelle fresche", "Salsiccia di Mora", "Parmigiano 24 mesi", "Burro, salvia"],
    costLabel: "Food cost",
    cost: "3,42 €",
    marginLabel: "Margine",
    margin: "74%",
  },
  footer: {
    tagline: "Il quaderno dello chef",
    privacy: "Privacy",
    terms: "Termini",
    deleteAccount: "Elimina account",
  },
};

export const es: LandingCopy = {
  langLabel: "ES",
  otherLangHref: "/",
  otherLangLabel: "IT",
  hero: {
    title: "El escandallo de cada plato, sin Excel",
    subtitle:
      "Atelier es el cuaderno del chef: recetas, escandallos, menús y un asistente IA, en tu teléfono. Hecho para restaurantes independientes.",
    cta: "Reservá tu lugar de Socio Fundador",
    ctaNote: "No pagás nada ahora · Te contesto yo, Andy",
    whatsapp: "Escribime por WhatsApp",
  },
  trust: [
    "Usado cada noche en un restaurante real, en Italia",
    "Nacido en una cocina, no en una oficina",
    "Datos seguros en la UE",
  ],
  problem: {
    title: "¿Te suena?",
    pains: [
      {
        title: "Dinero que se escapa en cada plato",
        body: "Precios puestos a ojo. Si tu food cost pasa del 35%, estás regalando margen cada noche.",
      },
      {
        title: "Recetas en libretas y en la cabeza",
        body: "Las recetas viven en libretas y en la cabeza del chef. Cuando él falta, falta todo.",
      },
      {
        title: "El Excel de medianoche",
        body: "El único momento para actualizar costos es después del servicio, a las 23:30, frente a una planilla.",
      },
    ],
  },
  how: {
    title: "Cómo funciona",
    steps: [
      {
        title: "Cargá tus recetas",
        body: "Escribilas, sacale foto a la libreta o pasale el PDF: la IA las convierte en fichas completas.",
      },
      {
        title: "Mirá el costo de cada plato",
        body: "Food cost automático con tus precios. Escalá las porciones sin recalcular a mano.",
      },
      {
        title: "Armá el menú y compartilo",
        body: "Plantillas listas + “Tu estilo”: la IA copia el diseño de tu carta actual. PDF listo para imprimir.",
      },
    ],
  },
  features: {
    title: "Todo lo que hace falta. Nada más.",
    items: [
      {
        title: "Conocé tu margen antes de poner el precio",
        body: "Food cost y margen de cada receta, actualizados con tus precios reales.",
      },
      {
        title: "Todas las recetas del local, en todos los teléfonos",
        body: "El equipo entero con las mismas fichas, sin costo por usuario.",
      },
      {
        title: "De receta a carta impresa en minutos",
        body: "Menús con tu diseño, exportados en PDF listos para el salón.",
      },
      {
        title: "Un ayudante que entiende de cocina",
        body: "Mostrale la foto de una receta y te arma la ficha. Chat y dictado por voz incluidos.",
      },
    ],
  },
  pricing: {
    title: "Un solo precio, todo incluido",
    proLabel: "Pro",
    proPrice: "49 €/mes",
    proVat: "+ IVA · precios sin IVA",
    proFeatures: [
      "Asistente IA incluido (uso justo)",
      "Recetas, menús y escandallos ilimitados",
      "Usuarios ilimitados, cero costo por persona",
      "Export PDF y CSV, siempre tuyos",
      "Sin permanencia: cancelá cuando quieras",
    ],
    founderLabel: "Socio Fundador",
    founderPrice: "24,50 €/mes",
    founderForever: "para siempre",
    founderAnchor: "49 €",
    founderSeats: (left) =>
      left === 1 ? "Queda 1 lugar de 10" : `Quedan ${left} lugares de 10`,
    founderWhy:
      "Para los primeros 10 restaurantes que nos ayudan a pulir Atelier con su feedback. Mitad de precio, congelado para siempre.",
    cta: "Reservá tu lugar",
    ctaNote: "No pagás nada ahora · Te contesto yo, Andy",
    finePrint:
      "La reserva garantiza el precio de fundador. Cuando activemos los cobros te llega el link: tu lugar queda bloqueado para vos por 14 días. Las reservas se descuentan del contador.",
  },
  founder: {
    title: "Nacido en una cocina real",
    body: [
      "Antes: recetas en libretas, precios a ojo, el Excel después del servicio.",
      "Después: cada receta con costo, margen y ficha, en el teléfono de todo el equipo.",
      "Atelier nació dentro de un restaurante real, no en una oficina. Lo construyo cada día con los chefs que lo usan cada noche. Si me escribís, te contesto yo. — Andy",
    ],
  },
  faq: {
    title: "Preguntas directas, respuestas directas",
    items: [
      {
        q: "¿Necesito saber de informática?",
        a: "No. Si usás WhatsApp, ya sabés usar Atelier.",
      },
      {
        q: "¿Mis recetas son mías? ¿Puedo llevármelas?",
        a: "Sí, siempre: export en PDF y CSV en cualquier momento, incluso si te vas. La exportación jamás se bloquea.",
      },
      {
        q: "¿Cuánto lleva arrancar?",
        a: "Minutos, no semanas. Cargás las primeras recetas y ya estás trabajando.",
      },
      {
        q: "¿El precio incluye IVA? ¿Hay permanencia?",
        a: "49 € + IVA. Sin permanencia: cancelás cuando quieras.",
      },
      {
        q: "¿Cuántos usuarios puedo tener?",
        a: "Ilimitados: todo tu equipo sin costo por persona.",
      },
      {
        q: "¿Funciona en mi teléfono?",
        a: "Hoy en Android; iPhone en camino.",
      },
      {
        q: "¿Qué pasa con mis datos?",
        a: "Son tuyos, en servidores de la UE, cumpliendo el RGPD (GDPR). Podés eliminar la cuenta desde la app cuando quieras.",
      },
    ],
  },
  finalCta: {
    title: "10 lugares de fundador. Mitad de precio, para siempre.",
    cta: "Reservá tu lugar",
    note: "No pagás nada ahora · Te contesto yo, Andy",
  },
  reserve: {
    title: "Reservá tu lugar de Socio Fundador",
    subtitle:
      "Dejame tu email y el nombre del restaurante: te escribo yo para completar la reserva. No pagás nada ahora.",
    emailLabel: "Tu email",
    restaurantLabel: "Nombre del restaurante",
    submit: "Reservar mi lugar",
    sending: "Enviando…",
    ok: "¡Listo! Te escribo en menos de 24 horas para confirmar tu lugar.",
    error: "Algo salió mal. Probá de nuevo, o escribime por WhatsApp.",
    whatsappAlt: "¿Preferís WhatsApp?",
  },
  sticky: {
    price: "Fundador 24,50 €/mes para siempre",
    cta: "Reservar lugar",
  },
  mockup: {
    // la ficha muestra un plato como en un menú italiano real
    dish: "Tagliatelle al ragù bianco",
    ingredients: ["Tagliatelle fresche", "Salsiccia di Mora", "Parmigiano 24 mesi", "Burro, salvia"],
    costLabel: "Food cost",
    cost: "3,42 €",
    marginLabel: "Margen",
    margin: "74%",
  },
  footer: {
    tagline: "El cuaderno del chef",
    privacy: "Privacidad",
    terms: "Términos",
    deleteAccount: "Eliminar cuenta",
  },
};

export const copyByLang: Record<Lang, LandingCopy> = { it, es };
