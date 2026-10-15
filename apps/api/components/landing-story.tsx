import type { CSSProperties } from "react";
import s from "./landing-story.module.css";

// The scroll drives each piece between two points of the story track, in percent.
function at(from: number, to: number, extra?: Record<string, string>): CSSProperties {
  return { "--from": `${from}%`, "--to": `${to}%`, ...extra } as CSSProperties;
}

function Icon({ name }: { name: string }) {
  return (
    <svg className={s.ic}>
      <use href={`#story-${name}`} />
    </svg>
  );
}

const steps = [
  { from: 0, to: 17.4, kind: "first", title: "Apunta la idea", text: "Escríbela en el bloc de ideas en cuanto aparece. Un toque y queda guardada." },
  { from: 15.6, to: 36.6, kind: "mid", title: "Dale forma con el asistente", text: "Llévala al asistente y conviértela en un plato, con ingredientes y cantidades." },
  { from: 34.2, to: 51, kind: "mid", title: "Guárdala como receta", text: "Queda como borrador, con su costo por porción calculado con tus precios." },
  { from: 49.2, to: 61, kind: "mid", title: "Tu equipo la encuentra", text: "Aparece en Recetas, junto a las del resto de la cocina." },
  { from: 58.5, to: 73.5, kind: "mid", title: "Súmala a la carta", text: "Arma tus menús con platos del recetario, ordénalos por secciones y ponles precio." },
  { from: 71.5, to: 88, kind: "mid", title: "Escanea tu carta", text: "Hazle una foto a tu carta de siempre y Atelier crea el estilo de la casa para tus PDF." },
  { from: 86, to: 100, kind: "last", title: "Cada uno con su rol", text: "Comparte el código del restaurante y trabaja con tu brigada, cada persona con su rol." },
] as const;

const stepClass = { first: s.aStepFirst, mid: s.aStepMid, last: s.aStepLast };
const descClass = { first: s.aDescFirst, mid: s.aDescMid, last: s.aDescLast };

