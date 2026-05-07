// Atelier Culinaire — screen components.

const { useState, useEffect, useRef, useMemo } = React;
const t = window.t;

// ─────────── Shared chrome ───────────
function StatusBar() {
  return (
    <div className="status">
      <span>9:41</span>
      <span className="status-right">
        <i className="ti ti-signal-4g" aria-hidden="true"></i>
        <i className="ti ti-wifi" aria-hidden="true"></i>
        <i className="ti ti-battery-3" aria-hidden="true"></i>
      </span>
    </div>);

}

function Header({ title, back, onBack, onAvatar, initials, right }) {
  return (
    <div className="header">
      <div className="header-side">
        {back ?
        <button className="header-back" onClick={onBack} aria-label="←">
            <i className="ti ti-chevron-left"></i>
          </button> :

        <div className="mark"><span className="glyph">A</span>telier</div>
        }
      </div>
      {title && <div className="page-title">{title}</div>}
      <div className="header-side right">
        {right}
        <div className="avatar" onClick={onAvatar} role="button" tabIndex={0}>{initials}</div>
      </div>
    </div>);

}

function TabBar({ active, onChange }) {
  const tabs = [
  { id: "inicio", label: t("tab_inicio"), icon: "ti-pencil" },
  { id: "asistente", label: t("tab_asistente"), icon: "ti-message-2" },
  { id: "recetas", label: t("tab_recetas"), icon: "ti-book-2" },
  { id: "menus", label: t("tab_menus"), icon: "ti-clipboard-list" },
  { id: "casa", label: t("tab_casa"), icon: "ti-home" }];

  return (
    <div className="tabbar">
      {tabs.map((tab) =>
      <button
        key={tab.id}
        className={`tab ${active === tab.id ? "active" : ""}`}
        onClick={() => onChange(tab.id)}>
        
          <i className={`ti ${tab.icon}`}></i>
          <span className="tab-label" style={{ color: "rgb(41, 18, 4)" }}>{tab.label}</span>
        </button>
      )}
    </div>);

}

// ─────────── Onboarding ───────────
function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState("");
  const [code, setCode] = useState("");

  if (step === "login") {
    return (
      <div className="onboard">
        <div className="onboard-mark"><span className="glyph">A</span>telier</div>
        <div className="onboard-tag">Cuaderno creativo del chef</div>
        <input className="onboard-input" placeholder="tu@email.com"
        value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        <button className="btn-primary" disabled={!email.includes("@")}
        onClick={() => setStep("chooseFlow")}>
          Recibir enlace mágico
        </button>
      </div>);

  }

  if (step === "chooseFlow") {
    return (
      <div className="onboard">
        <div className="onboard-tag">¿Cómo quieres empezar?</div>
        <button className="onboard-card" onClick={() => setStep("createRestaurant")}>
          <i className="ti ti-home-plus"></i>
          <div className="t">Crear mi restaurante</div>
          <div className="s">Serás admin del grupo</div>
        </button>
        <button className="onboard-card" onClick={() => setStep("joinWithCode")}>
          <i className="ti ti-key"></i>
          <div className="t">Unirme con un código</div>
          <div className="s">Te lo dio el admin de tu equipo</div>
        </button>
      </div>);

  }

  if (step === "createRestaurant") {
    return (
      <div className="onboard">
        <div className="onboard-tag">Tu restaurante</div>
        <input className="onboard-input" placeholder="Nombre del restaurante"
        value={name} onChange={(e) => setName(e.target.value)} />
        <textarea className="onboard-input" placeholder="Una línea de identidad: cocina, técnica, sello"
        value={identity} onChange={(e) => setIdentity(e.target.value)} rows={2} />
        <button className="btn-primary" disabled={!name}
        onClick={() => onComplete({ flow: "create", email, restaurant: { name, identity } })}>
          Crear y entrar
        </button>
      </div>);

  }

  if (step === "joinWithCode") {
    return (
      <div className="onboard">
        <div className="onboard-tag">Código de invitación</div>
        <input className="onboard-input" placeholder="MARCHE-A7K2"
        value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="btn-primary" disabled={code.length < 4}
        onClick={() => onComplete({ flow: "join", email, code })}>
          Unirme
        </button>
      </div>);

  }
  return null;
}

