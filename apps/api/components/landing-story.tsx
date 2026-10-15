import type { CSSProperties } from "react";
import type { LandingLocale } from "@/lib/landing-locale";
import { landingCopy } from "./landing-copy";
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

// The scroll timing of each step; its title and text come from landing-copy.ts, in the same order.
const steps = [
  { from: 0, to: 17.4, kind: "first" },
  { from: 15.6, to: 36.6, kind: "mid" },
  { from: 34.2, to: 51, kind: "mid" },
  { from: 49.2, to: 61, kind: "mid" },
  { from: 58.5, to: 73.5, kind: "mid" },
  { from: 71.5, to: 88, kind: "mid" },
  { from: 86, to: 100, kind: "last" },
] as const;

// The answer lines and the ingredients slide in one after another.
const answerTimes = [[24, 25.8], [25.8, 27.6], [27.6, 29.4], [29.4, 31.2]] as const;
const ingredientTimes = [[45, 46.2], [45.9, 47.1], [46.8, 48], [47.7, 48.9]] as const;

const stepClass = { first: s.aStepFirst, mid: s.aStepMid, last: s.aStepLast };
const descClass = { first: s.aDescFirst, mid: s.aDescMid, last: s.aDescLast };

export function LandingStory({ locale }: { locale: LandingLocale }) {
  const t = landingCopy[locale].story;
  const { created: newRecipe, inTest: triedRecipe, approved: approvedRecipe } = t.recipes;
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
            <p className={s.eyebrow}>{t.eyebrow}</p>
            <h2 id="story-title" className={s.title}>{t.title}</h2>
            <div className={s.stepsWrap}>
              <div className={s.progress} aria-hidden="true"><span className={`${s.sd} ${s.aGrow}`} style={at(0, 100)} /></div>
              <ol className={s.steps}>
                {steps.map((step, index) => (
                  <li key={index} className={`${s.step} ${s.sd} ${stepClass[step.kind]}`} style={at(step.from, step.to)}>
                    <span className={s.num}>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{t.steps[index]?.title}</h3>
                      <div className={`${s.desc} ${s.sd} ${descClass[step.kind]}`} style={at(step.from, step.to)}><p>{t.steps[index]?.text}</p></div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <figure className={s.phone} aria-label={t.phoneLabel}>
            <div className={s.screen} aria-hidden="true">
              <span className={s.island} />
              <div className={s.sbar}><span>23:41</span><span><Icon name="sig" /><Icon name="wifi" /><Icon name="bat" /></span></div>
              <div className={s.ahead}><span className={s.amark}><b>A</b>telier</span><span className={s.avatar}>MF</span></div>

              <div className={s.views}>
                {/* 1 · Inicio */}
                <div className={`${s.scr} ${s.scrInicio} ${s.sd} ${s.aScrFirst}`} style={at(0, 18)}>
                  <p className={s.explain}>{t.homeExplain}</p>
                  <span className={s.e}>{t.ideaPad}</span>
                  <div className={`${s.ibox} ${s.k}`}>
                    <div className={`${s.input} ${s.si}`}>
                      <span className={`${s.ph} ${s.sd} ${s.aPhCycle}`} style={at(0.6, 12)}>{t.ideaPlaceholder}</span>
                      <div className={`${s.typed} ${s.sd} ${s.aFadeOut}`} style={at(10.2, 10.8)}>
                        <span className={`${s.sd} ${s.aWrite}`} style={at(1.2, 4.2)}>{t.ideaTyped[0]}</span>
                        <span className={`${s.sd} ${s.aWrite}`} style={at(4.2, 7.2)}>{t.ideaTyped[1]}</span>
                      </div>
                    </div>
                    <span className={`${s.save} ${s.sd} ${s.aSaveCycle}`} style={at(6.6, 11.4)}>{t.save}<span className={`${s.touch} ${s.sd} ${s.aTap}`} style={at(8.1, 10.2)} /></span>
                  </div>
                  <span className={s.e}>{t.latestIdeas}</span>
                  <div className={s.ilist}>
                    <div className={`${s.insert} ${s.sd} ${s.aInsert}`} style={at(10.2, 12.6)}>
                      <div className={s.slot}>
                        <div className={`${s.icard} ${s.k}`}>
                          <div><p className={s.si}>{t.idea}</p><small>Marta · <span>{t.takeToAssistant}<span className={`${s.touch} ${s.sd} ${s.aTap}`} style={at(13.8, 16.2)} /></span></small></div>
                          <Icon name="pencil" /><Icon name="bin" />
                        </div>
                      </div>
                    </div>
                    {t.otherIdeas.map((idea) => (
                      <div key={idea.text} className={s.slot}><div className={`${s.icard} ${s.k}`}><div><p className={s.si}>{idea.text}</p><small>{idea.author} · {t.takeToAssistant}</small></div><Icon name="pencil" /><Icon name="bin" /></div></div>
                    ))}
                  </div>
                </div>

                {/* 2 · Asistente */}
                <div className={`${s.scr} ${s.scrAsis} ${s.sd} ${s.aScrMid}`} style={at(15.6, 37.2)}>
                  <div className={s.pinned}><b><Icon name="tag" />{t.pinnedIdea}</b><span className={s.si}>{t.idea}</span></div>
                  <div className={s.modes}><span className={s.mode}>{t.modeDaily}</span><span className={`${s.mode} ${s.modeOn}`}>{t.modeCreative}</span></div>
                  <div className={s.chat}>
                    <div className={`${s.bubble} ${s.sd} ${s.aPop}`} style={at(18.6, 20.4)}><p>{t.prompt}</p><small>23:41</small></div>
                    <div className={s.answer}>
                      <span className={`${s.e} ${s.sd} ${s.aSlide}`} style={at(21, 22.2)}>{t.suggests}</span>
                      <span className={`${s.bar} ${s.sd} ${s.aSlide}`} style={at(21, 22.2)} />
                      <h4 className={`${s.sd} ${s.aSlide}`} style={at(22.2, 24)}>{newRecipe.title}</h4>
                      <ul>
                        {answerTimes.map(([from, to], index) => {
                          const line = t.answerLines[index];
                          return (
                            <li key={index} className={`${s.sd} ${s.aSlide}`} style={at(from, to)}>
                              {line?.quantity ? <><span className={s.q}>{line.quantity}</span> {line.text}</> : line?.text}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                  <span className={`${s.savepill} ${s.sd} ${s.aPop}`} style={at(31.2, 32.4)}><Icon name="bookmark" />{t.saveRecipe}<span className={`${s.touch} ${s.sd} ${s.aTap}`} style={at(32.4, 34.8)} /></span>
                  <div className={s.composer}><span className={s.mic}><Icon name="mic" /></span><span className={`${s.field} ${s.k} ${s.si}`}>{t.composer}</span><span className={s.send}><Icon name="send" /></span></div>
                </div>

                {/* 4 · Recetas, under the detail and revealed when going back */}
                <div className={`${s.scr} ${s.scrList} ${s.sd} ${s.aScrList}`} style={at(49.2, 62)}>
                  <div className={`${s.search} ${s.k}`}><Icon name="search" />{t.searchRecipe}</div>
                  <div className={s.chips}>{t.filters.map((filter, index) => <span key={filter} className={index === 0 ? `${s.chip} ${s.chipOn}` : s.chip}>{filter}</span>)}</div>
                  <div className={`${s.rcard} ${s.k} ${s.sd} ${s.aRing}`} style={at(51.6, 54)}><h5>{newRecipe.title}</h5><div className={s.rmeta}><span className={s.state}>{newRecipe.state}</span>Marta</div><span className={s.rcost}>{t.costLabel} {newRecipe.cost}</span><Icon name="bin" /></div>
                  <div className={`${s.rcard} ${s.k}`}><h5>{triedRecipe.title}</h5><div className={s.rmeta}><span className={s.state}>{triedRecipe.state}</span>Diego</div><span className={s.rcost}>{t.costLabel} {triedRecipe.cost}</span><Icon name="bin" /></div>
                  <div className={`${s.rcard} ${s.k}`}><h5>{approvedRecipe.title}</h5><div className={s.rmeta}><span className={s.state}>{approvedRecipe.state}</span>Guadalupe</div><span className={s.rcost}>{t.costLabel} {approvedRecipe.cost}</span><Icon name="bin" /></div>
                </div>

                {/* 3 · Receta guardada (also the static frame when the scroll does not animate) */}
                <div className={`${s.scr} ${s.scrDetail} ${s.sd} ${s.aScrDetail}`} style={at(34.8, 51.6)}>
                  <span className={s.back}><Icon name="back" />{t.tabs.recipes}</span>
                  <span className={s.badge}><Icon name="info" />{newRecipe.state}</span>
                  <h4 className={s.dtitle}>{newRecipe.title}</h4>
                  <p className={s.byline}>Marta · v1</p>
                  <div className={`${s.cost} ${s.k} ${s.sd} ${s.aPop}`} style={at(37.2, 39)}>
                    <span className={s.e}>{t.costPerPortion}</span>
                    {/* The count-up is a CSS counter; English writes the euro sign first and a decimal point. */}
                    <span className={`${s.costNum} ${locale === "en" ? s.costNumEn : ""} ${s.sd} ${s.aCount}`} style={at(39, 42.6)} />
                    <span className={`${s.costSub} ${s.sd} ${s.aShow}`} style={at(42, 43.2)}>{t.costTotal}</span>
                    <div className={`${s.pills} ${s.sd} ${s.aSlide}`} style={at(43.2, 45)}>
                      <span className={s.pill}><Icon name="people" />{t.portions}<Icon name="pencil" /></span>
                      <span className={s.pill}><Icon name="tag" />{t.noSalePrice}<Icon name="pencil" /></span>
                    </div>
                  </div>
                  <span className={`${s.e} ${s.sd} ${s.aShow}`} style={at(44.4, 45.6)}>{t.ingredientsLabel}</span>
                  <ul className={s.ing}>
                    {ingredientTimes.map(([from, to], index) => (
                      <li key={index} className={`${s.sd} ${s.aSlide}`} style={at(from, to)}><span>{t.ingredients[index]?.name}</span><span>{t.ingredients[index]?.quantity}</span></li>
                    ))}
                  </ul>
                </div>

                {/* 5 + 6 · Menú, with the house-style preview sheet */}
                <div className={`${s.scr} ${s.scrMenu} ${s.sd} ${s.aScrTab}`} style={at(58, 90)}>
                  <div className={s.mtop}><span className={s.service}>{t.inService}</span><span className={s.pdfbtn}><Icon name="doc" />PDF</span></div>
                  <span className={s.e}>{t.menuMeta}</span>
                  <h4 className={`${s.mtitle} ${s.si}`}>{t.menuTitle}</h4>
                  <div className={`${s.chips} ${s.menuChips}`}>
                    <span className={`${s.chip} ${s.chipOn} ${s.sd} ${s.aChipOff}`} style={at(84, 85.5)}>{t.menuStyles[0]}</span>
                    <span className={s.chip}>{t.menuStyles[1]}</span>
                    <span className={s.chip}>{t.menuStyles[2]}</span>
                    <span className={`${s.chip} ${s.sd} ${s.aChipOn}`} style={at(84, 85.5)}>{t.menuStyles[3]}</span>
                    <span className={s.chip}><Icon name="camera" /><span className={`${s.touch} ${s.sd} ${s.aTap}`} style={at(70, 72.4)} /></span>
                  </div>
                  <div className={`${s.section} ${s.k}`}>
                    <div className={s.sectionTop}><span className={s.e}>1 · {t.sectionName}</span><small>{t.sectionCount}</small></div>
                    <div className={s.sectionName}><Icon name="down" /><span>{t.sectionName}</span><Icon name="bin" /></div>
                    <div className={s.dishes}>
                      <div className={`${s.insert} ${s.sd} ${s.aInsert}`} style={at(62, 65)}>
                        <div className={s.slot}>
                          <div className={`${s.dish} ${s.k} ${s.sd} ${s.aRing}`} style={at(64, 66)}>
                            <div><p>{newRecipe.title}</p><small>{t.fromRecipeBook}</small></div>
                            <span className={`${s.price} ${s.sd} ${s.aPop}`} style={at(65.5, 67.5)}><b>14</b><span>€</span></span>
                          </div>
                        </div>
                      </div>
                      <div className={s.slot}><div className={`${s.dish} ${s.k}`}><div><p>{approvedRecipe.title}</p><small>{t.fromRecipeBook}</small></div><span className={s.price}><b>16</b><span>€</span></span></div></div>
                    </div>
                  </div>
                  <span className={s.addsec}><Icon name="plus" />{t.addSection}</span>

                  <div className={`${s.scrim} ${s.sd} ${s.aShow}`} style={at(84, 86)} />
                  <div className={`${s.bsheet} ${s.sd} ${s.aSheetUp}`} style={at(84.5, 86.5)}>
                    <span className={s.handle} />
                    <h5>{t.reviewStyle}</h5>
                    <p>{t.styleHint}</p>
                    <div className={s.house}>
                      <span className={s.houseName}>{t.menuTitle}</span>
                      <span className={s.houseRule} />
                      <span className={s.houseSec}>{t.sectionName}</span>
                      <span className={s.houseRow}><span>{t.styleRows[0]}</span><span /><span>14</span></span>
                      <span className={s.houseRow}><span>{t.styleRows[1]}</span><span /><span>16</span></span>
                    </div>
                    <span className={s.viewpdf}>{t.viewPdf}</span>
                  </div>
                </div>

                {/* 7 · Casa */}
                <div className={`${s.scr} ${s.scrCasa} ${s.sd} ${s.aScrLast}`} style={at(87, 89.5)}>
                  <span className={s.e}>{t.houseEyebrow}</span>
                  <h4 className={`${s.ctitle} ${s.si}`}>Casa Arenal</h4>
                  <div className={s.staffHead}><span className={s.e}>{t.staff}</span><span>5</span></div>
                  <ul className={s.staff}>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(89.5, 91, { "--ring": "var(--app-terra)" })}><span className={s.ini}>MF</span><span className={s.who}><span>Marta Ferri</span><span>{t.roles.admin}</span></span></li>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(90.5, 92, { "--ring": "var(--app-teal)" })}><span className={s.ini}>DC</span><span className={s.who}><span>Diego Conti</span><span>{t.roles.executiveChef}</span></span><Icon name="chev" /></li>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(91.5, 93)}><span className={s.ini}>GS</span><span className={s.who}><span>Guadalupe Sosa</span><span>{t.roles.sousChef}</span></span><Icon name="chev" /></li>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(92.5, 94)}><span className={s.ini}>NF</span><span className={s.who}><span>Nicolás Ferraro</span><span>{t.roles.sousChef}</span></span><Icon name="chev" /></li>
                    <li className={`${s.sd} ${s.aSlide}`} style={at(93.5, 95)}><span className={s.ini}>EC</span><span className={s.who}><span>Emiliano Costa</span><span>{t.roles.viewer}</span></span><Icon name="chev" /></li>
                  </ul>
                  <div className={`${s.code} ${s.k} ${s.sd} ${s.aPop}`} style={at(95, 97.5)}><span>{t.inviteCode}</span><b>ARN-4821</b></div>
                </div>

                <div className={`${s.toast} ${s.sd} ${s.aToast}`} style={at(10.5, 14.4)}><Icon name="check" />{t.ideaSaved}</div>
                <div className={`${s.toast} ${s.sd} ${s.aToast}`} style={at(34.2, 39.6)}><Icon name="check" />{t.recipeSaved}</div>
              </div>

              <div className={s.tabs}>
                <span className={`${s.tab} ${s.sd} ${s.aTabFirst}`} style={at(0, 18)}><Icon name="note" />{t.tabs.home}</span>
                <span className={`${s.tab} ${s.sd} ${s.aTabMid}`} style={at(15.6, 37.2)}><Icon name="chat" />{t.tabs.assistant}</span>
                <span className={`${s.tab} ${s.tabRecetas} ${s.sd} ${s.aTabMid}`} style={at(34.8, 61)}><Icon name="book" />{t.tabs.recipes}</span>
                <span className={`${s.tab} ${s.sd} ${s.aTabMid}`} style={at(58, 89.5)}><Icon name="list" />{t.tabs.menus}</span>
                <span className={`${s.tab} ${s.sd} ${s.aTabLast}`} style={at(86.5, 88)}><Icon name="house" />{t.tabs.house}</span>
              </div>

              {/* 6 · Camera, over the whole screen */}
              <div className={`${s.cam} ${s.sd} ${s.aCam}`} style={at(72, 84)}>
                <div className={s.camMsg}>
                  <span className={`${s.sd} ${s.aFadeOut}`} style={at(76.5, 77.5)}>{t.frameMenu}</span>
                  <span className={`${s.sd} ${s.aShow}`} style={at(77.5, 78.5)}>{t.analyzingMenu}</span>
                </div>
                <div className={s.finder}>
                  <div className={s.photo}>
                    <span className={s.houseName}>Casa Arenal</span>
                    <span className={s.houseRule} />
                    {t.scannedMenu.map((group) => [
                      <span key={group.section} className={s.houseSec}>{group.section}</span>,
                      ...group.rows.map((row) => <span key={row.name} className={s.houseRow}><span>{row.name}</span><span /><span>{row.price}</span></span>),
                    ])}
                  </div>
                  <span className={`${s.scanline} ${s.sd} ${s.aScan}`} style={at(77.5, 81.5)} />
                </div>
                <span className={s.shutter}><span className={`${s.touch} ${s.sd} ${s.aTap}`} style={at(75, 77)} /></span>
                <span className={`${s.flash} ${s.sd} ${s.aFlash}`} style={at(76.4, 77.6)} />
              </div>
              <div className={`${s.toast} ${s.toastHigh} ${s.sd} ${s.aToast}`} style={at(83.5, 88)}><Icon name="check" />{t.styleCreated}</div>
              <span className={s.homebar} />
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
