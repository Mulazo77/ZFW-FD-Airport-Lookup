const records=window.AIRPORT_DATA.records||{};
const areaColors={JEN:"#1E4E6B",UKW:"#5A3D72",BYP:"#8A7A1F",RDR:"#3A1E22",DAL:"#8A4F2A",CQY:"#2F5E3A",...(window.AIRPORT_DATA.area_colors||{})};
const AMBER="#ffd166",WHITE="#ffffff",MUTED="#6b7c89";
const MAP_MIN_LAT=29.0,MAP_MAX_LAT=37.4,MAP_MIN_LON=-104.0,MAP_MAX_LON=-91.3;
const ZFW_VISUAL_OUTLINE=[[0.305,0.150],[0.450,0.150],[0.495,0.125],[0.520,0.205],[0.575,0.205],[0.615,0.175],[0.655,0.150],[0.690,0.170],[0.735,0.220],[0.735,0.300],[0.750,0.360],[0.735,0.420],[0.765,0.470],[0.810,0.500],[0.850,0.505],[0.875,0.540],[0.885,0.585],[0.925,0.645],[0.960,0.700],[0.980,0.780],[0.950,0.835],[0.875,0.855],[0.850,0.930],[0.735,0.955],[0.715,0.990],[0.620,0.970],[0.555,0.995],[0.515,0.965],[0.440,0.970],[0.405,0.930],[0.320,0.900],[0.260,0.855],[0.205,0.820],[0.145,0.740],[0.105,0.705],[0.085,0.655],[0.085,0.560],[0.105,0.505],[0.115,0.445],[0.150,0.395],[0.205,0.355],[0.255,0.355],[0.285,0.300],[0.305,0.230],[0.305,0.150]];
const ZFW_IMAGE_POLYGON = [[0.018,0.488],[0.033,0.488],[0.043,0.446],[0.071,0.394],[0.103,0.35],[0.139,0.311],[0.18,0.286],[0.222,0.281],[0.311,0.3],[0.34,0.258],[0.371,0.2],[0.371,0.148],[0.48,0.15],[0.535,0.136],[0.555,0.19],[0.59,0.2],[0.646,0.178],[0.684,0.134],[0.719,0.112],[0.773,0.165],[0.774,0.23],[0.792,0.294],[0.83,0.333],[0.893,0.383],[0.928,0.412],[0.95,0.452],[0.983,0.483],[0.984,0.526],[0.934,0.528],[0.875,0.588],[0.845,0.658],[0.759,0.67],[0.67,0.672],[0.615,0.691],[0.572,0.69],[0.548,0.708],[0.534,0.687],[0.451,0.687],[0.384,0.722],[0.259,0.672],[0.153,0.63],[0.064,0.585],[0.025,0.538]];
const ZFW_MAP_IMAGE_SRC = "zfw_outline_exact.png";
let zfwMapImage = new Image();
zfwMapImage.src = ZFW_MAP_IMAGE_SRC;
zfwMapImage.onload = () => drawMap();
let clearTimer=null,currentMarker=null;
const input=document.getElementById("airportInput"),statusEl=document.getElementById("status");
const els={sector:document.getElementById("sector"),area:document.getElementById("area"),approach:document.getElementById("approach"),vscs:document.getElementById("vscs"),contact:document.getElementById("contact"),hours:document.getElementById("hours"),airportName:document.getElementById("airportName")};
const cards={sector:document.getElementById("sectorCard"),area:document.getElementById("areaCard"),approach:document.getElementById("approachCard"),vscs:document.getElementById("vscsCard"),contact:document.getElementById("contactCard"),hours:document.getElementById("hoursCard"),airportName:document.getElementById("airportNameCard")};
function normalizeSearch(v){const s=(v||"").trim().toUpperCase();return(s.length===3&&/^[A-Z]+$/.test(s))?"K"+s:s}
function isCompleteLookupInput(v){const s=String(v||"").trim().toUpperCase();return /^[A-Z0-9]{3}$/.test(s)||/^K[A-Z0-9]{3}$/.test(s)||/^[A-Z0-9]{5}$/.test(s)}
function splitLines(items){return(!items||!items.length)?"":items.filter(Boolean).join("\n")}
function formatSectorNameFirstToNumberFirst(value){const text=String(value||"").trim();const match=text.match(/^([A-Z]{2,4})\s+(\d{2})$/);return match?`${match[2]} ${match[1]}`:text}
function splitSectorLines(items){return(!items||!items.length)?"":items.filter(Boolean).map(formatSectorNameFirstToNumberFirst).join("\n")}
function parseHours(hours){const h=(hours||"").trim().toUpperCase();const times=[...h.matchAll(/(\d{4})-(\d{4})/g)].map(m=>[m[1],m[2]]);if(!times.length)return[];let d="ALL";if(h.includes("M-F"))d="M-F";else if(h.includes("SU")&&h.indexOf("SU")<h.indexOf(times[0][0]))d="SU";const w=[[d,times[0][0],times[0][1]]];if(times.length>1)w.push([h.includes("SU")?"SU":"ALL",times[1][0],times[1][1]]);return w}
function militaryToMinutes(t){const h=Number(t.slice(0,2)),m=Number(t.slice(2));return h===24?1440:h*60+m}
function dayAllowed(d,n){const x=n.getDay();if(d==="ALL")return true;if(d==="M-F")return x>=1&&x<=5;if(d==="SU")return x===0;return true}
function isOpen(hours){const w=parseHours(hours);if(!w.length)return false;const n=new Date(),cur=n.getHours()*60+n.getMinutes();return w.some(([d,s,e])=>{if(!dayAllowed(d,n))return false;const sm=militaryToMinutes(s),em=militaryToMinutes(e);return em>=sm?(cur>=sm&&cur<=em):(cur>=sm||cur<=em)})}
function setText(id,v){els[id].textContent=v||"—"}
function clearClasses(){Object.values(cards).forEach(c=>{c.classList.remove("primary");c.style.background="";c.style.borderColor="";c.style.boxShadow=""});Object.values(els).forEach(e=>{e.classList.remove("red-text","green-text","amber-text","cyan-text");e.style.color=""})}
function highlightFdcsCard(id,color){const card=cards[id],el=els[id];if(!card||!el)return;if(color==="red"){card.style.borderColor="var(--red)";card.style.boxShadow="0 0 0 3px rgba(255,75,75,.28),0 0 18px rgba(255,75,75,.24)";el.classList.add("red-text");return}card.style.borderColor="var(--green)";card.style.boxShadow="0 0 0 3px rgba(65,209,125,.32),0 0 18px rgba(65,209,125,.30)";el.classList.add("green-text")}

