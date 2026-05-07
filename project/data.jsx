// Atelier Culinaire — initial state
// Exposed on window so all babel scripts share them.

const INITIAL_STATE = {
  user: {
    name: "Andrea Conti",
    initials: "AC",
    email: "andrea@ristorantemarche.it",
    bio: "Cocina mediterránea de raíz, técnica francesa.",
    role: "admin",
    language: "es",
    model: "sonnet",
  },
  restaurant: {
    name: "Ristorante Marche",
    initial: "M",
    identity: "Cocina mediterránea de raíz, técnica francesa, mano japonesa.",
    inviteCode: "MARCHE-A7K2",
  },
  staff: [
    { id: "u1", name: "Andrea Conti", initials: "AC", role: "Admin", roleClass: "r-admin" },
    { id: "u2", name: "Marco Rossi", initials: "MR", role: "Chef ejecutivo", roleClass: "r-chef" },
    { id: "u3", name: "Luca Bianchi", initials: "LB", role: "Sous-chef", roleClass: "" },
    { id: "u4", name: "Sofia Marchetti", initials: "SM", role: "Lector", roleClass: "" },
  ],
  menus: [
    { id: "m1", season: "Otoño 2026", title: "Menú degustación", dishes: 8, updated: "hace 2 días" },
    { id: "m2", season: "Carta", title: "Cocina del Adriático", dishes: 12, updated: "hace 6 días" },
    { id: "m3", season: "Servicio del día", title: "Menú de mediodía", dishes: 5, updated: "hoy" },
  ],
  ideas: [
    { id: "i1", text: "Pichón con espuma de café y rábano negro", at: "Hace 2 horas", status: "open" },
    { id: "i2", text: "Tartar de gamba roja con dashi de tomate verde", at: "Ayer · 21:14", status: "in_chat" },
    { id: "i3", text: "Risotto al limón quemado, raspadura de bottarga", at: "Lun · 09:02", status: "open" },
  ],
  recipes: [
    {
      id: "r1",
      title: "Pichón con espuma de café y rábano negro",
      state: "draft",
      version: 1,
      priority: false,
      updated: "Hace 1 hora",
      author: "Andrea",
      ingredients: [
        "1 pichón entero, madurado 4 días",
        "60 g café arábica recién molido (extracción cold brew, 14 h)",
        "1 rábano negro, en láminas 1 mm",
        "Manteca clarificada, 30 g",
        "Sal Maldon, pimienta de Sichuan tostada",
      ],
      method: [
        "Sellar la pechuga sobre la piel con manteca clarificada, 2 min, retirar y reposar.",
        "Para la espuma: cargar el sifón con 200 ml de cold brew + 80 ml de nata 35% + 1 hoja gelatina hidratada. Dos cargas N₂O.",
        "Asar el pichón a 58 °C 18 min, glasear los últimos 90 s con jugo reducido.",
        "Montar: pétalos de rábano, pechuga laminada, espuma de café tibia, sal Maldon.",
      ],
      notes: "El cold brew aporta amargor sin astringencia: el café hervido lo arruina. Probar con arábica de Etiopía para nota de cítrico.",
    },
    {
      id: "r2",
      title: "Tartar de gamba roja, dashi de tomate verde",
      state: "in_test",
      version: 1,
      priority: true,
      updated: "Ayer",
      author: "Andrea",
      ingredients: [
        "Gamba roja de Dénia, 4 unidades",
        "Tomate verde, 300 g (clarificado en frío 12 h)",
        "Alga kombu, 8 g",
        "Bonito seco, 12 g",
        "Aceite de oliva arbequina",
      ],
      method: [
        "Clarificar el tomate verde en cámara, agar al 0.2%.",
        "Hacer dashi tradicional con kombu y bonito; mezclar 1:1 con tomate clarificado.",
        "Tartar a cuchillo, sazonar con sal y oliva.",
        "Servir el dashi templado al lado, ratio 30 ml por comensal.",
      ],
      notes: "El dashi-tomate no debe pasar 50 °C o pierde el aroma vegetal.",
    },
    {
      id: "r3",
      title: "Risotto al limón quemado",
      state: "approved",
      version: 1,
      priority: false,
      updated: "Hace 4 días",
      author: "Marco",
      ingredients: [
        "Arroz Carnaroli, 320 g",
        "Limón Amalfi, 3 unidades (piel quemada al binchotan)",
        "Bottarga di Cabras, c/n",
        "Manteca de cacao desodorizada, 30 g",
        "Caldo de pescado de roca, 1.2 L",
      ],
      method: [
        "Tostar el arroz en seco, mojar con caldo en 4 tandas (mantecar al final con manteca de cacao).",
        "Quemar la piel de limón con soplete hasta caramelo oscuro, infusionar 8 min en aceite tibio.",
        "Rallar bottarga al pase, finalizar con aceite de limón quemado.",
      ],
      notes: "La manteca de cacao da brillo sin lácteo; el plato resiste vegano si se ajusta el caldo.",
    },
    {
      id: "r4",
      title: "Cordero lechal a la sal de hierbas",
      state: "approved",
      version: 1,
      priority: false,
      updated: "Hace una semana",
      author: "Marco",
      ingredients: [],
      method: [],
      notes: "",
    },
    {
      id: "r5",
      title: "Helado de pan tostado y miel de romero",
      state: "draft",
      version: 1,
      priority: false,
      updated: "Hace 3 días",
      author: "Andrea",
      ingredients: [],
      method: [],
      notes: "",
    },
  ],
  menuDetail: {
    m1: {
      id: "m1",
      title: "Menú degustación",
      season: "Otoño 2026",
      style: "elegant",
      dishes: [
        { id: "d1", recipeId: "r2", name: "Tartar de gamba roja, dashi de tomate verde", desc: "Gamba de Dénia, dashi tibio, oliva arbequina", price: 28 },
        { id: "d2", recipeId: "r3", name: "Risotto al limón quemado", desc: "Carnaroli, manteca de cacao, bottarga di Cabras", price: 24 },
        { id: "d3", recipeId: "r1", name: "Pichón, espuma de café, rábano negro", desc: "Cold brew de Etiopía, glaseado al pase", price: 36 },
        { id: "d4", recipeId: "r4", name: "Cordero lechal a la sal de hierbas", desc: "Costra de tomillo y romero, jugo reducido", price: 32 },
      ],
    },
    m2: {
      id: "m2",
      title: "Cocina del Adriático",
      season: "Carta",
      style: "rustic",
      dishes: [
        { id: "d1", name: "Brodetto del puerto", desc: "Pescados de roca, tomate confit, pan de pueblo", price: 22 },
        { id: "d2", name: "Olivas all'ascolana", desc: "Carne de ternera, parmigiano 24 meses", price: 9 },
      ],
    },
    m3: {
      id: "m3",
      title: "Menú de mediodía",
      season: "Servicio del día",
      style: "minimal",
      dishes: [
        { id: "d1", name: "Pasta del día", desc: "Según mercado", price: 14 },
      ],
    },
  },
};

