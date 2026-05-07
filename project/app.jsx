// Atelier Culinaire — App shell (router + overlays)

const { useState, useEffect, useCallback } = React;
const {
  StatusBar, Header, TabBar, OnboardingScreen,
  CasaScreen, InicioScreen, AsistenteScreen,
  RecetasScreen, RecetaDetailScreen,
  MenusScreen, MenuDetailScreen,
} = window.Atelier;
const t = window.t;

const TAB_FOR = {
  inicio: "inicio",
  asistente: "asistente",
  recetas: "recetas",
  recetaDetail: "recetas",
  menus: "menus",
  menuDetail: "menus",
  casa: "casa",
};

function titleFor(name) {
  return ({
    inicio: null,
    asistente: t("header_asistente"),
    recetas: t("header_recetas"),
    recetaDetail: t("header_receta"),
    menus: t("header_menus"),
    menuDetail: null,
    casa: null,
  })[name];
}

function ProfileSheet({ state, setState, onClose }) {
  function setLang(l) { setState(prev => ({ ...prev, user: { ...prev.user, language: l }})); }
  function setModel(m) { setState(prev => ({ ...prev, user: { ...prev.user, model: m }})); }

  const roleLabels = {
    admin: t("role_admin"),
    chef_executive: t("role_chef_executive"),
    sous_chef: t("role_sous_chef"),
    viewer: t("role_viewer"),
  };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose}></div>
      <div className="sheet">
        <div className="sheet-handle"></div>
        <div className="profile-hero">
          <div className="profile-photo">
            {state.user.initials}
            <span className="edit"><i className="ti ti-camera"></i></span>
          </div>
          <div className="profile-name">{state.user.name}</div>
          <div className="profile-email">{state.user.email}</div>
          <div className="profile-bio">"{state.user.bio}"</div>
        </div>
        <div className="profile-list">
          <div className="profile-row">
            <span className="profile-row-label">{t("profile_role")}</span>
            <span className="profile-row-value">{roleLabels[state.user.role]}</span>
          </div>
          <div className="profile-row">
            <span className="profile-row-label">{t("profile_restaurant")}</span>
            <span className="profile-row-value">{state.restaurant.name}</span>
          </div>
          <div className="profile-row" style={{flexWrap:"wrap"}}>
            <span className="profile-row-label">{t("profile_language")}</span>
            <div className="lang-pill-row">
              {["es","it","en"].map(l => (
                <button key={l} className={`lang-pill ${state.user.language === l ? "active" : ""}`} onClick={() => setLang(l)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="profile-row" style={{flexDirection:"column", alignItems:"stretch", gap: 8}}>
            <div style={{display:"flex", justifyContent:"space-between"}}>
              <span className="profile-row-label">{t("profile_model")}</span>
              <span className="profile-row-value" style={{color: "var(--terracota)"}}>
                {state.user.model === "sonnet" ? "Sonnet 4.6" : "Opus 4.7"}
              </span>
            </div>
            <div className="model-radio-row">
              <button className={`recetas-tab ${state.user.model === "sonnet" ? "active" : ""}`} onClick={() => setModel("sonnet")} style={{justifyContent:"flex-start", textAlign:"left"}}>
                Sonnet 4.6 — rápido y robusto
              </button>
              <button className={`recetas-tab ${state.user.model === "opus" ? "active" : ""}`} onClick={() => setModel("opus")} style={{justifyContent:"flex-start", textAlign:"left"}}>
                Opus 4.7 — máxima profundidad
              </button>
            </div>
          </div>
          <div className="profile-row" style={{flexDirection:"column", alignItems:"stretch", gap: 8}}>
            <span className="profile-row-label">{t("profile_view_as")}</span>
            <div className="model-radio-row">
              {["admin","chef_executive","sous_chef","viewer"].map(r => (
                <button
                  key={r}
                  className={`recetas-tab ${state.user.role === r ? "active" : ""}`}
                  onClick={() => setState(prev => ({...prev, user: {...prev.user, role: r}}))}
                  style={{justifyContent:"flex-start", textAlign:"left"}}
                >
                  {roleLabels[r]}
                </button>
              ))}
            </div>
          </div>
          <div className="profile-row" onClick={() => {
            setState(prev => ({...prev, user: {...prev.user, offline: !prev.user.offline}}));
          }}>
            <span className="profile-row-label">Simular sin red</span>
            <i className={state.user.offline ? "ti ti-wifi-off" : "ti ti-wifi"} style={{color: state.user.offline ? "var(--terracota)" : "var(--mute)"}}></i>
          </div>
          <div className="profile-row" onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(ONBOARDED_KEY);
            location.reload();
          }}>
            <span className="profile-row-label">{t("profile_reset")}</span>
            <i className="ti ti-refresh" style={{color: "var(--mute)"}}></i>
          </div>
          <div className="profile-row danger" onClick={onClose}>
            <span className="profile-row-label">{t("profile_logout")}</span>
            <i className="ti ti-logout" style={{color: "#a45a4a"}}></i>
          </div>
        </div>
      </div>
    </>
  );
}

