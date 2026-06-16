
(() => {
  const form = document.getElementById("compareForm");
  const placeInput = document.getElementById("placeInput");
  const fuelSelect = document.getElementById("fuelSelect");
  const status = document.getElementById("compareStatus");
  const results = document.getElementById("compareResults");
  const geoButton = document.getElementById("geoButton");

  let userPosition = null;
  const fuelLabels = { gazole:"Gazole", sp95:"SP95", sp98:"SP98", e10:"E10", e85:"E85", gplc:"GPLc" };
  const clean = (v) => String(v ?? "").replace(/[<>"']/g, "").trim();

  function formatPrice(value){
    const n = Number(value);
    if(!Number.isFinite(n) || n <= 0) return "Prix à vérifier";
    return n.toFixed(3).replace(".", ",") + " €/L";
  }

  function logoInitial(name){
    const n = clean(name || "Station");
    return `<div class="station-logo">${n.charAt(0).toUpperCase()}</div>`;
  }

  function render(items, fuel, meta = {}){
    results.innerHTML = "";
    const label = fuelLabels[fuel] || fuel.toUpperCase();
    if(!items.length){
      status.textContent = meta.message || "Aucune station trouvée.";
      return;
    }
    status.textContent = meta.message || `${items.length} station(s) trouvée(s).`;

    items.forEach((item, index) => {
      const name = clean(item.name || "Station-service");
      const address = clean(item.address);
      const cp = clean(item.cp);
      const city = clean(item.city);
      const distance = clean(item.distanceText);
      const maj = clean(item.updateDateText);
      const mapQuery = encodeURIComponent([address, cp, city].filter(Boolean).join(" "));
      const sourceBadge = item.nameSource ? `<span class="name-source">${clean(item.nameSource)}</span>` : "";
      const info = `${label}${distance ? " · à " + distance : ""}${maj ? " · Mis à jour : " + maj : ""}`;

      const card = document.createElement("div");
      card.className = "result-card";
      card.innerHTML = `
        <div class="result-main">
          ${logoInitial(name)}
          <div>
            <strong>${index + 1}. ${name} ${sourceBadge}</strong>
            <div class="address">${address}${address && (cp || city) ? " · " : ""}${cp} ${city}</div>
            <div class="small">${info}</div>
            ${mapQuery ? `<a class="map-link" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}">Itinéraire</a>` : ""}
          </div>
        </div>
        <div class="price-badge">${formatPrice(item.price)}<span class="date">${label}</span></div>
      `;
      results.appendChild(card);
    });
  }

  async function searchStations(){
    const q = clean(placeInput.value);
    const fuel = String(fuelSelect.value || "e10").replace("prix_", "");
    if(!q && !userPosition){
      status.textContent = "Entre une ville, un code postal ou utilise ta position.";
      return;
    }

    const params = new URLSearchParams({ fuel });
    if(q) params.set("q", q);
    if(userPosition){
      params.set("lat", String(userPosition.lat));
      params.set("lon", String(userPosition.lon));
    }

    results.innerHTML = "";
    status.textContent = "Recherche des prix et des noms de stations…";

    try{
      const response = await fetch(`/api/carburants?${params.toString()}`, { headers:{ "Accept":"application/json" }});
      const data = await response.json();
      if(!response.ok || data.error) throw new Error(data.error || "Erreur API");
      render(data.results || [], fuel, data.meta || {});
    }catch(error){
      console.error(error);
      status.textContent = "Erreur de chargement. Vérifie que _worker.js est bien à la racine et que le projet est Cloudflare Pages.";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await searchStations();
  });

  if(geoButton){
    geoButton.addEventListener("click", () => {
      if(!navigator.geolocation){
        status.textContent = "Ton navigateur ne permet pas la géolocalisation.";
        return;
      }
      status.textContent = "Autorise la localisation pour calculer la distance…";
      navigator.geolocation.getCurrentPosition(async (position) => {
        userPosition = { lat: position.coords.latitude, lon: position.coords.longitude };
        status.textContent = "Position trouvée. Recherche des stations autour de toi…";
        await searchStations();
      }, () => {
        status.textContent = "Localisation refusée. Tu peux entrer ton code postal à la place.";
      }, { enableHighAccuracy:true, timeout:10000, maximumAge:120000 });
    });
  }
})();
