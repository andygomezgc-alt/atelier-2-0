import Link from "next/link";
import type { CSSProperties } from "react";
import { Crimson_Pro } from "next/font/google";
import { LandingStory } from "./landing-story";
import styles from "./pilot-landing.module.css";

// The app's serif, used by the phone in the scroll story.
const crimson = Crimson_Pro({ subsets: ["latin"], weight: ["400", "500"], style: ["normal", "italic"], variable: "--font-crimson" });

const pilotContact = `mailto:andygomezgc@gmail.com?subject=${encodeURIComponent("Quiero probar Atelier")}&body=${encodeURIComponent("Hola, me gustaría participar en el piloto de Atelier.\n\nMi nombre:\nRestaurante:\nUsamos iPhone / Android:\n")}`;

function Arrow() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Word({ index, children }: { index: number; children: string }) {
  return (
    <span className={styles.word} style={{ "--i": index } as CSSProperties}>
      <span>{children}</span>
    </span>
  );
}

const more = [
  {
    title: "Banco de productos",
    text: "Cargas cada precio una sola vez y vale para todas tus recetas, con su merma y su rendimiento.",
    icon: <><path pathLength={1} d="M6 21V7h14l15 15-13 13z" /><circle pathLength={1} cx="13.5" cy="14" r="2.5" /></>,
  },
  {
    title: "Importa tus recetas",
    text: "Sube tus recetas de siempre en PDF o Word y quedan en el recetario, listas para editar.",
    icon: <><path pathLength={1} d="M10 5h14l7 7v23H10z" /><path pathLength={1} d="M20 30V17m-5 5 5-5 5 5" /></>,
  },
  {
    title: "Escala y comparte la ficha",
    text: "Cambia las porciones de una receta y descarga su ficha técnica en PDF para la partida.",
    icon: <><path pathLength={1} d="M6 34 34 6" /><path pathLength={1} d="M22 6h12v12M18 34H6V22" /></>,
  },
  {
    title: "De borrador a aprobada",
    text: "Cada receta pasa por borrador, en prueba y aprobada, y todos saben en qué punto está.",
    icon: <><circle pathLength={1} cx="8" cy="10" r="2.5" /><circle pathLength={1} cx="20" cy="20" r="2.5" /><circle pathLength={1} cx="32" cy="30" r="2.5" /><path pathLength={1} d="M10 12l8 6M22 22l8 6" /></>,
  },
  {
    title: "Un asistente que aprende",
    text: "Recuerda las tendencias de tu cocina a partir de tus elaboraciones y las tiene en cuenta al proponer.",
    icon: <path pathLength={1} d="M20 5C21 15 25 19 35 20C25 21 21 25 20 35C19 25 15 21 5 20C15 19 19 15 20 5Z" />,
  },
  {
    title: "En iPhone y Android",
    text: "Toda la brigada trabaja en el mismo espacio, cada persona desde su teléfono.",
    icon: <><rect pathLength={1} x="12" y="4" width="16" height="32" rx="3" /><path pathLength={1} d="M18 31h4" /></>,
  },
];

