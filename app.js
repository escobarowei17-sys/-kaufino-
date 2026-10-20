(() => {
  const cfg = window.KAUFINO_CONFIG || {};
  const $ = id => document.getElementById(id);

  const cats = [
    ["Alle", "✦"],
    ["Fahrzeuge", "🚗"],
    ["Elektronik", "🎧"],
    ["Haus & Garten", "🪴"],
    ["Mode", "👕"],
    ["Möbel", "🛋️"],
    ["Freizeit", "🚲"],
    ["Kinder", "🧸"],
    ["Sonstiges", "📦"]
  ];

  let client = null;
  let user = null;
  let active = "Alle";
  let items = [];
  let mode = "login";

  const icons = Object.fromEntries(cats);

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

  const money = n => new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(Number(n || 0));

  function status(message, error = false) {
    $("statusMessage").textContent = message || "";
    $("statusMessage").classList.toggle("error", error);
  }

  function toast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");
    setTimeout(() => $("toast").classList.remove("show"), 3500);
  }

  function renderCats() {
    $("categories").innerHTML = cats.map(([name, icon]) => `
      <button class="category ${active === name ? "active" : ""}"
              data-cat="${esc(name)}">
        <span class="icon">${icon}</span>
        <strong>${esc(name)}</strong>
      </button>
    `).join("");

    $("listingCategory").innerHTML = cats
      .filter(c => c[0] !== "Alle")
      .map(([name]) => `<option>${esc(name)}</option>`)
      .join("");
  }

  function renderCities() {
    const previous = $("citySearch").value;
    const cities = [...new Set(items.map(x => x.city).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "de"));

    $("citySearch").innerHTML =
      '<option value="">Alle Städte</option>' +
      cities.map(city => `<option>${esc(city)}</option>`).join("");

    if (cities.includes(previous)) {
      $("citySearch").value = previous;
    }
  }

  function renderItems() {
    const term = $("searchInput").value.trim().toLocaleLowerCase("de");
    const city = $("citySearch").value;

    const shown = items.filter(x =>
      (active === "Alle" || x.category === active) &&
      (!city || x.city === city) &&
      (!term || `${x.title || ""} ${x.description || ""} ${x.category || ""} ${x.city || ""}`
        .toLocaleLowerCase("de").includes(term))
    );

    $("listingCount").textContent =
      `${shown.length} ${shown.length === 1 ? "Anzeige" : "Anzeigen"}`;

    $("listings").innerHTML = shown.length
      ? shown.map(x => {
          let photos = Array.isArray(x.image_urls) ? x.image_urls : [];

          if (!photos.length && x.image_url) {
            photos = [x.image_url];
          }

          photos = photos.filter(url =>
            typeof url === "string" && /^https?:\/\//i.test(url)
          );

          const gallery = photos.length
            ? `<div class="listing-gallery">
                ${photos.map(url => `
                  <img loading="lazy" src="${esc(url)}"
                       alt="${esc(x.title || "Foto")}"
                       onerror="this.style.display='none'">
                `).join("")}
               </div>`
            : `<div class="listing-image">${icons[x.category] || "📦"}</div>`;

          return `
            <article class="listing-card">
              ${gallery}
              <div class="listing-body">
                <div class="listing-category">${esc(x.category || "Sonstiges")}</div>
                <h3>${esc(x.title)}</h3>
                <div class="price">${money(x.price)}</div>
                <p class="description">${esc(x.description || "Keine Beschreibung vorhanden.")}</p>
                <div class="listing-meta">
                  <span>⌖ ${esc(x.city || "Deutschland")}</span>
                  <span>${x.created_at ? new Date(x.created_at).toLocaleDateString("de-DE") : ""}</span>
                </div>
              </div>
            </article>
          `;
        }).join("")
      : '<div class="empty">Keine Anzeigen gefunden.</div>';
  }

  async function loadItems() {
    if (!client) {
      status("Die Datenbankverbindung ist nicht eingerichtet.", true);
      return;
    }

    status("Anzeigen werden geladen…");

    const { data, error } = await client
      .from("listings")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error(error);
      status("Fehler beim Laden: " + error.message, true);
      return;
    }

    items = data || [];
    renderCities();
    renderItems();
    status("");
  }

  function updateUser() {
    $("footerUser").textContent = user
      ? `Angemeldet: ${user.email}`
      : "Nicht angemeldet";

    $("loginOpen").textContent = user ? "Abmelden" : "Anmelden";
    $("signupOpen").classList.toggle("hidden", !!user);
  }

  function openAuth(selectedMode) {
    mode = selectedMode;

    $("authTitle").textContent =
      mode === "signup" ? "Konto erstellen" : "Anmelden";

    $("authEyebrow").textContent =
      mode === "signup" ? "WILLKOMMEN BEI KAUFINO" : "WILLKOMMEN ZURÜCK";

    $("authSubmit").textContent =
      mode === "signup" ? "Konto erstellen" : "Anmelden";

    $("nameWrap").classList.toggle("hidden", mode !== "signup");
    $("switchText").textContent =
      mode === "signup" ? "Schon ein Konto?" : "Noch kein Konto?";

    $("switchAuth").textContent =
      mode === "signup" ? "Anmelden" : "Konto erstellen";

    $("authDialog").showModal();
  }

  async function refreshUser() {
    if (!client) return;

    const { data } = await client.auth.getUser();
    user = data?.user || null;
    updateUser();
  }

  async function authSubmit(event) {
    event.preventDefault();

    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;

    $("authSubmit").disabled = true;

    try {
      let result;

      if (mode === "signup") {
        result = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: $("displayName").value.trim() }
          }
        });
      } else {
        result = await client.auth.signInWithPassword({ email, password });
      }

      if (result.error) throw result.error;

      user = result.data.user || null;
      updateUser();
      $("authDialog").close();
      toast(mode === "signup" ? "Konto erstellt!" : "Angemeldet!");
    } catch (error) {
      $("authError").textContent = error.message || "Fehler";
      $("authError").classList.remove("hidden");
    } finally {
      $("authSubmit").disabled = false;
    }
  }

  async function listingSubmit(event) {
    event.preventDefault();

    if (!client) {
      $("listingError").textContent = "Datenbank nicht verbunden.";
      $("listingError").classList.remove("hidden");
      return;
    }

    await refreshUser();

    if (!user) {
      $("listingDialog").close();
      openAuth("login");
      return;
    }

    const image = $("listingImage").value.trim();

    const payload = {
      seller_id: user.id,
      title: $("listingTitle").value.trim(),
      description: $("listingDescription").value.trim(),
      price: Number($("listingPrice").value),
      category: $("listingCategory").value,
      city: $("listingCity").value.trim(),
      image_urls: image ? [image] : [],
      status: "active"
    };

    $("publishButton").disabled = true;

    try {
      const { error } = await client.from("listings").insert(payload);
      if (error) throw error;

      $("listingDialog").close();
      $("listingForm").reset();
      toast("Anzeige veröffentlicht!");
      await loadItems();
    } catch (error) {
      $("listingError").textContent =
        "Speichern fehlgeschlagen: " + error.message;
      $("listingError").classList.remove("hidden");
    } finally {
      $("publishButton").disabled = false;
    }
  }

  function events() {
    $("categories").addEventListener("click", event => {
      const button = event.target.closest("[data-cat]");
      if (!button) return;
      active = button.dataset.cat;
      renderCats();
      renderItems();
    });

    $("searchInput").addEventListener("input", renderItems);
    $("citySearch").addEventListener("change", renderItems);
    $("searchButton").addEventListener("click", renderItems);

    $("loginOpen").addEventListener("click", async () => {
      if (user) {
        await client.auth.signOut();
        user = null;
        updateUser();
      } else {
        openAuth("login");
      }
    });

    $("signupOpen").addEventListener("click", () => openAuth("signup"));

    $("newListingOpen").addEventListener("click", async () => {
      await refreshUser();

      if (!user) {
        openAuth("login");
        return;
      }

      $("listingDialog").showModal();
    });

    $("authForm").addEventListener("submit", authSubmit);
    $("listingForm").addEventListener("submit", listingSubmit);

    $("switchAuth").addEventListener("click", () =>
      openAuth(mode === "signup" ? "login" : "signup")
    );

    document.querySelectorAll("[data-close]").forEach(button => {
      button.addEventListener("click", () =>
        $(button.dataset.close).close()
      );
    });
  }

  renderCats();
  events();

  if (window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY) {
    client = window.supabase.createClient(
      cfg.SUPABASE_URL,
      cfg.SUPABASE_PUBLISHABLE_KEY
    );

    client.auth.onAuthStateChange((_event, session) => {
      user = session?.user || null;
      updateUser();
    });

    refreshUser().then(loadItems);
  } else {
    status("Bitte prüfe config.js und den Supabase-Schlüssel.", true);
  }

  updateUser();
})();