function ConfirmSheet({ title, body, confirmLabel, danger, onConfirm, onClose }) {
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose}></div>
      <div className="sheet">
        <div className="sheet-handle"></div>
        <div className="sheet-title">{title}</div>
        {body && <div className="sheet-sub">{body}</div>}
        <div className="confirm-actions">
          <button className="btn-ghost" onClick={onClose}>{t("confirm_cancel")}</button>
          <button
            className={danger ? "btn-danger" : "btn-primary"}
            onClick={() => { onConfirm(); onClose(); }}>
            {confirmLabel || t("confirm_ok")}
          </button>
        </div>
      </div>
    </>
  );
}

function StaffMemberSheet({ state, setState, staffId, onClose, showToast }) {
  const member = state.staff.find(s => s.id === staffId);
  if (!member) return null;

  function changeRole(newRole, label) {
    setState(prev => ({
      ...prev,
      staff: prev.staff.map(s => s.id === staffId ? {
        ...s,
        role: label,
        roleClass: newRole === "admin" ? "r-admin" : newRole === "chef_executive" ? "r-chef" : ""
      } : s)
    }));
    showToast(`${t("profile_role")}: ${label}`);
    onClose();
  }

  function removeMember() {
    if (!confirm(`${member.name}?`)) return;
    setState(prev => ({ ...prev, staff: prev.staff.filter(s => s.id !== staffId) }));
    showToast("✓");
    onClose();
  }

  const roles = [
    { id: "admin", label: t("role_admin") },
    { id: "chef_executive", label: t("role_chef_executive") },
    { id: "sous_chef", label: t("role_sous_chef") },
    { id: "viewer", label: t("role_viewer") },
  ];

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose}></div>
      <div className="sheet">
        <div className="sheet-handle"></div>
        <div className="profile-hero">
          <div className={`profile-photo ${member.roleClass}`}>{member.initials}</div>
          <div className="profile-name">{member.name}</div>
          <div className="profile-bio">{member.role}</div>
        </div>
        <div className="profile-list">
          <div className="profile-row" style={{flexDirection:"column", alignItems:"stretch", gap: 8}}>
            <span className="profile-row-label">{t("profile_role")}</span>
            <div className="model-radio-row">
              {roles.map(r => (
                <button
                  key={r.id}
                  className={`recetas-tab ${member.role === r.label ? "active" : ""}`}
                  onClick={() => changeRole(r.id, r.label)}
                  style={{justifyContent:"flex-start"}}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="profile-row danger" onClick={removeMember}>
            <span className="profile-row-label">Eliminar del equipo</span>
            <i className="ti ti-user-x" style={{color: "#a45a4a"}}></i>
          </div>
        </div>
      </div>
    </>
  );
}

function AddToMenuSheet({ state, setState, recipeId, onClose, showToast }) {
  const recipe = state.recipes.find(r => r.id === recipeId);
  function addTo(menuId) {
    const md = state.menuDetail[menuId];
    if (md) {
      const newDish = {
        id: "d" + Date.now(),
        recipeId: recipe.id,
        name: recipe.title,
        desc: "Receta del banco",
        price: 28,
      };
      setState(prev => ({
        ...prev,
        menuDetail: { ...prev.menuDetail, [menuId]: { ...md, dishes: [...md.dishes, newDish] }},
        menus: prev.menus.map(m => m.id === menuId ? { ...m, dishes: m.dishes + 1, updated: "ahora" } : m),
      }));
    }
    showToast(t("toast_added_to_menu"));
    onClose();
  }
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose}></div>
      <div className="sheet">
        <div className="sheet-handle"></div>
        <div className="sheet-title">{t("btn_add_to_menu")}</div>
        <div className="sheet-sub">{recipe?.title}</div>
        <div className="add-to-menu-list">
          {state.menus.map(m => (
            <button key={m.id} className="add-to-menu-item" onClick={() => addTo(m.id)}>
              <div className="left">
                <span className="name">{m.title}</span>
                <span className="meta">{m.season} · {m.dishes} platos</span>
              </div>
              <i className="ti ti-plus"></i>
            </button>
          ))}
        </div>
        <button className="add-to-menu-create">
          <i className="ti ti-plus"></i>Crear "Menú Otoño 2026"
        </button>
      </div>
    </>
  );
}

