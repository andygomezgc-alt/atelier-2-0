import type { Metadata } from "next";
import { PageShell, serif, teal, h2Style, pStyle, linkStyle } from "@/components/site";

export const metadata: Metadata = {
  title: "Eliminar tu cuenta — Atelier",
};

export default function EliminarCuentaPage() {
  return (
    <PageShell>
      <h1
        style={{
          fontFamily: serif,
          fontSize: 36,
          color: teal,
          margin: "0 0 32px",
          fontWeight: 600,
        }}
      >
        Eliminar tu cuenta de Atelier
      </h1>

      <p style={pStyle}>Tenés dos vías para eliminar tu cuenta:</p>

      <h2 style={h2Style}>a) Desde la app</h2>
      <p style={pStyle}>
        Andá a Perfil → Eliminar cuenta y confirmá la operación. Si sos el
        último miembro del restaurante, se elimina también el restaurante con
        todo su contenido. Si sos el último administrador y quedan compañeros,
        primero asigná otro administrador. La app confirma cuando termina; si
        aparece un error, la eliminación no debe darse por completada.
      </p>

      <h2 style={h2Style}>b) Sin acceso a la app</h2>
      <p style={pStyle}>
        Escribí desde el email de tu cuenta a{" "}
        <a
          href="mailto:andygomezgc@gmail.com?subject=Eliminar%20cuenta"
          style={linkStyle}
        >
          andygomezgc@gmail.com
        </a>{" "}
        con asunto «Eliminar cuenta» y la procesamos en un máximo de 30 días.
      </p>

      <h2 style={h2Style}>Qué se borra</h2>
      <p style={pStyle}>Tu cuenta, tu email, tu nombre y tu foto.</p>

      <h2 style={h2Style}>Qué puede conservarse</h2>
      <p style={pStyle}>
        Las recetas, ideas, menús y conversaciones compartidas con el restaurante
        pueden permanecer para el equipo, con tu identificación de perfil
        sustituida. Si escribiste datos personales dentro de esos contenidos,
        contactanos para revisarlos. Los registros técnicos y las copias cifradas
        tienen un tratamiento separado: el borrado no elimina automáticamente
        las copias ya creadas. Encontrás más información en la{" "}
        <a href="/privacidad" style={linkStyle}>política de privacidad</a>.
      </p>
    </PageShell>
  );
}
