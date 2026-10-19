import type { Metadata } from "next";
import { PageShell, h2Style, pStyle, linkStyle } from "@/components/site";
import { LegalTitle } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Eliminar tu cuenta — Atelier",
};

export default function EliminarCuentaPage() {
  return (
    <PageShell>
      <LegalTitle dated={false}>Eliminar tu cuenta de Atelier</LegalTitle>

      <p style={pStyle}>Tienes dos vías para eliminar tu cuenta:</p>

      <h2 style={h2Style}>a) Desde la app</h2>
      <p style={pStyle}>
        Ve a Perfil → Eliminar cuenta y confirma la operación. Si eres el
        último miembro del restaurante, se elimina también el restaurante con
        todo su contenido. Si eres el último administrador y quedan compañeros,
        primero asigna otro administrador. La app confirma cuando termina; si
        aparece un error, la eliminación no debe darse por completada.
      </p>

      <h2 style={h2Style}>b) Sin acceso a la app</h2>
      <p style={pStyle}>
        Escribe desde el email de tu cuenta a{" "}
        <a
          href="mailto:info@ateliercocina.com?subject=Eliminar%20cuenta"
          style={linkStyle}
        >
          info@ateliercocina.com
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
        contáctanos para revisarlos. Los registros técnicos y las copias cifradas
        tienen un tratamiento separado: el borrado no elimina automáticamente
        las copias ya creadas. Encuentras más información en la{" "}
        <a href="/privacidad" style={linkStyle}>política de privacidad</a>.
      </p>
    </PageShell>
  );
}