// ─────────── Errors ───────────
function NetworkError({ onRetry }) {
  return (
    <div className="empty">
      <i className="ti ti-wifi-off" style={{ color: "var(--terracota)" }}></i>
      <div className="t">{t("error_offline_title")}</div>
      <div className="s">{t("error_offline_sub")}</div>
      {onRetry &&
      <button className="btn-secondary" onClick={onRetry} style={{ marginTop: 14 }}>
          <i className="ti ti-refresh"></i>Reintentar
        </button>
      }
    </div>);

}

// ─────────── CASA ───────────
function CasaScreen({ state, navigate, openSheet }) {
  const [copied, setCopied] = useState(false);
  const [regenerated, setRegenerated] = useState(false);

  const role = state.user.role;
  const canManageGroup = role === "admin";
  const canCreateMenu = role === "admin" || role === "chef_executive" || role === "sous_chef";

  function copyCode() {setCopied(true);setTimeout(() => setCopied(false), 1600);}
  function regenCode() {setRegenerated(true);setTimeout(() => setRegenerated(false), 1600);}

  return (
    <div className="content">
      <div className="casa-resto">
        <div className="casa-resto-row">
          <div className="casa-resto-photo">{state.restaurant.initial}</div>
          <div className="casa-resto-meta">
            <div className="eyebrow">{t("eyebrow_casa")}</div>
            <div className="casa-resto-name">{state.restaurant.name}</div>
            <div className="casa-resto-line">{state.restaurant.identity}</div>
          </div>
        </div>
        {canManageGroup &&
        <>
            <div className="casa-invite">
              <span className="eyebrow" style={{ flexShrink: 0 }}>{t("eyebrow_codigo")}</span>
              <span className="casa-invite-code">{state.restaurant.inviteCode}</span>
              <span className="casa-invite-actions">
                <button onClick={copyCode}><i className="ti ti-copy"></i></button>
                <button onClick={regenCode}><i className="ti ti-refresh"></i></button>
              </span>
            </div>
            {copied && <div className="copy-toast">{t("toast_copiado")}</div>}
            {regenerated && <div className="copy-toast">{t("toast_regenerado")}</div>}
          </>
        }
      </div>

      <div className="casa-section">
        <div className="section-eyebrow">
          <span className="eyebrow">{t("eyebrow_menus_activos")}</span>
          <span className="section-count">{state.menus.length}</span>
        </div>
        {state.menus.length === 0 ?
        <div className="empty">
            <i className="ti ti-clipboard-list"></i>
            <div className="t">{t("empty_menus_title")}</div>
            <div className="s">{t("empty_menus_sub")}</div>
          </div> :
        state.menus.map((m) =>
        <button key={m.id} className="menu-card" onClick={() => navigate("menuDetail", { menuId: m.id })}>
            <div className="menu-card-eyebrow">{m.season}</div>
            <div className="menu-card-title">{m.title}</div>
            <div className="menu-card-meta">{m.dishes} · {m.updated}</div>
          </button>
        )}
        {canCreateMenu &&
        <button className="btn-ghost" onClick={() => navigate("menus")}>
            <i className="ti ti-plus"></i><span>{t("btn_crear_menu")}</span>
          </button>
        }
      </div>

      <div className="casa-section">
        <div className="section-eyebrow">
          <span className="eyebrow">{t("eyebrow_staff")}</span>
          <span className="section-count">{state.staff.length}</span>
        </div>
        {state.staff.map((s) =>
        <button
          key={s.id}
          className="staff-row"
          onClick={() => canManageGroup && openSheet && openSheet("staffMember", { staffId: s.id })}
          disabled={!canManageGroup}>
          
            <div className={`staff-avatar ${s.roleClass}`}>{s.initials}</div>
            <div className="staff-meta">
              <span className="staff-name">{s.name}</span>
              <span className="staff-role">{s.role}</span>
            </div>
            <i className="ti ti-chevron-right staff-chevron"></i>
          </button>
        )}
        {canManageGroup &&
        <button className="btn-ghost" style={{ marginTop: 14 }}>
            <i className="ti ti-user-plus"></i><span>{t("btn_invitar_miembro")}</span>
          </button>
        }
      </div>
    </div>);

}

