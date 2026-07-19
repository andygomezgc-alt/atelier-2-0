import { copyByLang, type Lang } from "./copy";

/** JSON-LD: SoftwareApplication con la oferta + FAQPage del idioma. */
export function landingJsonLd(lang: Lang) {
  const c = copyByLang[lang];
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Atelier",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Android",
      description: c.hero.subtitle,
      offers: {
        "@type": "Offer",
        price: "49.00",
        priceCurrency: "EUR",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: c.faq.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ];
}