function appKey(appName){
  return String(appName||"").toUpperCase().replace(/\s+APP\b/,"").split(/\s+/)[0].replace(/[^A-Z0-9]/g,"");
}
function contactSegments(contacts){
  return (contacts||[]).flatMap(c=>String(c||"").split(/\s+\/\s+/)).map(s=>s.trim()).filter(Boolean);
}
function findAppHour(appName,hours,index){
  const key=appKey(appName);
  const list=hours||[];
  if(key){
    const hit=list.find(h=>String(h||"").toUpperCase().includes(key));
    if(hit)return hit;
  }
  return list[index]||list[0]||"";
}
function findAppContactSegment(appName,contacts,index){
  const key=appKey(appName);
  const segments=contactSegments(contacts);
  if(key){
    const hit=segments.find(s=>String(s||"").toUpperCase().includes(key));
    if(hit)return hit;
  }
  return segments[index]||contacts[index]||contacts[0]||"";
}
function extractVscsFromContact(text){
  const match=String(text||"").match(/VSCS\s*:?\s*([0-9]{3}\s*\([0-9]{2}\))/i);
  return match?match[1].trim():"";
}
function extractPhoneFromContact(text){
  const str=String(text||"");
  const tel=str.match(/(?:TEL|PHONE|CD\s*PHONE)\s*:?\s*((?:\(\d{3}\)\s*)?\d{3}[-\s]?\d{4})/i);
  if(tel)return tel[1].trim();
  const phone=str.match(/(\(\d{3}\)\s*\d{3}[-\s]?\d{4})/);
  return phone?phone[1].trim():"";
}
function buildApproachDetails(apps,vscs,contacts,hours){
  let anyOpen=false;
  let anyClosed=false;
  const openLines=[];
  const closedLines=[];
  const openVscs=[];
  const openPhones=[];
  (apps||[]).forEach((appName,index)=>{
    const hour=findAppHour(appName,hours,index);
    const open=isOpen(hour||"");
    const contact=findAppContactSegment(appName,contacts,index);
    const vscsValue=extractVscsFromContact(contact)||vscs[index]||"";
    const phoneValue=extractPhoneFromContact(contact)||extractPhoneFromContact(contacts[index]||"");

    if(open){
      anyOpen=true;
      openLines.push([appName,vscsValue?`VSCS: ${vscsValue}`:"",phoneValue?`CD Phone: ${phoneValue}`:""].filter(Boolean).join("\n"));
      if(vscsValue)openVscs.push(vscsValue);
      if(phoneValue)openPhones.push(phoneValue);
    }else{
      anyClosed=true;
      closedLines.push(`${appName} CLOSED`);
    }
  });

  const approachValue=openLines.concat(closedLines).filter(Boolean).join("\n");

  return {
    appIsOpen:anyOpen,
    anyClosed:anyClosed,
    approachValue:approachValue,
    vscsValue:anyOpen?openVscs.join("\n"):"CLOSED",
    contactValue:anyOpen?openPhones.join("\n"):"CLOSED"
  };
}