function PdfPreview({ data, restaurant, onClose, showToast }) {
  if (!data) return null;
  const { menu, style } = data;
  const styleMap = {
    elegant: { fontFamily: "var(--serif)", fontStyle: "italic" },
    rustic:  { fontFamily: "Georgia, serif", letterSpacing: "0.04em" },
    minimal: { fontFamily: "var(--sans)", fontStyle: "normal", letterSpacing: "0.06em" },
  };
  return (
    <div className="pdf-preview">
      <div className="pdf-sheet">
        <button className="pdf-close" onClick={onClose}><i className="ti ti-x"></i></button>
        <div className="pdf-letter-mark">A</div>
        <div className="pdf-name" style={styleMap[style]}>{restaurant.name}</div>
        <div className="pdf-line">{menu.season}</div>
        <div className="pdf-divider"></div>
        {menu.dishes.map(d => (
          <div key={d.id} className="pdf-dish">
            <div className="pdf-dish-title" style={styleMap[style]}>{d.name}</div>
            <div className="pdf-dish-desc">{d.desc}</div>
            <div className="pdf-dish-price">{d.price} €</div>
          </div>
        ))}
        <div className="pdf-foot">{restaurant.name} · {menu.title}</div>
      </div>
      <button className="pdf-share" onClick={() => { showToast(t("toast_pdf_shared")); onClose(); }}>
        <i className="ti ti-share"></i>Compartir
      </button>
    </div>
  );
}

const STORAGE_KEY = "atelier-state-v1";
const ONBOARDED_KEY = "atelier-onboarded-v1";