export function LandingStory() {
  return (
    <section id="como-funciona" className={s.story} aria-labelledby="story-title">
      <svg width="0" height="0" className={s.sprite} aria-hidden="true">
        <symbol id="story-note" viewBox="0 0 24 24"><path d="M13.5 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h12a1.5 1.5 0 0 0 1.5-1.5v-7.5" /><path d="M18.4 3.6l2 2-8.6 8.6-3 .8.8-3z" /></symbol>
        <symbol id="story-chat" viewBox="0 0 24 24"><path d="M12 4.5c4.7 0 8.5 3 8.5 6.7S16.7 18 12 18c-1 0-2-.1-2.9-.4L4.5 19.5l1.2-3.6C4.3 14.7 3.5 13 3.5 11.2 3.5 7.5 7.3 4.5 12 4.5z" /></symbol>
        <symbol id="story-book" viewBox="0 0 24 24"><path d="M3 5.5c3-1 6-.9 9 1 3-1.9 6-2 9-1V19c-3-1-6-.9-9 1-3-1.9-6-2-9-1z" /><path d="M12 6.5V20" /></symbol>
        <symbol id="story-list" viewBox="0 0 24 24"><path d="M9 6.5h11M9 12h11M9 17.5h11" /><circle cx="4.6" cy="6.5" r="1" /><circle cx="4.6" cy="12" r="1" /><circle cx="4.6" cy="17.5" r="1" /></symbol>
        <symbol id="story-house" viewBox="0 0 24 24"><path d="M3.5 11 12 4l8.5 7v9h-5.5v-6h-6v6H3.5z" /><path d="M16 5.6V3.8h2.4v3.8" /></symbol>
        <symbol id="story-pencil" viewBox="0 0 24 24"><path d="M4.5 19.5l1-4L16.2 4.8l3 3L8.5 18.5z" /></symbol>
        <symbol id="story-bin" viewBox="0 0 24 24"><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 10.5v6.5M14 10.5v6.5" /></symbol>
        <symbol id="story-sig" viewBox="0 0 24 24"><path d="M4.5 18v-2M9.5 18v-5M14.5 18v-8M19.5 18V6" strokeWidth="2.6" /></symbol>
        <symbol id="story-wifi" viewBox="0 0 24 24"><path d="M2.8 9.2a13.5 13.5 0 0 1 18.4 0M5.8 12.6a9.2 9.2 0 0 1 12.4 0M8.8 16a4.8 4.8 0 0 1 6.4 0" /><circle cx="12" cy="19" r="1.2" fill="currentColor" /></symbol>
        <symbol id="story-bat" viewBox="0 0 24 24"><rect x="2.5" y="7" width="17" height="10" rx="3" /><rect x="4.5" y="9" width="10.5" height="6" rx="1.5" fill="currentColor" stroke="none" /><path d="M21.5 10.5v3" strokeWidth="2" /></symbol>
        <symbol id="story-tag" viewBox="0 0 24 24"><path d="M3.5 12.5V4.5h8l9 9-8 8z" /><circle cx="8" cy="9" r="1.4" /></symbol>
        <symbol id="story-bookmark" viewBox="0 0 24 24"><path d="M6.5 3.5h11v17L12 16.5l-5.5 4z" /></symbol>
        <symbol id="story-mic" viewBox="0 0 24 24"><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" /></symbol>
        <symbol id="story-send" viewBox="0 0 24 24"><path d="M4 12l16-8-6 16-2.5-6.5z" /></symbol>
        <symbol id="story-check" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M8 12.3l2.6 2.6L16 9.5" /></symbol>
        <symbol id="story-back" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></symbol>
        <symbol id="story-chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></symbol>
        <symbol id="story-down" viewBox="0 0 24 24"><path d="M5 9l7 7 7-7" /></symbol>
        <symbol id="story-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.6v.1" /></symbol>
        <symbol id="story-people" viewBox="0 0 24 24"><circle cx="9" cy="8.5" r="3.2" /><path d="M3 19c0-3.5 2.7-5.5 6-5.5s6 2 6 5.5" /><path d="M15.5 5.6a3 3 0 0 1 0 5.8M18 13.8c2 .6 3 2.3 3 5.2" /></symbol>
        <symbol id="story-search" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></symbol>
        <symbol id="story-camera" viewBox="0 0 24 24"><path d="M3.5 8h3.5l2-2.5h6L17 8h3.5v11h-17z" /><circle cx="12" cy="13.3" r="3.4" /></symbol>
        <symbol id="story-doc" viewBox="0 0 24 24"><path d="M6 3.5h8l4 4v13H6z" /><path d="M14 3.5v4h4M9 13h6M9 16.5h4" /></symbol>
        <symbol id="story-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
      </svg>

      <div className={s.track}>
        <div className={s.stage}>
          <div className={s.copy}>
            <p className={s.eyebrow}>De la idea a la carta</p>
            <h2 id="story-title" className={s.title}>Así trabaja tu cocina en Atelier.</h2>
            <div className={s.stepsWrap}>
              <div className={s.progress} aria-hidden="true"><span className={`${s.sd} ${s.aGrow}`} style={at(0, 100)} /></div>
              <ol className={s.steps}>
                {steps.map((step, index) => (
                  <li key={step.title} className={`${s.step} ${s.sd} ${stepClass[step.kind]}`} style={at(step.from, step.to)}>
                    <span className={s.num}>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{step.title}</h3>
                      <div className={`${s.desc} ${s.sd} ${descClass[step.kind]}`} style={at(step.from, step.to)}><p>{step.text}</p></div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <figure className={s.phone} aria-label="La app de Atelier: una idea pasa a receta, entra en la carta con el estilo de la casa y la ve toda la brigada. Contenido de demostración.">
            <div className={s.screen} aria-hidden="true">
              <span className={s.island} />
              <div className={s.sbar}><span>23:41</span><span><Icon name="sig" /><Icon name="wifi" /><Icon name="bat" /></span></div>
              <div className={s.ahead}><span className={s.amark}><b>A</b>telier</span><span className={s.avatar}>MF</span></div>

              <div className={s.views}>
                {/* 1 · Inicio */}
                <div className={`${s.scr} ${s.scrInicio} ${s.sd} ${s.aScrFirst}`} style={at(0, 18)}>
                  <p className={s.explain}>Tu bloc de cocina. Anota ideas sueltas y trabájalas con el Asistente cuando estés listo.</p>
                  <span className={s.e}>Bloc de ideas</span>
                  <div className={`${s.ibox} ${s.k}`}>
                    <div className={`${s.input} ${s.si}`}>
                      <span className={`${s.ph} ${s.sd} ${s.aPhCycle}`} style={at(0.6, 12)}>Pichón con espuma de café…</span>
                      <div className={`${s.typed} ${s.sd} ${s.aFadeOut}`} style={at(10.2, 10.8)}>
                        <span className={`${s.sd} ${s.aWrite}`} style={at(1.2, 4.2)}>Berenjena asada, algo fresco</span>
                        <span className={`${s.sd} ${s.aWrite}`} style={at(4.2, 7.2)}>y un crujiente al final…</span>
                      </div>
                    </div>
                    <span className={`${s.save} ${s.sd} ${s.aSaveCycle}`} style={at(6.6, 11.4)}>GUARDAR<span className={`${s.touch} ${s.sd} ${s.aTap}`} style={at(8.1, 10.2)} /></span>
                  </div>
                  <span className={s.e}>Últimas ideas</span>
                  <div className={s.ilist}>
                    <div className={`${s.insert} ${s.sd} ${s.aInsert}`} style={at(10.2, 12.6)}>
                      <div className={s.slot}>
                        <div className={`${s.icard} ${s.k}`}>
                          <div><p className={s.si}>Berenjena asada, algo fresco y un crujiente al final…</p><small>Marta · <span>Llevar al asistente<span className={`${s.touch} ${s.sd} ${s.aTap}`} style={at(13.8, 16.2)} /></span></small></div>
                          <Icon name="pencil" /><Icon name="bin" />
                        </div>
                      </div>
                    </div>
                    <div className={s.slot}><div className={`${s.icard} ${s.k}`}><div><p className={s.si}>Pichón, café y zapallo. ¿Para el otoño?</p><small>Diego · Llevar al asistente</small></div><Icon name="pencil" /><Icon name="bin" /></div></div>
                    <div className={s.slot}><div className={`${s.icard} ${s.k}`}><div><p className={s.si}>Mollejas, cítricos y pimienta larga</p><small>Guadalupe · Llevar al asistente</small></div><Icon name="pencil" /><Icon name="bin" /></div></div>
                  </div>
                </div>

                {/* 2 · Asistente */}
                <div className={`${s.scr} ${s.scrAsis} ${s.sd} ${s.aScrMid}`} style={at(15.6, 37.2)}>
                  <div className={s.pinned}><b><Icon name="tag" />Idea anclada</b><span className={s.si}>Berenjena asada, algo fresco y un crujiente al final…</span></div>
                  <div className={s.modes}><span className={s.mode}>Diario</span><span className={`${s.mode} ${s.modeOn}`}>Creativo</span></div>
                  <div className={s.chat}>
                    <div className={`${s.bubble} ${s.sd} ${s.aPop}`} style={at(18.6, 20.4)}><p>Conviértela en un plato para la carta de otoño.</p><small>23:41</small></div>
                    <div className={s.answer}>
                      <span className={`${s.e} ${s.sd} ${s.aSlide}`} style={at(21, 22.2)}>Atelier · sugiere</span>
                      <span className={`${s.bar} ${s.sd} ${s.aSlide}`} style={at(21, 22.2)} />
                      <h4 className={`${s.sd} ${s.aSlide}`} style={at(22.2, 24)}>Berenjena asada, yogur al limón y almendra tostada</h4>
                      <ul>
                        <li className={`${s.sd} ${s.aSlide}`} style={at(24, 25.8)}><span className={s.q}>2</span> berenjenas, asadas enteras</li>
                        <li className={`${s.sd} ${s.aSlide}`} style={at(25.8, 27.6)}><span className={s.q}>250 g</span> de yogur griego al limón</li>
                        <li className={`${s.sd} ${s.aSlide}`} style={at(27.6, 29.4)}><span className={s.q}>40 g</span> de almendra marcona</li>
                        <li className={`${s.sd} ${s.aSlide}`} style={at(29.4, 31.2)}>Aceite de oliva y sal en escamas</li>
                      </ul>
                    </div>
                  </div>
                  <span className={`${s.savepill} ${s.sd} ${s.aPop}`} style={at(31.2, 32.4)}><Icon name="bookmark" />Guardar como receta<span className={`${s.touch} ${s.sd} ${s.aTap}`} style={at(32.4, 34.8)} /></span>
                  <div className={s.composer}><span className={s.mic}><Icon name="mic" /></span><span className={`${s.field} ${s.k} ${s.si}`}>Escribe o dicta…</span><span className={s.send}><Icon name="send" /></span></div>
                </div>

                {/* 4 · Recetas, under the detail and revealed when going back */}
                <div className={`${s.scr} ${s.scrList} ${s.sd} ${s.aScrList}`} style={at(49.2, 62)}>
                  <div className={`${s.search} ${s.k}`}><Icon name="search" />Buscar receta…</div>
                  <div className={s.chips}><span className={`${s.chip} ${s.chipOn}`}>Todas</span><span className={s.chip}>Borrador</span><span className={s.chip}>En prueba</span><span className={s.chip}>Aprobadas</span></div>
                  <div className={`${s.rcard} ${s.k} ${s.sd} ${s.aRing}`} style={at(51.6, 54)}><h5>Berenjena asada, yogur al limón y almendra tostada</h5><div className={s.rmeta}><span className={s.state}>Borrador</span>Marta</div><span className={s.rcost}>Costo/porc. 1,85 €</span><Icon name="bin" /></div>
                  <div className={`${s.rcard} ${s.k}`}><h5>Pichón, café y zapallo asado</h5><div className={s.rmeta}><span className={s.state}>En prueba</span>Diego</div><span className={s.rcost}>Costo/porc. 4,10 €</span><Icon name="bin" /></div>
                  <div className={`${s.rcard} ${s.k}`}><h5>Mollejas con cítricos y pimienta larga</h5><div className={s.rmeta}><span className={s.state}>Aprobada</span>Guadalupe</div><span className={s.rcost}>Costo/porc. 3,60 €</span><Icon name="bin" /></div>
                </div>

                {/* 3 · Receta guardada (also the static frame when the scroll does not animate) */}
                <div className={`${s.scr} ${s.scrDetail} ${s.sd} ${s.aScrDetail}`} style={at(34.8, 51.6)}>
                  <span className={s.back}><Icon name="back" />Recetas</span>
                  <span className={s.badge}><Icon name="info" />Borrador</span>
                  <h4 className={s.dtitle}>Berenjena asada, yogur al limón y almendra tostada</h4>
                  <p className={s.byline}>Marta · v1</p>
                  <div className={`${s.cost} ${s.k} ${s.sd} ${s.aPop}`} style={at(37.2, 39)}>
                    <span className={s.e}>Costo por porción</span>
                    <span className={`${s.costNum} ${s.sd} ${s.aCount}`} style={at(39, 42.6)} />
                    <span className={`${s.costSub} ${s.sd} ${s.aShow}`} style={at(42, 43.2)}>Total: 7,40 €</span>
                    <div className={`${s.pills} ${s.sd} ${s.aSlide}`} style={at(43.2, 45)}>
                      <span className={s.pill}><Icon name="people" />4 porciones<Icon name="pencil" /></span>
                      <span className={s.pill}><Icon name="tag" />Sin precio de venta<Icon name="pencil" /></span>
                    </div>
                  </div>
                  <span className={`${s.e} ${s.sd} ${s.aShow}`} style={at(44.4, 45.6)}>Ingredientes</span>
                  <ul className={s.ing}>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(45, 46.2)}><span>Berenjena</span><span>2 u</span></li>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(45.9, 47.1)}><span>Yogur griego</span><span>250 g</span></li>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(46.8, 48)}><span>Almendra marcona</span><span>40 g</span></li>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(47.7, 48.9)}><span>Limón</span><span>1 u</span></li>
                  </ul>
                </div>

                {/* 5 + 6 · Menú, with the house-style preview sheet */}
                <div className={`${s.scr} ${s.scrMenu} ${s.sd} ${s.aScrTab}`} style={at(58, 90)}>
                  <div className={s.mtop}><span className={s.service}>EN SERVICIO</span><span className={s.pdfbtn}><Icon name="doc" />PDF</span></div>
                  <span className={s.e}>Otoño 2026 · 4 platos</span>
                  <h4 className={`${s.mtitle} ${s.si}`}>Carta de otoño</h4>
                  <div className={`${s.chips} ${s.menuChips}`}>
                    <span className={`${s.chip} ${s.chipOn} ${s.sd} ${s.aChipOff}`} style={at(84, 85.5)}>Elegante</span>
                    <span className={s.chip}>Rústica</span>
                    <span className={s.chip}>Minimal</span>
                    <span className={`${s.chip} ${s.sd} ${s.aChipOn}`} style={at(84, 85.5)}>Tu estilo</span>
                    <span className={s.chip}><Icon name="camera" /><span className={`${s.touch} ${s.sd} ${s.aTap}`} style={at(70, 72.4)} /></span>
                  </div>
                  <div className={`${s.section} ${s.k}`}>
                    <div className={s.sectionTop}><span className={s.e}>1 · Entrantes</span><small>2 platos</small></div>
                    <div className={s.sectionName}><Icon name="down" /><span>Entrantes</span><Icon name="bin" /></div>
                    <div className={s.dishes}>
                      <div className={`${s.insert} ${s.sd} ${s.aInsert}`} style={at(62, 65)}>
                        <div className={s.slot}>
                          <div className={`${s.dish} ${s.k} ${s.sd} ${s.aRing}`} style={at(64, 66)}>
                            <div><p>Berenjena asada, yogur al limón y almendra tostada</p><small>DESDE RECETARIO</small></div>
                            <span className={`${s.price} ${s.sd} ${s.aPop}`} style={at(65.5, 67.5)}><b>14</b><span>€</span></span>
                          </div>
                        </div>
                      </div>
                      <div className={s.slot}><div className={`${s.dish} ${s.k}`}><div><p>Mollejas con cítricos y pimienta larga</p><small>DESDE RECETARIO</small></div><span className={s.price}><b>16</b><span>€</span></span></div></div>
                    </div>
                  </div>
                  <span className={s.addsec}><Icon name="plus" />Agregar sección</span>

                  <div className={`${s.scrim} ${s.sd} ${s.aShow}`} style={at(84, 86)} />
                  <div className={`${s.bsheet} ${s.sd} ${s.aSheetUp}`} style={at(84.5, 86.5)}>
                    <span className={s.handle} />
                    <h5>Revisa tu estilo</h5>
                    <p>Inspirado en tu carta: colores, letra y disposición.</p>
                    <div className={s.house}>
                      <span className={s.houseName}>Carta de otoño</span>
                      <span className={s.houseRule} />
                      <span className={s.houseSec}>Entrantes</span>
                      <span className={s.houseRow}><span>Berenjena asada, yogur al limón</span><span /><span>14</span></span>
                      <span className={s.houseRow}><span>Mollejas con cítricos</span><span /><span>16</span></span>
                    </div>
                    <span className={s.viewpdf}>Ver PDF real</span>
                  </div>
                </div>

                {/* 7 · Casa */}
                <div className={`${s.scr} ${s.scrCasa} ${s.sd} ${s.aScrLast}`} style={at(87, 89.5)}>
                  <span className={s.e}>La casa</span>
                  <h4 className={`${s.ctitle} ${s.si}`}>Casa Arenal</h4>
                  <div className={s.staffHead}><span className={s.e}>Staff</span><span>5</span></div>
                  <ul className={s.staff}>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(89.5, 91, { "--ring": "var(--app-terra)" })}><span className={s.ini}>MF</span><span className={s.who}><span>Marta Ferri</span><span>Admin</span></span></li>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(90.5, 92, { "--ring": "var(--app-teal)" })}><span className={s.ini}>DC</span><span className={s.who}><span>Diego Conti</span><span>Chef ejecutivo</span></span><Icon name="chev" /></li>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(91.5, 93)}><span className={s.ini}>GS</span><span className={s.who}><span>Guadalupe Sosa</span><span>Sous-chef</span></span><Icon name="chev" /></li>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(92.5, 94)}><span className={s.ini}>NF</span><span className={s.who}><span>Nicolás Ferraro</span><span>Sous-chef</span></span><Icon name="chev" /></li>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(93.5, 95)}><span className={s.ini}>EC</span><span className={s.who}><span>Emiliano Costa</span><span>Lector</span></span><Icon name="chev" /></li>
                  </ul>
                  <div className={`${s.code} ${s.k} ${s.sd} ${s.aPop}`} style={at(95, 97.5)}><span>Código de invitación</span><b>ARN-4821</b></div>
                </div>

                <div className={`${s.toast} ${s.sd} ${s.aToast}`} style={at(10.5, 14.4)}><Icon name="check" />Idea guardada</div>
                <div className={`${s.toast} ${s.sd} ${s.aToast}`} style={at(34.2, 39.6)}><Icon name="check" />Receta guardada como borrador</div>
              </div>

              <div className={s.tabs}>
                <span className={`${s.tab} ${s.sd} ${s.aTabFirst}`} style={at(0, 18)}><Icon name="note" />Inicio</span>
                <span className={`${s.tab} ${s.sd} ${s.aTabMid}`} style={at(15.6, 37.2)}><Icon name="chat" />Asistente</span>
                <span className={`${s.tab} ${s.tabRecetas} ${s.sd} ${s.aTabMid}`} style={at(34.8, 61)}><Icon name="book" />Recetas</span>
                <span className={`${s.tab} ${s.sd} ${s.aTabMid}`} style={at(58, 89.5)}><Icon name="list" />Menús</span>
                <span className={`${s.tab} ${s.sd} ${s.aTabLast}`} style={at(86.5, 88)}><Icon name="house" />Casa</span>
              </div>

              {/* 6 · Camera, over the whole screen */}
              <div className={`${s.cam} ${s.sd} ${s.aCam}`} style={at(72, 84)}>
                <div className={s.camMsg}>
                  <span className={`${s.sd} ${s.aFadeOut}`} style={at(76.5, 77.5)}>Encuadra tu carta</span>
                  <span className={`${s.sd} ${s.aShow}`} style={at(77.5, 78.5)}>Analizando tu carta…</span>
                </div>
                <div className={s.finder}>
                  <div className={s.photo}>
                    <span className={s.houseName}>Casa Arenal</span>
                    <span className={s.houseRule} />
                    <span className={s.houseSec}>Entrantes</span>
                    <span className={s.houseRow}><span>Croquetas de jamón</span><span /><span>9</span></span>
                    <span className={s.houseRow}><span>Ensaladilla de la casa</span><span /><span>11</span></span>
                    <span className={s.houseRow}><span>Alcachofas confitadas</span><span /><span>13</span></span>
                    <span className={s.houseSec}>Principales</span>
                    <span className={s.houseRow}><span>Arroz de pato</span><span /><span>22</span></span>
                    <span className={s.houseRow}><span>Merluza a la brasa</span><span /><span>24</span></span>
                    <span className={s.houseRow}><span>Carrillera al vino tinto</span><span /><span>21</span></span>
                    <span className={s.houseSec}>Postres</span>
                    <span className={s.houseRow}><span>Torrija caramelizada</span><span /><span>8</span></span>
                  </div>
                  <span className={`${s.scanline} ${s.sd} ${s.aScan}`} style={at(77.5, 81.5)} />
                </div>
                <span className={s.shutter}><span className={`${s.touch} ${s.sd} ${s.aTap}`} style={at(75, 77)} /></span>
                <span className={`${s.flash} ${s.sd} ${s.aFlash}`} style={at(76.4, 77.6)} />
              </div>
              <div className={`${s.toast} ${s.toastHigh} ${s.sd} ${s.aToast}`} style={at(83.5, 88)}><Icon name="check" />Estilo de la casa creado a partir de tu carta</div>
              <span className={s.homebar} />
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
