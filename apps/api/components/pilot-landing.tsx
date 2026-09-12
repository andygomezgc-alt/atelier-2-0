import Link from "next/link";
import styles from "./pilot-landing.module.css";

const pilotContact = `mailto:andygomezgc@gmail.com?subject=${encodeURIComponent("Quiero probar Atelier")}&body=${encodeURIComponent("Hola, me gustaría participar en el piloto de Atelier.\n\nMi nombre:\nRestaurante:\nUsamos iPhone / Android:\n")}`;

function Arrow() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PilotLanding() {
  return (
    <div className={styles.page}>
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
          <div>
            <p className={styles.eyebrow}><span className={styles.dot} /> Hecho para chefs y su equipo</p>
            <h1 id="titulo">Tu cocina tiene ideas.<br /><em>Dales un lugar.</em></h1>
            <p className={styles.intro}>Tus ideas, recetas y equipo, en un mismo lugar. Un cuaderno creativo que te acompaña dentro y fuera de la cocina.</p>
            <a href="#piloto" className={styles.primaryButton}>Quiero probar Atelier <Arrow /></a>
            <p className={styles.caption}>Piloto para iPhone y Android</p>
          </div>

          <figure className={styles.example}>
            <div className={styles.exampleTop}><span>Del primer apunte al plato</span><span aria-hidden="true">01 / 03</span></div>
            <div className={styles.note}>
              <span className={styles.noteLabel}>La idea</span>
              <p>«Berenjena asada, algo fresco<br />y un crujiente al final…»</p>
            </div>
            <div className={styles.recipe}>
              <span className={styles.noteLabel}>La receta toma forma</span>
              <h2>Berenjena asada,<br />yogur al limón<br />y almendra tostada</h2>
              <div className={styles.recipeMeta}><span>4 raciones</span><span>Vegetariano</span></div>
              <p>Ingredientes, elaboración y notas de servicio, juntos para volver a ellos.</p>
            </div>
            <div className={styles.exampleBottom}><span aria-hidden="true">↳</span><span>Lista para guardar y compartir con tu equipo.</span></div>
            <figcaption>Ejemplo de uso · contenido de demostración</figcaption>
          </figure>
        </section>

        <section id="como-funciona" className={styles.workflow} aria-labelledby="workflow-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Menos buscar. Más cocinar.</p>
            <h2 id="workflow-title">Del «se me ocurrió»<br />al «lo tenemos guardado».</h2>
          </div>
          <div className={styles.benefits}>
            <article><span className={styles.number}>01</span><h3>Que no se pierda la idea</h3><p>Guarda un apunte cuando aparece la inspiración y recupéralo cuando tengas un momento para desarrollarlo.</p></article>
            <article><span className={styles.number}>02</span><h3>Dale forma con ayuda</h3><p>Trabaja una propuesta con el asistente de IA y conviértela en una receta que puedas ajustar a tu cocina.</p></article>
            <article><span className={styles.number}>03</span><h3>Tenla a mano, con tu equipo</h3><p>Reúne recetas y menús en el espacio de tu restaurante. Consulta una referencia de coste con los precios que hayas cargado.</p></article>
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