function generateCode(name) {
  const slug = (name || "ATELIER").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6) || "ATELIER";
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${slug}-${suffix}`;
}

function App() {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return window.INITIAL_STATE;
  });
  const [onboarded, setOnboarded] = useState(() => !!localStorage.getItem(ONBOARDED_KEY));
  const [route, setRoute] = useState({ name: "casa", params: {} });
  const [history, setHistory] = useState([]);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [pdfData, setPdfData] = useState(null);
  const [toast, setToast] = useState(null);

  // Keep global lang in sync with state so t() returns the right strings.
  window.__currentLang = state.user.language;

  React.useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const navigate = useCallback((name, params = {}) => {
    setHistory(h => [...h, route]);
    setRoute({ name, params });
  }, [route]);

  const goTab = useCallback((tabId) => {
    setHistory([]);
    setRoute({ name: tabId, params: {} });
  }, []);

  const goBack = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const next = h[h.length - 1];
      setRoute(next);
      return h.slice(0, -1);
    });
  }, []);

  const openSheet = useCallback((kind, params = {}) => setSheet({ kind, params }), []);

  if (!onboarded) {
    return (
      <div className="stage" data-screen-label="atelier-onboarding">
        <div className="phone">
          <div className="screen">
            <StatusBar />
            <OnboardingScreen onComplete={(data) => {
              if (data.flow === "create") {
                setState(prev => ({
                  ...prev,
                  user: { ...prev.user, email: data.email, role: "admin" },
                  restaurant: {
                    ...prev.restaurant,
                    name: data.restaurant.name,
                    identity: data.restaurant.identity,
                    initial: (data.restaurant.name || "A")[0].toUpperCase(),
                    inviteCode: generateCode(data.restaurant.name),
                  }
                }));
              } else {
                setState(prev => ({
                  ...prev,
                  user: { ...prev.user, email: data.email, role: "viewer" },
                }));
              }
              localStorage.setItem(ONBOARDED_KEY, "1");
              setOnboarded(true);
            }} />
            <div className="home-bar"></div>
          </div>
        </div>
        <div className="caption">
          <span className="pill">Prototipo</span>
          Atelier Culinaire · Onboarding
        </div>
      </div>
    );
  }

  // Header config
  const showBack = history.length > 0;
  const title = titleFor(route.name);
  const activeTab = TAB_FOR[route.name];

  let screen = null;
  switch (route.name) {
    case "casa":
      screen = <CasaScreen state={state} navigate={navigate} openSheet={openSheet} />; break;
    case "inicio":
      screen = <InicioScreen state={state} setState={setState} navigate={navigate} showToast={showToast} />; break;
    case "asistente":
      screen = <AsistenteScreen state={state} setState={setState} navigate={navigate} showToast={showToast} route={route} />; break;
    case "recetas":
      screen = <RecetasScreen state={state} setState={setState} navigate={navigate} openSheet={openSheet} showToast={showToast} />; break;
    case "recetaDetail":
      screen = <RecetaDetailScreen state={state} setState={setState} navigate={navigate} route={route} showToast={showToast} openSheet={openSheet} />; break;
    case "menus":
      screen = <MenusScreen state={state} navigate={navigate} />; break;
    case "menuDetail":
      screen = <MenuDetailScreen state={state} setState={setState} navigate={navigate} route={route} showToast={showToast} setShowPdf={setPdfData} />; break;
    default: screen = null;
  }

  // Asistente has its own composer at bottom; body uses no-tab-padding logic
  const isChat = route.name === "asistente";
  const isMenuDetail = route.name === "menuDetail";

  return (
    <div className="stage" data-screen-label={`atelier-${route.name}`}>
      <div className="phone">
        <div className="screen">
          <StatusBar />
          <Header
            title={title}
            back={showBack}
            onBack={goBack}
            onAvatar={() => setProfileOpen(true)}
            initials={state.user.initials}
            right={isMenuDetail ? <button className="header-back" aria-label="Más"><i className="ti ti-dots"></i></button> : null}
          />
          {isChat ? (
            <div className="body" style={{bottom: 0}}>
              {/* Chat stream auto-scrolls inside; composer sits above tabbar */}
              {screen}
            </div>
          ) : (
            <div className="body">
              {screen}
            </div>
          )}
          <TabBar active={activeTab} onChange={goTab} />
          <div className="home-bar"></div>

          {profileOpen && (
            <ProfileSheet state={state} setState={setState} onClose={() => setProfileOpen(false)} />
          )}
          {sheet?.kind === "addToMenu" && (
            <AddToMenuSheet
              state={state}
              setState={setState}
              recipeId={sheet.params.recipeId}
              onClose={() => setSheet(null)}
              showToast={showToast}
            />
          )}
          {sheet?.kind === "staffMember" && (
            <StaffMemberSheet
              state={state} setState={setState}
              staffId={sheet.params.staffId}
              onClose={() => setSheet(null)}
              showToast={showToast}
            />
          )}
          {sheet?.kind === "confirm" && (
            <ConfirmSheet
              {...sheet.params}
              onClose={() => setSheet(null)}
            />
          )}
          {pdfData && (
            <PdfPreview data={pdfData} restaurant={state.restaurant} onClose={() => setPdfData(null)} showToast={showToast} />
          )}

          {toast && (
            <div className="toast">
              <i className="ti ti-check"></i>{toast}
            </div>
          )}
        </div>
      </div>
      <div className="caption">
        <span className="pill">Prototipo</span>
        Atelier Culinaire · iPhone · 375 × 812
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