function updateZuluClock(){document.getElementById("zuluClock").textContent=new Date().toISOString().slice(11,19)+"Z"}
function scheduleClear(){if(clearTimer)clearTimeout(clearTimer);clearTimer=setTimeout(()=>{input.value="";input.focus()},1000)}
function updateResults(){
  const raw=input.value,upper=raw.toUpperCase();
  if(raw!==upper)input.value=upper;

  const typed=upper.trim();

  // Do not accept or process one- or two-character entries.
  if(!typed)return;
  if(typed.length<3){
    statusEl.textContent="Ready";
    statusEl.style.color="";
    return;
  }

  if(!isCompleteLookupInput(typed)){
    return;
  }

  const query=normalizeSearch(upper);
  if(!query)return;

  const rec=records[query];

  if(!rec){
    if(window.applyAdjacentAirportLookup && window.applyAdjacentAirportLookup(upper)){
      scheduleClear();
      return;
    }

    statusEl.textContent=`${upper} not found`;
    statusEl.style.color="var(--red)";
    return;
  }

  if(window.clearAdjacentAirportDisplayState){
    window.clearAdjacentAirportDisplayState();
  }

  clearClasses();

  const sectors=rec.sectors||[],areas=rec.areas||[],apps=rec.apps||[],vscs=rec.vscs||[],contacts=rec.contacts||[],hours=rec.hours||[];
  const appDetails=apps.length?buildApproachDetails(apps,vscs,contacts,hours):{appIsOpen:false,approachValue:"",vscsValue:"",contactValue:""};
  const appIsOpen=appDetails.appIsOpen;

  let sectorValue=splitSectorLines(sectors);
  if(appIsOpen&&sectorValue)sectorValue+="\nAPP OPEN";

  let approachValue="";
  let vscsValue="";
  let contactValue="";

  if(apps.length){
    approachValue=appDetails.approachValue || "CLOSED";
    vscsValue=appDetails.vscsValue;
    contactValue=appDetails.contactValue;
  }

  setText("sector",sectorValue);
  setText("area",splitLines(areas));
  setText("approach",approachValue);
  setText("vscs",vscsValue);
  setText("contact",contactValue);
  setText("hours",splitLines(hours));
  setText("airportName",rec.airport_name||"Name not found");

  els.airportName.classList.add("cyan-text");

  // AREA color association intentionally removed to reduce visual clutter.

  if(apps.length&&appIsOpen){
    highlightFdcsCard("approach","green");
    statusEl.textContent=`${upper} found`;
    statusEl.style.color="var(--green)";
  }else{
    if(apps.length){
      highlightFdcsCard("approach","red");
      statusEl.textContent=`${upper} found`;
      statusEl.style.color="var(--red)";
    }else{
      if(sectors.length)highlightFdcsCard("sector","green");
      statusEl.textContent=`${upper} found`;
      statusEl.style.color="var(--green)";
    }
  }

  currentMarker={ident:query,lat:rec.lat,lon:rec.lon};
  drawMap();
  scheduleClear()
}
function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / ((yj - yi) || 0.000001) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function clampPointInsidePolygon(x, y, polygon) {
  if (pointInPolygon([x, y], polygon)) return [x, y];

  // Move the point toward the center until it is inside the ZFW outline.
  const center = polygon.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0])
    .map(v => v / polygon.length);

  let nx = x;
  let ny = y;
  for (let step = 0; step <= 100; step++) {
    const t = step / 100;
    nx = x + (center[0] - x) * t;
    ny = y + (center[1] - y) * t;
    if (pointInPolygon([nx, ny], polygon)) return [nx, ny];
  }
  return center;
}

