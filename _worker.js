
const FUEL_API = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records";
const STATION_PAGE = "https://www.prix-carburants.gouv.fr/station/";
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";

const FUEL_FIELDS = {
  gazole:{ price:"prix_gazole", update:"maj_gazole" },
  sp95:{ price:"prix_sp95", update:"maj_sp95" },
  sp98:{ price:"prix_sp98", update:"maj_sp98" },
  e10:{ price:"prix_e10", update:"maj_e10" },
  e85:{ price:"prix_e85", update:"maj_e85" },
  gplc:{ price:"prix_gplc", update:"maj_gplc" }
};

const PARIS_CP = Array.from({length:20}, (_,i)=>`750${String(i+1).padStart(2,"0")}`);
const TERGNIER_QUERIES = ["02700", "Condren", "Viry-Noureuil", "Beautor", "Chauny"];
const TERGNIER_FALLBACK = [
  { name:"TotalEnergies", address:"213 Bd Gambetta", cp:"02700", city:"Condren", lat:49.6370, lon:3.2840 },
  { name:"Auchan", address:"Route de Chauny", cp:"02300", city:"Viry-Noureuil", lat:49.6330, lon:3.2430 },
  { name:"E.Leclerc", address:"16 Rue de Tergnier", cp:"02800", city:"Beautor", lat:49.6520, lon:3.3450 },
  { name:"Intermarché", address:"ZAC de l'Univers, Bd de l'Europe", cp:"02300", city:"Chauny", lat:49.6150, lon:3.2180 }
];

const BRAND_RULES = [
  { name:"TotalEnergies", words:["totalenergies","total energies","total energie","total énergie","total access","total "] },
  { name:"Auchan", words:["auchan"] },
  { name:"E.Leclerc", words:["e.leclerc","e leclerc","leclerc"] },
  { name:"Carrefour", words:["carrefour"] },
  { name:"Intermarché", words:["intermarché","intermarche","inter marché"] },
  { name:"Super U", words:["super u","hyper u","systeme u","système u","u express"] },
  { name:"Avia", words:["avia"] },
  { name:"BP", words:["bp "] },
  { name:"Esso", words:["esso"] },
  { name:"Shell", words:["shell"] }
];