export function PilotLanding() {
  return (
    <div className={`${styles.page} ${crimson.variable}`}>
      <a className={styles.skipLink} href="#contenido">Saltar al contenido</a>
      <header className={styles.header}>
        <Link href="/" className={styles.wordmark} aria-label="Atelier, inicio"><span>A</span>telier</Link>
        <nav className={styles.navigation} aria-label="Navegación principal">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#plan">El plan</a>
          <a href="#piloto" className={styles.navCta}>Probar Atelier <Arrow /></a>
        </nav>
      </header>

      <main id="contenido">
        <section className={styles.hero} aria-labelledby="titulo">
          <p className={styles.eyebrow}><span className={styles.dot} /> Hecho para chefs y su equipo</p>
          <h1 id="titulo" className={styles.headline}>
            <span className={styles.line}><Word index={0}>Tu</Word> <Word index={1}>cocina</Word> <Word index={2}>tiene</Word> <Word index={3}>ideas.</Word></span>
            <span className={styles.line}>
              <Word index={4}>Dales</Word>{" "}
              <em className={styles.swashHost}>
                <Word index={5}>un</Word> <Word index={6}>lugar.</Word>
                <svg className={styles.swash} viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength={1} d="M4 13 C 80 3, 170 3, 296 9" /></svg>
              </em>
            </span>
          </h1>
          <div className={styles.heroFoot}>
            <div className={styles.heroCopy}>
              <p className={`${styles.intro} ${styles.rise}`} style={{ "--d": 0 } as CSSProperties}>Tus ideas, recetas y equipo, en un mismo lugar. Un cuaderno creativo que te acompaña dentro y fuera de la cocina.</p>
              <a href="#piloto" className={`${styles.primaryButton} ${styles.rise}`} style={{ "--d": 120 } as CSSProperties}>Quiero probar Atelier <Arrow /></a>
              <p className={`${styles.caption} ${styles.rise}`} style={{ "--d": 120 } as CSSProperties}>Piloto para iPhone y Android</p>
            </div>
            <a className={`${styles.cue} ${styles.rise}`} style={{ "--d": 240 } as CSSProperties} href="#como-funciona">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 4v15m-6-6 6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Sigue bajando: así trabaja una cocina en Atelier
            </a>
          </div>
        </section>

        <LandingStory />

        <section className={styles.moreSection} aria-labelledby="more-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Y mucho más</p>
            <h2 id="more-title">Todo lo que pasa en tu cocina,<br />en el mismo cuaderno.</h2>
            <p>Lo que viste arriba es el recorrido de un plato. Esto también lo tienes desde el primer día.</p>
          </div>
          <div className={styles.more}>
            {more.map((item, index) => (
              <article key={item.title} className={styles.moreItem} style={{ "--n": index % 3 } as CSSProperties}>
                <svg className={styles.icon} viewBox="0 0 40 40" aria-hidden="true">{item.icon}</svg>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="plan" className={styles.planSection} aria-labelledby="plan-title">
          <div className={styles.planIntro}>
            <p className={styles.eyebrow}>Cuando abramos suscripciones</p>
            <h2 id="plan-title">Un restaurante.<br />Un mismo cuaderno.</h2>
            <p>Estamos probando Atelier con chefs y sus equipos. Esta es la propuesta de lanzamiento; por ahora puedes solicitar acceso al piloto.</p>
          </div>
          <div className={styles.planCard}>
            <div className={styles.planName}><h3>Atelier Pro</h3><span>Por restaurante</span></div>
            <p className={styles.price}>49 €<span>/mes + IVA</span></p>
            <ul className={styles.features}>
              <li>Un espacio para tus recetas, ideas y menús.</li>
              <li>Trabajo compartido con tu equipo.</li>
              <li>Asistente para consultas cotidianas y trabajo creativo.</li>
            </ul>
            <div className={styles.founder}>
              <span className={styles.noteLabel}>Descuento fundador</span>
              <p><strong>24,50 €/mes + IVA</strong><br />durante los primeros <strong>3 meses</strong> de la suscripción.</p>
              <p>Desde el cuarto mes: <strong>49 €/mes + IVA.</strong></p>
            </div>
            <p className={styles.planFootnote}>Antes de contratar conocerás los límites de IA, las condiciones del equipo y la cancelación. Ahora no se solicitan datos de pago.</p>
          </div>
        </section>

        <section className={styles.faq} aria-labelledby="faq-title">
          <div><p className={styles.eyebrow}>Por si te lo preguntabas</p><h2 id="faq-title">Lo esencial,<br />antes de empezar.</h2></div>
          <div className={styles.questions}>
            <details><summary>¿Puedo usarlo en iPhone y Android?</summary><p>Sí. En el piloto, iPhone utiliza TestFlight y Android se instala mediante un APK. Al solicitar acceso te indicaremos cómo instalarlo.</p></details>
            <details><summary>¿Cómo entra mi equipo?</summary><p>Quien crea el restaurante lo administra y puede compartir su código de acceso. Cada persona entra con su propia cuenta y trabaja en el mismo espacio del restaurante.</p></details>
            <details><summary>¿La IA tiene límites?</summary><p>Sí. Durante el piloto, cada chef dispone de 140 mensajes cotidianos y 8 creativos por periodo de siete días. El piloto también tiene un presupuesto compartido; puedes consultar la disponibilidad en la app. Los límites del futuro plan se confirmarán antes de contratar.</p></details>
            <details><summary>¿Solicitar acceso inicia una suscripción?</summary><p>No. El botón abre un correo para pedir acceso al piloto. No inicia una suscripción ni solicita una tarjeta. Antes de abrir los pagos explicaremos cómo cancelar y qué ocurre con tus recetas.</p></details>
          </div>
        </section>

        <section id="piloto" className={styles.pilot} aria-labelledby="pilot-title">
          <p className={styles.eyebrow}>Probémoslo en una cocina real</p>
          <h2 id="pilot-title">Tu próximo plato<br />puede empezar aquí.</h2>
          <p>Cuéntanos en qué restaurante trabajas y qué teléfono usas. Te explicaremos cómo participar.</p>
          <a href={pilotContact} className={styles.primaryButton}>Solicitar acceso al piloto <Arrow /></a>
          <span className={styles.contactHint}>Se abrirá tu aplicación de correo.</span>
          <a className={styles.email} href={pilotContact}>andygomezgc@gmail.com</a>
        </section>
      </main>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>Atelier <span>El cuaderno creativo de tu cocina.</span></span>
        <nav aria-label="Información legal"><Link href="/privacidad">Privacidad</Link><Link href="/terminos">Términos</Link><Link href="/cuenta/eliminar">Eliminar cuenta</Link></nav>
      </footer>
    </div>
  );
}