function drawMap() {
  const canvas = document.getElementById("zfwMap");
  const ctx = canvas.getContext("2d");

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  ctx.fillStyle = "#0f1720";
  ctx.fillRect(0, 0, w, h);

  const padX = 14;
  const padY = 12;
  const mapW = w - padX * 2;
  const mapH = h - padY * 2;

  if (zfwMapImage && zfwMapImage.complete) {
    ctx.save();
    ctx.shadowColor = "rgba(127, 179, 230, 0.55)";
    ctx.shadowBlur = 10;
    ctx.drawImage(zfwMapImage, padX, padY, mapW, mapH);
    ctx.restore();
  } else {
    ctx.strokeStyle = "#7fb3e6";
    ctx.strokeRect(padX, padY, mapW, mapH);
  }

  if (currentMarker && currentMarker.lat != null && currentMarker.lon != null) {
    let xNorm = (currentMarker.lon - MAP_MIN_LON) / (MAP_MAX_LON - MAP_MIN_LON);
    let yNorm = (MAP_MAX_LAT - currentMarker.lat) / (MAP_MAX_LAT - MAP_MIN_LAT);

    xNorm = Math.max(0, Math.min(1, xNorm));
    yNorm = Math.max(0, Math.min(1, yNorm));

    [xNorm, yNorm] = clampPointInsidePolygon(xNorm, yNorm, ZFW_IMAGE_POLYGON);

    const x = padX + xNorm * mapW;
    const y = padY + yNorm * mapH;

    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = AMBER;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = WHITE;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = WHITE;
    ctx.fill();

    ctx.fillStyle = AMBER;
    ctx.font = "bold 13px Consolas";
    ctx.fillText(currentMarker.ident, x + 15, y - 11);
  } else {
    ctx.fillStyle = MUTED;
    ctx.font = "bold 13px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("NO AIRPORT SELECTED", w / 2, h / 2);
    ctx.textAlign = "start";
  }
}

input.addEventListener("input",updateResults);input.addEventListener("keydown",e=>{if(e.key==="Enter"){updateResults();input.select();e.preventDefault()}});window.addEventListener("resize",drawMap);setInterval(updateZuluClock,1000);updateZuluClock();statusEl.textContent=`${Object.keys(records).length} AIRPORTS LOADED`;drawMap();input.focus();
