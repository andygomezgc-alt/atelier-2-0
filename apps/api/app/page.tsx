export default function HomePage() {
  return (
    <main
      style={{
        textAlign: "center",
        padding: "0 32px",
        maxWidth: 480,
      }}
    >
      <div
        style={{
          fontFamily:
            '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
          fontStyle: "italic",
          fontSize: 64,
          lineHeight: 1,
          color: "#1a3a3a",
          marginBottom: 16,
        }}
      >
        <span style={{ color: "#c47e4f" }}>A</span>telier
      </div>
      <p style={{ color: "#8b7a6f", fontFamily: "system-ui, sans-serif", fontSize: 14 }}>
        Cuaderno creativo del chef. Disponible en TestFlight.
      </p>
    </main>
  );
}