const clean = (v) => String(v ?? "").replace(/[<>"']/g, "").trim();
const normalize = (v) => clean(v).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const escapeWhere = (v) => clean(v).replace(/\\/g,"\\\\").replace(/"/g,'\\"');

function htmlDecode(v){
  return String(v || "")
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&apos;/g,"'").replace(/&nbsp;/g," ")
    .replace(/&eacute;/g,"é").replace(/&Eacute;/g,"É")
    .replace(/&agrave;/g,"à").replace(/&ccedil;/g,"ç");
}

function stripHtml(v){
  return htmlDecode(String(v || "")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ")).trim();
}

function detectBrand(text){
  const hay = normalize(text).replace(/\s+/g," ");
  for(const rule of BRAND_RULES){
    if(rule.words.some(w => hay.includes(normalize(w)))) return rule.name;
  }
  return "";
}

function extractStationName(html){
  const candidates = [];
  const patterns = [
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i,
    /"name"\s*:\s*"([^"]+)"/i
  ];
  for(const p of patterns){
    const m = html.match(p);
    if(m?.[1]) candidates.push(stripHtml(m[1]));
  }
  const brand = detectBrand(stripHtml(html));
  if(brand) candidates.push(brand);

  for(let name of candidates){
    name = clean(name)
      .replace(/Prix des carburants/gi,"")
      .replace(/prix-carburants\.gouv\.fr/gi,"")
      .replace(/Station-service/gi,"")
      .replace(/\s+/g," ")
      .replace(/^[-|–]+|[-|–]+$/g,"")
      .trim();
    if(name.length >= 3 && !/^\d+$/.test(name)) return name;
  }
  return "";
}

async function officialName(id){
  if(!id) return "";
  try{
    const response = await fetch(`${STATION_PAGE}${encodeURIComponent(id)}`, {
      headers:{ "User-Agent":"Carburio/1.0 (+https://carburio.com)", "Accept":"text/html" }
    });
    if(!response.ok) return "";
    return extractStationName(await response.text());
  }catch{
    return "";
  }
}

function coordToDecimal(v){
  if(v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(",",".").trim());
  if(!Number.isFinite(n)) return null;
  return Math.abs(n) > 1000 ? n / 100000 : n;
}

function getCoords(row){
  const lat = coordToDecimal(row.latitude);
  const lon = coordToDecimal(row.longitude);
  return lat !== null && lon !== null ? {lat, lon} : null;
}

function haversineKm(a,b){
  if(!a || !b) return null;
  const R=6371, dLat=(b.lat-a.lat)*Math.PI/180, dLon=(b.lon-a.lon)*Math.PI/180;
  const lat1=a.lat*Math.PI/180, lat2=b.lat*Math.PI/180;
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}

function formatDistance(km){
  if(km === null || !Number.isFinite(km)) return "";
  return km < 1 ? `${Math.round(km*1000)} m` : `${km.toFixed(1).replace(".",",")} km`;
}

function formatDate(v){
  if(!v) return "";
  const d = new Date(v);
  if(Number.isNaN(d.getTime())) return clean(v);
  return `${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}`;
}

function isParis(q){
  const v = clean(q);
  return normalize(v) === "paris" || /^750(0[1-9]|1[0-9]|20)$/.test(v);
}

function isTergnier(q){
  const v = clean(q);
  return normalize(v).includes("tergnier") || v === "02700";
}

function buildWhere(q){
  const v = clean(q);
  if(normalize(v) === "paris") return PARIS_CP.map(cp => `cp="${cp}"`).join(" or ");
  if(/^\d{5}$/.test(v)) return `cp="${v}"`;
  return `lower(ville)=lower("${escapeWhere(v)}")`;
}

async function reversePostcode(lat,lon){
  try{
    const params = new URLSearchParams({format:"jsonv2", lat:String(lat), lon:String(lon), zoom:"18", addressdetails:"1"});
    const r = await fetch(`${NOMINATIM_REVERSE}?${params.toString()}`, {headers:{"User-Agent":"Carburio/1.0 (+https://carburio.com)"}});
    if(!r.ok) return "";
    const data = await r.json();
    return clean(data.address?.postcode || "");
  }catch{return "";}
}

async function fuelRows(q){
  const params = new URLSearchParams({lang:"fr", timezone:"Europe/Paris", limit:"100", where:buildWhere(q)});
  const r = await fetch(`${FUEL_API}?${params.toString()}`, {headers:{"Accept":"application/json"}});
  if(!r.ok) throw new Error("API carburant " + r.status);
  const data = await r.json();
  return data.results || [];
}

async function allRows(queries){
  const all = [];
  for(const q of queries){
    try{ all.push(...await fuelRows(q)); }catch(e){ console.warn("query failed", q, e); }
  }
  return all;
}

function fallbackName(row){
  const text = [row.adresse,row.ville,row.services_service,row.horaires_jour].flat().join(" ");
  const brand = detectBrand(text);
  if(brand) return brand;
  if(row.adresse) return `Station-service – ${clean(row.adresse)}`;
  if(row.ville) return `Station-service – ${clean(row.ville)}`;
  return "Station-service";
}

async function toStation(row, fuel, origin){
  const f = FUEL_FIELDS[fuel] || FUEL_FIELDS.e10;
  const price = Number(String(row[f.price] ?? "").replace(",","."));
  if(!Number.isFinite(price) || price <= 0) return null;
  const coords = getCoords(row);
  const distance = origin ? haversineKm(origin, coords) : null;
  const offName = row.id ? await officialName(row.id) : "";
  const name = offName || fallbackName(row);
  return {
    id: clean(row.id),
    name,
    nameSource: offName ? "Nom officiel" : "Nom déduit",
    address: clean(row.adresse),
    cp: clean(row.cp),
    city: clean(row.ville),
    price,
    updateDateText: formatDate(row[f.update]),
    distanceKm: distance,
    distanceText: formatDistance(distance)
  };
}

function fallbackTergnier(origin){
  const center = origin || {lat:49.6566, lon:3.2870};
  return TERGNIER_FALLBACK.map(s => {
    const d = haversineKm(center, {lat:s.lat, lon:s.lon});
    return { name:s.name, nameSource:"Nom intégré", address:s.address, cp:s.cp, city:s.city, price:null, updateDateText:"", distanceKm:d, distanceText:formatDistance(d) };
  }).sort((a,b)=>(a.distanceKm||999)-(b.distanceKm||999));
}

async function apiCarburants(request){
  const url = new URL(request.url);
  let q = clean(url.searchParams.get("q"));
  const fuel = normalize(url.searchParams.get("fuel") || "e10").replace("prix_","");
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const headers = {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"public, max-age=120"};

  if(!FUEL_FIELDS[fuel]) return new Response(JSON.stringify({error:"Carburant non reconnu", results:[]}), {status:400, headers});

  let origin = null;
  if(Number.isFinite(lat) && Number.isFinite(lon)){
    origin = {lat, lon};
    if(!q) q = await reversePostcode(lat, lon);
  }
  if(!q) return new Response(JSON.stringify({error:"Ville, code postal ou position manquante", results:[]}), {status:400, headers});

  const queries = isTergnier(q) ? TERGNIER_QUERIES : [q];

  try{
    const rows = await allRows(queries);
    const seen = new Set();
    const filtered = rows.filter(row => {
      const id = clean(row.id || `${row.adresse}-${row.cp}-${row.ville}`);
      if(seen.has(id)) return false;
      seen.add(id);
      if(isParis(q) && !PARIS_CP.includes(clean(row.cp))) return false;
      return true;
    });

    let results = (await Promise.all(filtered.map(row => toStation(row, fuel, origin))))
      .filter(Boolean)
      .sort((a,b) => {
        if(origin && a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
        if((a.price || 999) !== (b.price || 999)) return (a.price || 999) - (b.price || 999);
        return 0;
      })
      .slice(0,12);

    let message = "";
    if(!results.length && isTergnier(q)){
      results = fallbackTergnier(origin);
      message = "Stations proches de Tergnier affichées, prix à vérifier.";
    }else if(origin){
      message = `${results.length} station(s) trouvée(s), triées par distance depuis ta position.`;
    }else if(isParis(q)){
      message = `${results.length} station(s) trouvée(s) dans Paris uniquement.`;
    }else{
      message = `${results.length} station(s) trouvée(s), triées par prix.`;
    }
    return new Response(JSON.stringify({meta:{q,fuel,message}, results}), {status:200, headers});
  }catch(e){
    return new Response(JSON.stringify({error:"Impossible de récupérer les stations", detail:String(e.message||e), results:[]}), {status:502, headers});
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if(url.pathname === "/api/carburants") return apiCarburants(request);
    return env.ASSETS.fetch(request);
  }
};
