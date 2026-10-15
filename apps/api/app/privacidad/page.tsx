import type { Metadata } from "next";
import Link from "next/link";
import { PageShell, h2Style, pStyle, linkStyle } from "@/components/site";
import { LegalDate, LegalTitle } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Política de privacidad — Atelier",
};

export default function PrivacidadPage() {
  return (
    <PageShell>
      <LegalTitle>Política de privacidad</LegalTitle>
      <LegalDate>Última actualización: 13 de octubre de 2026</LegalDate>

      <h2 style={h2Style}>Responsable</h2>
      <p style={pStyle}>
        Andy Gomez —{" "}
        <a href="mailto:andygomezgc@gmail.com" style={linkStyle}>
          andygomezgc@gmail.com
        </a>
        . Para cualquier cuestión sobre tus datos, escribe a ese email.
      </p>

      <h2 style={h2Style}>Qué datos tratamos</h2>
      <p style={pStyle}>
        Tu email, nombre, identificador de acceso con Google o Apple, foto y
        descripción opcionales; el restaurante, su ciudad o zona si la indicas, y tu rol en el equipo; recetas,
        ideas, menús, productos, conversaciones y archivos que cargas. También
        tratamos datos técnicos de sesión, dispositivo, errores y consumo de IA
        para mantener el servicio y controlar las cuotas y el presupuesto.
      </p>

      <h2 style={h2Style}>Tu equipo y la inteligencia artificial</h2>
      <p style={pStyle}>
        El contenido del restaurante se comparte con sus miembros según sus
        permisos. El chat Diario utiliza Google Gemini y el Creativo utiliza
        Anthropic Claude. Enviamos el mensaje, una parte acotada de la conversación
        y el contexto culinario necesario para responder. Ese contexto incluye el
        nombre de perfil de quien escribe, la ciudad o zona si se indicó y el mes
        actual, para proponer producto de temporada. Para seguir el hilo de las
        conversaciones largas guardamos un resumen breve de los mensajes más
        antiguos: lo redacta el mismo proveedor que responde en ese turno y se
        borra junto con la conversación. Z.AI (GLM) procesa las
        recetas y los documentos o imágenes que eliges analizar, los estilos de
        menú y el aprendizaje de preferencias culinarias. Los costes de recetas
        se calculan con reglas, sin enviar el banco de precios a la IA para ese cálculo.
      </p>
      <p style={pStyle}>
        En Perfil → Nuestra cocina puedes indicar el estilo del restaurante, su
        ciudad o zona y gestionar su memoria. La memoria culinaria viene
        activada en los restaurantes nuevos y en los que todavía no tomaron
        ninguna decisión; puedes apagarla en Perfil → Nuestra cocina o con el botón
        «Memoria» del chat. Aprende de las recetas en prueba o aprobadas al cargar
        una y una vez por semana: analiza una selección limitada de recetas y
        guarda tendencias breves, compartidas por el equipo. También cuenta, sin
        IA, los ingredientes que más se repiten en esas recetas. Puedes corregir
        las tendencias, excluirlas o borrarlas. Apagar la memoria no borra por sí
        solo las preferencias ya guardadas.
        Quienes tienen permiso pueden guardar desde el chat &quot;Notas del chef&quot;
        (hasta 10, de 160 caracteres cada una): se envían al asistente como
        contexto del restaurante, se borran una a una y se eliminan junto con el restaurante.
        Este contexto orienta respuestas; no entrena un modelo propio de Atelier.
      </p>
      <p style={pStyle}>
        Conservamos un registro técnico breve de las tendencias publicadas para
        revisar errores del aprendizaje. La revisión diaria elimina de la base
        activa el contenido de ese registro que supera los 30 días. Al borrar la
        memoria también se elimina ese contenido histórico; los registros de
        consumo se conservan por separado.
      </p>

      <h2 style={h2Style}>Con quién trabajamos</h2>
      <p style={pStyle}>
        Vercel aloja el servidor y los archivos; Neon mantiene la base de datos;
        Google y Apple permiten iniciar sesión; Anthropic, Google y Z.AI prestan
        las funciones de IA; Sentry recibe diagnósticos técnicos. Google Drive
        guarda copias de seguridad cifradas, con la clave custodiada por separado.
        Resend se utiliza cuando corresponde enviar correos del servicio y Stripe
        cuando se utilizan funciones de pago. Estos proveedores pueden actuar como
        encargados o como responsables de sus propios servicios, según la operación.
      </p>
      <p style={pStyle}>
        Las condiciones de las API son distintas de las de sus chats para consumidores.
        Puedes consultar las de{" "}
        <a href="https://privacy.claude.com/en/articles/7996875-can-you-delete-data-that-i-sent-via-api" style={linkStyle}>Anthropic</a>,{" "}
        <a href="https://ai.google.dev/gemini-api/terms" style={linkStyle}>Google Gemini</a> y el{" "}
        <a href="https://docs.z.ai/legal-agreement/privacy-policy#data-processing-addendum-for-api-services" style={linkStyle}>acuerdo para API de Z.AI</a>.
        La API de Gemini de Atelier tiene facturación activada. Anthropic indica
        que no utiliza datos de API para entrenamiento salvo acuerdo distinto;
        Google excluye los contenidos de sus servicios de pago de la mejora de
        productos. Z.AI declara que procesa el contenido de API en tiempo real sin
        almacenarlo. Las excepciones legales, de seguridad y los datos técnicos
        se rigen por las condiciones de cada proveedor.
      </p>

      <h2 style={h2Style}>Dónde se procesan los datos</h2>
      <p style={pStyle}>
        El servidor de Atelier y la base de datos están configurados en regiones
        europeas. Eso no implica que todos los proveedores procesen los datos solo
        en Europa: pueden intervenir servicios fuera del Espacio Económico Europeo,
        incluidos Estados Unidos y Singapur; Z.AI identifica Singapur en su acuerdo
        de API. Las transferencias se sujetan a los mecanismos y garantías aplicables
        de los proveedores, como decisiones de adecuación o cláusulas contractuales
        cuando correspondan. Puedes pedirnos información sobre los destinatarios y
        las garantías aplicables en el email de contacto.
      </p>

      <h2 style={h2Style}>Base legal</h2>
      <p style={pStyle}>
        Tratamos los datos necesarios para prestar las funciones que utilizas
        (ejecución del contrato). Para proteger cuentas, resolver fallos y prevenir
        abusos nos basamos en el interés legítimo en mantener un servicio seguro;
        también cumplimos las obligaciones legales aplicables. Cuando un tratamiento
        requiera consentimiento, lo solicitaremos y podrás retirarlo. No usamos la
        IA para tomar decisiones con efectos legales sobre ti.
      </p>

      <h2 style={h2Style}>Permisos y datos en tu teléfono</h2>
      <p style={pStyle}>
        Cámara, galería y micrófono se usan para las funciones que eliges y requieren
        los permisos del dispositivo. El dictado puede utilizar los servicios de
        reconocimiento de voz de tu sistema. Puedes revocar estos permisos en sus
        ajustes. Guardamos la sesión y algunos borradores o acciones pendientes en
        el teléfono para recuperar el trabajo y sincronizarlo al volver a tener
        conexión. No incluyas datos personales sensibles de clientes o compañeros
        en los documentos enviados a la IA.
      </p>

      <h2 style={h2Style}>Tus derechos</h2>
      <p style={pStyle}>
        Puedes solicitar acceso, rectificación, supresión, portabilidad, limitación
        u oposición al tratamiento cuando correspondan, escribiendo al email de
        arriba. Puedes reclamar ante la autoridad de protección de datos de tu país;
        en Italia, el <a href="https://www.garanteprivacy.it/" style={linkStyle}>Garante per la protezione dei dati personali</a>.
        También puedes
        eliminar tu cuenta directamente en la app (Perfil → Eliminar cuenta) o
        siguiendo las instrucciones de{" "}
        <Link href="/cuenta/eliminar" style={linkStyle}>
          /cuenta/eliminar
        </Link>
        .
      </p>

      <h2 style={h2Style}>Retención</h2>
      <p style={pStyle}>
        Conservamos los datos de cuenta mientras usas el servicio. Al eliminarla,
        retiramos los datos de acceso y de perfil; si quedan aportaciones compartidas
        con otros miembros, conservamos el contenido del restaurante y sustituimos
        tu identificación de perfil. Borrar la cuenta no elimina automáticamente
        datos personales que hayas escrito dentro de recetas o conversaciones:
        contáctanos para revisar esos contenidos. Si eres el último miembro, se
        elimina también el restaurante. El último administrador con otros miembros
        debe asignar antes otro administrador.
      </p>
      <p style={pStyle}>
        Los registros de seguridad y consumo pueden conservarse mientras sean
        necesarios para resolver incidencias, controlar el gasto, prevenir abusos
        o cumplir obligaciones legales. Las recetas, los menús y los productos que
        borras pasan a la papelera, donde puedes recuperarlos durante 7 días; después
        se eliminan definitivamente. Durante el piloto conservamos las copias cifradas para
        recuperación y revisamos su necesidad al cerrar esa etapa: no se depuran
        automáticamente al borrar una cuenta. Una solicitud de supresión requiere
        revisar también esas copias y los plazos de los proveedores. Las copias no
        se usan para el chat ni para aprender preferencias.
      </p>

      <h2 style={h2Style}>Lo que no hacemos</h2>
      <p style={pStyle}>
        No vendemos tus datos a terceros y no mostramos publicidad.
      </p>
    </PageShell>
  );
}