// ─────────── INICIO ───────────
function InicioScreen({ state, setState, navigate, showToast }) {
  const [draft, setDraft] = useState("");
  const ref = useRef(null);

  function autoGrow(e) {
    setDraft(e.target.value);
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }

  function saveIdea() {
    if (!draft.trim()) return;
    const id = "i" + Date.now();
    setState((prev) => ({
      ...prev,
      ideas: [{ id, text: draft.trim(), at: "Ahora", status: "open" }, ...prev.ideas]
    }));
    setDraft("");
    if (ref.current) ref.current.style.height = "auto";
    showToast(t("toast_idea_saved"));
  }

  function openInChat(idea) {
    navigate("asistente", { ideaText: idea.text, ideaId: idea.id });
  }

  const firstName = state.user.name.split(" ")[0];

  return (
    <div className="content">
      <div className="inicio-hero">
        <div className="eyebrow">{t("eyebrow_bloc")}</div>
        <h1 className="inicio-greet">{t("inicio_greet", { name: firstName })} <em>{t("inicio_greet_em")}</em></h1>
        <div className="idea-input-wrap">
          <textarea
            ref={ref}
            className="idea-input"
            placeholder={t("inicio_placeholder")}
            value={draft}
            onChange={autoGrow}
            rows={1} />
          
          <div className="idea-actions">
            <div className="left">
              <i className="ti ti-camera"></i>
              <i className="ti ti-microphone"></i>
              <i className="ti ti-tag"></i>
            </div>
            <button className="idea-save" disabled={!draft.trim()} onClick={saveIdea}>{t("btn_save")}</button>
          </div>
        </div>
      </div>

      {state.ideas.length === 0 ?
      <div className="empty">
          <i className="ti ti-pencil"></i>
          <div className="t">{t("empty_inicio_title")}</div>
          <div className="s">{t("empty_inicio_sub")}</div>
        </div> :

      <div>
          <div className="section-eyebrow">
            <span className="eyebrow">{t("eyebrow_ultimas_ideas")}</span>
            <span className="section-count">{state.ideas.length}</span>
          </div>
          {state.ideas.map((idea) =>
        <div key={idea.id} className="idea-card" onClick={() => openInChat(idea)}>
              <div className="idea-card-text">{idea.text}</div>
              <div className="idea-card-meta">
                <span>{idea.at}</span>
                <span className="open">
                  {t("inicio_idea_action")} <i className="ti ti-arrow-right"></i>
                </span>
              </div>
            </div>
        )}
        </div>
      }
    </div>);

}