const SEED_CHAT = [
  {
    role: "user",
    content: "Pichón con espuma de café. Quiero algo elegante, técnica francesa pero con amargor que no asuste.",
  },
  {
    role: "assistant",
    content: "Para que el café no aplaste el pichón, una **cold brew 14 h con arábica de Etiopía** te da el amargor sin la astringencia del café hervido. Montaje en sifón con nata 35% y una hoja de gelatina: te queda una espuma tibia que se sostiene cuatro minutos en pase. La pechuga la sellaría con manteca clarificada, asado a *58 °C* 18 min, glaseado con jugo en los últimos 90 s. Como contrapunto: rábano negro en pétalos finos y pimienta de Sichuan tostada.\n\n¿Quieres que lo estructure como receta?",
  },
  {
    role: "user",
    content: "Sí, fórmalo. Lo guardo como borrador.",
  },
  {
    role: "assistant",
    content: "**Pichón con espuma de café y rábano negro**\n\nIngredientes para 4: 1 pichón entero madurado 4 días · 60 g café arábica · 200 ml cold brew · 80 ml nata 35% · 1 rábano negro · manteca clarificada 30 g · sal Maldon · pimienta de Sichuan tostada.\n\nMétodo: sellar la pechuga, montar el sifón con dos cargas N₂O, asar a 58 °C, glasear, emplatar con pétalos de rábano y espuma tibia.\n\n*Nota epistémica:* el cold brew aporta amargor limpio. Si usas una variedad fuerte (Sumatra, Brasil) tirará a tabaco — Etiopía es más cítrico y casa mejor con el ave.",
  },
];

window.INITIAL_STATE = INITIAL_STATE;
window.SEED_CHAT = SEED_CHAT;