// ─────────── ASISTENTE ───────────
function AsistenteScreen({ state, setState, navigate, showToast, route }) {
  const ideaText = route.params?.ideaText;
  const [messages, setMessages] = useState(() => {
    if (ideaText) return [{ role: "user", content: ideaText }];
    return [];
  });
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [model, setModel] = useState(state.user.model);
  const streamRef = useRef(null);

  useEffect(() => {
    if (ideaText && messages.length === 1) {
      setTyping(true);
      const tm = setTimeout(() => {
        setMessages((m) => [...m, {
          role: "assistant",
          content: "Buena base. ¿Qué quieres que domine en boca, el ave o el café? Si prefieres que el pichón mande, una **cold brew suave (Etiopía, 14 h)** y la espuma muy ligera. Dime el ángulo y te lo estructuro."
        }]);
        setTyping(false);
      }, 1100);
      return () => clearTimeout(tm);
    }
  }, []);

  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [messages, typing]);

  function send() {
    if (!draft.trim()) return;
    const text = draft.trim();
    setMessages((m) => [...m, { role: "user", content: text }]);
    setDraft("");
    setTyping(true);
    setTimeout(() => {
      setMessages((m) => [...m, {
        role: "assistant",
        content: "Anotado. Te lo dejo como receta estructurada con técnica detallada. *No tengo certeza* sobre el comportamiento de la espuma más allá de cuatro minutos."
      }]);
      setTyping(false);
    }, 1500);
  }

  function saveAsRecipe() {
    const id = "r" + Date.now();
    const newRecipe = {
      id,
      title: ideaText || "Nueva receta desde chat",
      state: "draft", version: 1, priority: false,
      updated: "Ahora",
      author: state.user.name.split(" ")[0],
      ingredients: ["(detalle desde la conversación)"],
      method: ["(pasos desde la conversación)"],
      notes: "Generada desde chat IA"
    };
    setState((prev) => ({ ...prev, recipes: [newRecipe, ...prev.recipes] }));
    showToast(t("toast_recipe_saved"));
    setTimeout(() => navigate("recetaDetail", { recipeId: id }), 600);
  }

  function renderMd(s) {
    const parts = [];
    let key = 0;
    const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let m,last = 0;
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) parts.push(s.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("**")) parts.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);else
      parts.push(<em key={key++}>{tok.slice(1, -1)}</em>);
      last = m.index + tok.length;
    }
    if (last < s.length) parts.push(s.slice(last));
    return parts;
  }

  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === "assistant") return i;
    return -1;
  })();

  return (
    <>
      {ideaText &&
      <div className="chat-context">
          <i className="ti ti-bookmark"></i>
          <div className="chat-context-text">
            <span className="chat-context-label">{t("chat_idea_anclada")}</span>
            {ideaText}
          </div>
        </div>
      }
      <div className="composer-meta">
        <div></div>
        <button
          className={`model-toggle ${model === "opus" ? "opus" : ""}`}
          onClick={() => setModel(model === "sonnet" ? "opus" : "sonnet")}>
          
          <span className="dot"></span>
          {model === "sonnet" ? "Sonnet 4.6" : "Opus 4.7"}
        </button>
      </div>
      <div className="chat-stream" ref={streamRef}>
        {messages.length === 0 && !typing && !state.user.offline &&
        <div className="empty" style={{ margin: "auto" }}>
            <i className="ti ti-message-2"></i>
            <div className="t">{t("empty_chat_title")}</div>
            <div className="s">{t("empty_chat_sub")}</div>
          </div>
        }
        {state.user.offline &&
        <NetworkError onRetry={() => setState((prev) => ({ ...prev, user: { ...prev.user, offline: false } }))} />
        }
        {!state.user.offline && messages.map((m, i) =>
        <div key={i} className={`msg ${m.role}`}>
            <div className="msg-role">{m.role === "user" ? t("chat_role_user") : t("chat_role_assistant")}</div>
            <div className="msg-bubble">
              {m.content.split("\n\n").map((p, j) =>
            <p key={j} style={{ margin: j ? "8px 0 0" : 0 }}>{renderMd(p)}</p>
            )}
            </div>
            {m.role === "assistant" && i === lastAssistantIdx && !typing &&
          <div className="msg-actions">
                <button className="msg-action solid" onClick={saveAsRecipe}>
                  <i className="ti ti-bookmark"></i>{t("chat_save_recipe")}
                </button>
                <button className="msg-action">
                  <i className="ti ti-refresh"></i>{t("chat_reformulate")}
                </button>
              </div>
          }
          </div>
        )}
        {typing &&
        <div className="msg assistant">
            <div className="msg-role">{t("chat_role_assistant")}</div>
            <div className="msg-bubble">
              <div className="typing"><span></span><span></span><span></span></div>
            </div>
          </div>
        }
      </div>
      <div className="composer">
        <textarea
          className="composer-input"
          placeholder={t("chat_placeholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={1}
          onKeyDown={(e) => {if (e.key === "Enter" && !e.shiftKey) {e.preventDefault();send();}}} />
        
        <button className="composer-send" disabled={!draft.trim()} onClick={send}>
          <i className="ti ti-arrow-up"></i>
        </button>
      </div>
    </>);

}

// ─────────── RECETAS ───────────
function RecetasScreen({ state, setState, navigate, openSheet, showToast }) {
  const [filter, setFilter] = useState("in_progress");
  const [query, setQuery] = useState("");
  const counts = useMemo(() => ({
    all: state.recipes.length,
    in_progress: state.recipes.filter((r) => r.state === "draft" || r.state === "in_test").length,
    draft: state.recipes.filter((r) => r.state === "draft").length,
    in_test: state.recipes.filter((r) => r.state === "in_test").length,
    approved: state.recipes.filter((r) => r.state === "approved").length,
    priority: state.recipes.filter((r) => r.priority).length
  }), [state.recipes]);

  const list = state.recipes.filter((r) => {
    if (filter === "all") {/* pasa */}
    else if (filter === "in_progress") {
      if (r.state !== "draft" && r.state !== "in_test") return false;
    }
    else if (filter === "priority") {
      if (!r.priority) return false;
    }
    else if (r.state !== filter) return false;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      if (!r.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const stateLabel = {
    draft: t("state_draft"),
    in_test: t("state_in_test"),
    approved: t("state_approved")
  };

  return (
    <div className="content">
      {state.recipes.length === 0 ?
      <div className="empty">
          <i className="ti ti-book-2"></i>
          <div className="t">{t("empty_recetas_title")}</div>
          <div className="s">{t("empty_recetas_sub")}</div>
        </div> :

      <>
      <div className="recetas-search">
        <i className="ti ti-search"></i>
        <input
          type="text"
          placeholder={t("recetas_search_placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)} />
        {query &&
          <button onClick={() => setQuery("")} aria-label="Limpiar">
            <i className="ti ti-x"></i>
          </button>
        }
      </div>
      <div className="recetas-tabs">
        <button className={`recetas-tab ${filter === "in_progress" ? "active" : ""}`} onClick={() => setFilter("in_progress")}>
          {t("recetas_filter_in_progress")} <span className="count">{counts.in_progress}</span>
        </button>
        <button className={`recetas-tab ${filter === "priority" ? "active" : ""}`} onClick={() => setFilter("priority")}>
          ★ {t("recetas_filter_priority")} <span className="count">{counts.priority}</span>
        </button>
        <button className={`recetas-tab ${filter === "approved" ? "active" : ""}`} onClick={() => setFilter("approved")}>
          {t("recetas_filter_approved")} <span className="count">{counts.approved}</span>
        </button>
        <button className={`recetas-tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          {t("recetas_filter_all")} <span className="count">{counts.all}</span>
        </button>
      </div>

      {list.length === 0 ?
        <div className="empty">
          <i className="ti ti-book-2"></i>
          <div className="t">{t("empty_recetas_title")}</div>
          <div className="s">{t("empty_recetas_sub")}</div>
        </div> :
        list.map((r) =>
        <div
          key={r.id}
          className={`recipe-card ${r.priority ? "priority" : ""}`}
          onClick={() => navigate("recetaDetail", { recipeId: r.id })}
          style={{ position: "relative" }}>
          
          <div className={`recipe-card-state ${r.state}`}>{stateLabel[r.state]} · v{r.version}</div>
          <div className="recipe-card-title" style={{ paddingRight: 32 }}>{r.title}</div>
          <div className="recipe-card-meta">
            <span>{r.author}</span>
            <span className="dot"></span>
            <span>{r.updated}</span>
          </div>
          <button
            className="recipe-card-delete"
            onClick={(e) => {
              e.stopPropagation();
              openSheet("confirm", {
                title: t("confirm_delete_recipe_title"),
                body: `"${r.title}" \u2014 ${t("confirm_delete_recipe_body")}`,
                confirmLabel: t("confirm_delete"),
                danger: true,
                onConfirm: () => {
                  setState((prev) => ({ ...prev, recipes: prev.recipes.filter((x) => x.id !== r.id) }));
                  showToast && showToast(t("confirm_delete"));
                },
              });
            }}
            aria-label={t("confirm_delete")}>
            <i className="ti ti-trash"></i>
          </button>
        </div>
        )}
        </>
      }
    </div>);

}

function RecetaDetailScreen({ state, setState, navigate, route, showToast, openSheet }) {
  const recipe = state.recipes.find((r) => r.id === route.params.recipeId);
  if (!recipe) return <div className="content"><div className="empty"><div className="t">—</div></div></div>;

  const update = (patch) => setState((prev) => ({
    ...prev,
    recipes: prev.recipes.map((r) => r.id === recipe.id ? { ...r, ...patch } : r)
  }));

  const stateLabel = {
    draft: t("state_draft"),
    in_test: t("state_in_test"),
    approved: t("state_approved")
  };

  function togglePriority() {
    update({ priority: !recipe.priority });
    showToast(recipe.priority ? t("toast_priority_off") : t("toast_priority_on"));
  }
  function advance() {
    if (recipe.state === "draft") {update({ state: "in_test" });showToast(t("toast_advanced_to_test"));} else
    if (recipe.state === "in_test") {
      update({ state: "approved" });
      showToast(t("toast_approved"));
      setTimeout(() => openSheet("addToMenu", { recipeId: recipe.id }), 600);
    }
  }

  return (
    <div className="content">
      <div className="recipe-detail-hero" style={{ position: "relative" }}>
        <button
          onClick={() => showToast(t("toast_edit_mode"))}
          style={{
            position: "absolute", top: 0, right: 0,
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 12px", background: "transparent",
            border: "0.5px solid var(--edge)", borderRadius: 16,
            fontFamily: "var(--sans)", fontSize: 11,
            letterSpacing: "0.08em", textTransform: "uppercase",
            color: "var(--teal)", fontWeight: 500, cursor: "pointer"
          }}>
          
          <i className="ti ti-pencil" style={{ fontSize: 13 }}></i>
          {t("btn_edit")}
        </button>
        <span className={`recipe-detail-state ${recipe.state}`}>
          {stateLabel[recipe.state]} · v{recipe.version}
          {recipe.priority && <span style={{ marginLeft: 6, color: "#c47e4f" }}>★</span>}
        </span>
        <h1 className="recipe-detail-title">{recipe.title}</h1>
        <div className="recipe-detail-sub">{recipe.author} · {recipe.updated}</div>
      </div>

      {recipe.ingredients.length > 0 &&
      <div className="recipe-section">
          <h3>{t("section_ingredients")}</h3>
          <ul>{recipe.ingredients.map((i, k) => <li key={k}>{i}</li>)}</ul>
        </div>
      }

      {recipe.method.length > 0 &&
      <div className="recipe-section">
          <h3>{t("section_method")}</h3>
          <ol style={{ paddingLeft: 18, fontFamily: "var(--serif)", fontSize: 15, color: "var(--ink)", lineHeight: 1.6 }}>
            {recipe.method.map((s, k) => <li key={k} style={{ marginBottom: 8 }}>{s}</li>)}
          </ol>
        </div>
      }

      {recipe.notes &&
      <div className="recipe-section">
          <h3>{t("section_note")}</h3>
          <p style={{ fontStyle: "italic", color: "var(--ink-soft)" }}>{recipe.notes}</p>
        </div>
      }

      <div className="action-stack">
        {recipe.state !== "approved" ?
        <>
            <button className="btn-primary" onClick={advance}>
              <i className="ti ti-arrow-up-right"></i>
              {recipe.state === "draft" ? t("btn_advance_to_test") : t("btn_approve")}
            </button>
            <button className="btn-secondary" onClick={togglePriority}>
              <i className={recipe.priority ? "ti ti-star-filled" : "ti ti-star"}></i>
              {recipe.priority ? t("btn_priority_off") : t("btn_priority_on")}
            </button>
          </> :

        <button className="btn-primary" onClick={() => openSheet("addToMenu", { recipeId: recipe.id })}>
            <i className="ti ti-plus"></i>{t("btn_add_to_menu")}
          </button>
        }
      </div>
    </div>);

}

// ─────────── MENÚS ───────────
function MenusScreen({ state, navigate }) {
  return (
    <div className="content">
      <div className="section-eyebrow">
        <span className="eyebrow">{t("eyebrow_carpetas")}</span>
        <span className="section-count">{state.menus.length}</span>
      </div>
      {state.menus.length === 0 ?
      <div className="empty">
          <i className="ti ti-clipboard-list"></i>
          <div className="t">{t("empty_menus_title")}</div>
          <div className="s">{t("empty_menus_sub")}</div>
        </div> :
      state.menus.map((m) =>
      <button key={m.id} className="menu-card" onClick={() => navigate("menuDetail", { menuId: m.id })}>
          <div className="menu-card-eyebrow">{m.season}</div>
          <div className="menu-card-title">{m.title}</div>
          <div className="menu-card-meta">{m.dishes} · {m.updated}</div>
        </button>
      )}
      <button className="btn-ghost" style={{ marginTop: 14 }}>
        <i className="ti ti-plus"></i><span>{t("btn_crear_menu")}</span>
      </button>
    </div>);

}

function MenuDetailScreen({ state, setState, navigate, route, showToast, setShowPdf }) {
  const menu = state.menuDetail[route.params.menuId];
  if (!menu) return <div className="content"><div className="empty"><div className="t">—</div></div></div>;
  const [style, setStyle] = useState(menu.style);

  function setStyleAndSave(s) {
    setStyle(s);
    setState((prev) => ({
      ...prev,
      menuDetail: { ...prev.menuDetail, [menu.id]: { ...menu, style: s } }
    }));
  }

  const styleLabels = {
    elegant: t("style_elegant"),
    rustic: t("style_rustic"),
    minimal: t("style_minimal")
  };

  return (
    <div className="content">
      <div className="menu-detail-hero">
        <div className="eyebrow terracota">{menu.season}</div>
        <h1 className="menu-detail-title">{menu.title}</h1>
        <div className="menu-detail-meta">{menu.dishes.length} · {styleLabels[style]}</div>

        <div className="eyebrow" style={{ marginTop: 18, marginBottom: 6 }}>{t("eyebrow_estilo")}</div>
        <div className="style-picker">
          {["elegant", "rustic", "minimal"].map((s) =>
          <button key={s} className={`style-chip ${style === s ? "active" : ""}`} onClick={() => setStyleAndSave(s)}>
              {styleLabels[s]}
            </button>
          )}
        </div>
      </div>

      <div className="recipe-section">
        <h3>{t("section_dishes")}</h3>
        {menu.dishes.map((d) => {
          const canSeeRecipe = state.user.role !== "viewer" && d.recipeId;
          return (
            <div
              key={d.id}
              className="dish-row">
              
            <div className="dish-meta">
              <div className="dish-title">{d.name}</div>
              <div className="dish-desc">{d.desc}</div>
              {canSeeRecipe &&
                <button
                  className="dish-link"
                  onClick={(e) => { e.stopPropagation(); navigate("recetaDetail", { recipeId: d.recipeId }); }}>
                  <i className="ti ti-book-2"></i>
                  <span>{t("dish_view_recipe")}</span>
                </button>
                }
            </div>
            <input
                className="dish-price-input"
                type="number"
                value={d.price}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10) || 0;
                  setState((prev) => ({
                    ...prev,
                    menuDetail: {
                      ...prev.menuDetail,
                      [menu.id]: {
                        ...menu,
                        dishes: menu.dishes.map((x) => x.id === d.id ? { ...x, price: v } : x)
                      }
                    }
                  }));
                }} />
              
          </div>);
        })}
      </div>

      <div className="action-stack">
        <button className="btn-primary" onClick={() => setShowPdf({ menu, style })}>
          <i className="ti ti-file-text"></i>{t("btn_export_pdf")}
        </button>
      </div>
    </div>);

}

window.Atelier = window.Atelier || {};
Object.assign(window.Atelier, {
  StatusBar, Header, TabBar, NetworkError, OnboardingScreen,
  CasaScreen, InicioScreen, AsistenteScreen,
  RecetasScreen, RecetaDetailScreen,
  MenusScreen, MenuDetailScreen
});