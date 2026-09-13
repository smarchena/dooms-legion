"use strict";

/* ============================================================
   PROYECTO OMEGA — demo de trayectoria / cuenta regresiva
   Simulación puramente visual. Nada real.
   ============================================================ */

const canvas = document.getElementById( "map" );
const ctx = canvas.getContext( "2d" );

// ---- Ciudades (lat, lon) ----
const CITIES = {
  "NUEVA YORK": { lat: 40.71, lon: -74.0 },
  "LONDRES": { lat: 51.51, lon: -0.13 },
  "TOKIO": { lat: 35.68, lon: 139.69 },
  "MOSCÚ": { lat: 55.75, lon: 37.62 },
  "SÍDNEY": { lat: -33.87, lon: 151.21 },
  "CIUDAD MÉXICO": { lat: 19.43, lon: -99.13 },
  "DUBÁI": { lat: 25.2, lon: 55.27 },
  "SÃO PAULO": { lat: -23.55, lon: -46.63 },
};

// Base de lanzamiento del villano (isla secreta a mitad del Atlántico, claro)
const ORIGIN = { lat: 35.68, lon: 139.69 };
const ORIGIN2 = { lat: 35.68, lon: -139.69 };

// ---- Constantes ajustables ----
const MISSILE_DURATION_BASE_MS = 10000;   // tiempo mínimo de vuelo
const MISSILE_DURATION_PER_KM_MS = 1.2;   // ms extra por km de distancia
const EARTH_RADIUS_KM = 6371;
const SPEED_OF_SOUND_KMS = 340;           // para el indicador Mach
const MAX_DEVICE_PIXEL_RATIO = 2;
const STAR_COUNT = 90;
const LAND_DOT_STEP = 7;
const LAND_DOT_SIZE = 2;
const TRAJECTORY_ARC_LIFT = 0.35;         // altura del arco de la trayectoria
const TRAJECTORY_DASH = [ 5, 6 ];
const TRAJECTORY_SEGMENTS = 60;           // densidad de muestreo de la curva
const MAX_ALTITUDE_KM = 1200;
const MARKER_RADIUS = 4;
const MISSILE_EXHAUST_LENGTH = 26;
const MISSILE_BODY_LENGTH = 6;
const IMPACT_RING_COUNT = 5;
const IMPACT_RING_DELAY_MS = 120;
const IMPACT_RING_DURATION_MS = 900;
const IMPACT_RING_BASE_RADIUS = 6;
const IMPACT_RING_EXPAND = 60;

// ---- Interceptor (SUPERMAN) ----
const HERO_TRIGGER_MS = 5000;        // aparece cuando faltan 5 s para el impacto
const HERO_SPEED_PX_S = 260;         // velocidad de vuelo en px/s
const HERO_HIT_RADIUS = 10;          // distancia a la que destruye el misil
const HERO_SPAWN_OFFSET = 320;       // a qué distancia del objetivo entra en escena
const HERO_TRAIL_LENGTH = 18;
const HERO_RADIUS = 5;
const HERO_COLOR = "#4aa3ff";
const HERO_CAPE_COLOR = "rgba(255,59,78,0.85)";
const HERO_EXIT_MS = 1400;           // tiempo que sigue volando tras interceptar

// ---- Cháchara del villano durante el vuelo ----
const CHATTER_MIN_MS = 1800;
const CHATTER_MAX_MS = 3600;
const CHATTER_LINES = [
  "Esperemos que no venga nadie a destruirlo.",
  "Este es un plan malvado que va a tener éxito.",
  "Nada puede detenernos ahora. Nada.",
  "Ningún héroe sabe de esta base. Imposible.",
  "Trayectoria nominal. Todo sale según lo planeado.",
  "Muajaja. Digo... telemetría estable.",
  "Recordad: sin testigos no hay problema.",
  "¿Alguien ha revisado el radar? Da igual, seguro que está vacío.",
  "Esta vez no habrá ningún tipo con capa.",
  "El comité malvado estará muy orgulloso.",
  "Si algo sale mal, la culpa es de becarios.",
  "Sistemas al 100%. Maldad al 110%.",
];

// ---- Manchas de continente (aprox.) en espacio lat/lon ----
// [latCentro, lonCentro, radioLat, radioLon]
const LAND = [
  [ 58, -100, 20, 38 ],  // América del Norte norte
  [ 30, -95, 18, 20 ],   // América del Norte sur
  [ 12, -75, 14, 12 ],   // América Central / Caribe
  [ -10, -60, 25, 20 ],  // América del Sur
  [ -30, -62, 12, 10 ],
  [ 54, 30, 20, 55 ],    // Europa + Rusia oeste
  [ 62, 90, 22, 55 ],    // Siberia
  [ 12, 15, 24, 22 ],    // África norte
  [ -18, 25, 20, 18 ],   // África sur
  [ 28, 78, 16, 22 ],    // India / Asia sur
  [ 40, 110, 18, 28 ],   // China / Asia este
  [ -25, 133, 14, 22 ],  // Australia
  [ 72, -40, 12, 22 ],   // Groenlandia
];

// proyección equirectangular -> coordenadas del canvas
function project( lat, lon, w, h ) {
  const x = ( ( lon + 180 ) / 360 ) * w;
  const y = ( ( 90 - lat ) / 180 ) * h;
  return { x, y };
}

function isLand( lat, lon ) {
  for ( const [ clat, clon, rlat, rlon ] of LAND ) {
    const dLat = ( lat - clat ) / rlat;
    let dLon = ( lon - clon );
    if ( dLon > 180 ) dLon -= 360;
    if ( dLon < -180 ) dLon += 360;
    dLon /= rlon;
    if ( dLat * dLat + dLon * dLon <= 1 ) return true;
  }
  return false;
}

// ---- Estado ----
let W = 0, H = 0, DPR = 1;
let target = null;          // {name, lat, lon}
let launch = null;          // {t0, duration, dist}
let stars = [];
let hero = null;            // {x, y, trail, state, t}
let lastFrame = 0;          // timestamp del frame anterior (para dt)
let chatterNext = 0;        // timestamp del próximo comentario
let chatterPool = [];       // baraja de frases sin repetir

function resize() {
  DPR = Math.min( window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO );
  const r = canvas.getBoundingClientRect();
  W = r.width; H = r.height;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  ctx.setTransform( DPR, 0, 0, DPR, 0, 0 );
  // campo de estrellas sobre el océano
  stars = [];
  for ( let i = 0; i < STAR_COUNT; i++ ) {
    stars.push( { x: Math.random() * W, y: Math.random() * H, a: Math.random() } );
  }
}
window.addEventListener( "resize", resize );

// distancia haversine (km)
function distanceKm( a, b ) {
  const dLat = ( b.lat - a.lat ) * Math.PI / 180;
  const dLon = ( b.lon - a.lon ) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180;
  const x = Math.sin( dLat / 2 ) ** 2 + Math.cos( la1 ) * Math.cos( la2 ) * Math.sin( dLon / 2 ) ** 2;
  return Math.round( 2 * EARTH_RADIUS_KM * Math.asin( Math.sqrt( x ) ) );
}

// ---- Dibujar mundo en matriz de puntos ----
function drawMap() {
  ctx.clearRect( 0, 0, W, H );

  // brillo del océano
  const g = ctx.createRadialGradient( W * 0.6, H * 0.2, 60, W * 0.6, H * 0.2, W );
  g.addColorStop( 0, "rgba(13,40,70,0.5)" );
  g.addColorStop( 1, "rgba(3,7,13,0)" );
  ctx.fillStyle = g;
  ctx.fillRect( 0, 0, W, H );

  // estrellas / ruido
  for ( const s of stars ) {
    s.a += ( Math.random() - 0.5 ) * 0.05;
    s.a = Math.max( 0.1, Math.min( 1, s.a ) );
    ctx.fillStyle = `rgba(120,180,220,${ s.a * 0.25 })`;
    ctx.fillRect( s.x, s.y, 1, 1 );
  }

  // puntos de tierra
  for ( let py = 0; py < H; py += LAND_DOT_STEP ) {
    for ( let px = 0; px < W; px += LAND_DOT_STEP ) {
      const lon = ( px / W ) * 360 - 180;
      const lat = 90 - ( py / H ) * 180;
      if ( isLand( lat, lon ) ) {
        ctx.fillStyle = "rgba(56,225,255,0.55)";
        ctx.fillRect( px, py, LAND_DOT_SIZE, LAND_DOT_SIZE );
      }
    }
  }
}

// ---- Dibujar trayectoria + misil ----
function drawTrajectory( now ) {
  if ( !target ) return;

  const a = project( ORIGIN.lat, ORIGIN.lon, W, H );
  const b = project( target.lat, target.lon, W, H );

  // punto de control: elevar el arco entre ambos extremos
  const mx = ( a.x + b.x ) / 2;
  const my = ( a.y + b.y ) / 2 - Math.hypot( b.x - a.x, b.y - a.y ) * TRAJECTORY_ARC_LIFT;

  // marcador de origen
  marker( a.x, a.y, "#2bff88", "BASE" );

  // ruta completa discontinua
  ctx.setLineDash( TRAJECTORY_DASH );
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,181,71,0.35)";
  ctx.beginPath();
  ctx.moveTo( a.x, a.y );
  ctx.quadraticCurveTo( mx, my, b.x, b.y );
  ctx.stroke();
  ctx.setLineDash( [] );

  // marcador de objetivo
  marker( b.x, b.y, "#ff3b4e", null );

  if ( !launch ) return;

  const p = Math.min( 1, ( now - launch.t0 ) / launch.duration );

  // tramo recorrido (sólido y brillante)
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255,59,78,0.9)";
  ctx.shadowColor = "#ff3b4e";
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo( a.x, a.y );
  const segs = Math.max( 2, Math.floor( TRAJECTORY_SEGMENTS * p ) );
  for ( let i = 1; i <= segs; i++ ) {
    const t = ( i / segs ) * p;
    const pt = bezier( a, { x: mx, y: my }, b, t );
    ctx.lineTo( pt.x, pt.y );
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // cabeza del misil
  const head = bezier( a, { x: mx, y: my }, b, p );
  const ang = bezierAngle( a, { x: mx, y: my }, b, p );
  drawMissile( head.x, head.y, ang );

  // altitud según el arco (0 en extremos, máximo al centro)
  const altitude = Math.round( Math.sin( p * Math.PI ) * MAX_ALTITUDE_KM );

  updateTelemetry( p, altitude );

  // ¿toca avisar a la caballería?
  const remaining = launch.duration * ( 1 - p );
  if ( launch.active && !hero && remaining <= HERO_TRIGGER_MS ) spawnHero( b );

  if ( p >= 1 && launch.active ) impact( b );

  // guardar la posición de la cabeza para que el héroe la persiga
  if ( launch ) launch.head = head;
}

function bezier( p0, p1, p2, t ) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}
function bezierAngle( p0, p1, p2, t ) {
  const u = 1 - t;
  const dx = 2 * u * ( p1.x - p0.x ) + 2 * t * ( p2.x - p1.x );
  const dy = 2 * u * ( p1.y - p0.y ) + 2 * t * ( p2.y - p1.y );
  return Math.atan2( dy, dx );
}

function marker( x, y, color, label ) {
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc( x, y, MARKER_RADIUS, 0, Math.PI * 2 );
  ctx.fill();
  ctx.shadowBlur = 0;
  if ( label ) {
    ctx.fillStyle = color;
    ctx.font = "10px monospace";
    ctx.fillText( label, x + 8, y + 3 );
  }
}

function drawMissile( x, y, ang ) {
  ctx.save();
  ctx.translate( x, y );
  ctx.rotate( ang );
  // estela de escape
  const exhaust = MISSILE_EXHAUST_LENGTH;
  const grd = ctx.createLinearGradient( -exhaust, 0, 0, 0 );
  grd.addColorStop( 0, "rgba(255,181,71,0)" );
  grd.addColorStop( 1, "rgba(255,181,71,0.9)" );
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo( -exhaust, -3 );
  ctx.lineTo( 0, 0 );
  ctx.lineTo( -exhaust, 3 );
  ctx.closePath();
  ctx.fill();
  // cuerpo
  const body = MISSILE_BODY_LENGTH;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "#ff3b4e";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo( body, 0 );
  ctx.lineTo( -4, -3 );
  ctx.lineTo( -4, 3 );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---- Cháchara ----
function scheduleChatter( now ) {
  chatterNext = now + CHATTER_MIN_MS + Math.random() * ( CHATTER_MAX_MS - CHATTER_MIN_MS );
}

function nextChatterLine() {
  if ( chatterPool.length === 0 ) {
    chatterPool = CHATTER_LINES.slice();
    // barajar para que no salgan siempre en el mismo orden
    for ( let i = chatterPool.length - 1; i > 0; i-- ) {
      const j = Math.floor( Math.random() * ( i + 1 ) );
      [ chatterPool[ i ], chatterPool[ j ] ] = [ chatterPool[ j ], chatterPool[ i ] ];
    }
  }
  return chatterPool.pop();
}

function updateChatter( now ) {
  // solo mientras el misil vuela y todavía no ha aparecido el héroe
  if ( !launch || !launch.active || hero ) return;
  if ( now < chatterNext ) return;
  logLine( nextChatterLine() );
  scheduleChatter( now );
}

// ---- Interceptor ----
function spawnHero( b ) {
  // entra en escena por encima y a un lado del objetivo
  const side = b.x > W / 2 ? 1 : -1;
  hero = {
    x: b.x + side * HERO_SPAWN_OFFSET,
    y: b.y - HERO_SPAWN_OFFSET * 0.7,
    trail: [],
    state: "chase",
    exitDir: { x: side, y: -0.7 },
    tHit: 0,
  };
  setStatus( "CONTACTO NO IDENTIFICADO", "warn" );
  logLine( ">> ANOMALÍA: objeto volador aproximándose a gran velocidad", "warn" );
  logLine( ">> ¡ES SUPERMAN!", "warn" );
}

function updateHero( now, dt ) {
  if ( !hero ) return;

  const step = HERO_SPEED_PX_S * dt;

  if ( hero.state === "chase" ) {
    const t = launch && launch.head;
    if ( !t ) { hero = null; return; }
    const dx = t.x - hero.x;
    const dy = t.y - hero.y;
    const d = Math.hypot( dx, dy );
    if ( d <= HERO_HIT_RADIUS || d <= step ) {
      hero.x = t.x; hero.y = t.y;
      intercept( t );
    } else {
      hero.x += ( dx / d ) * step;
      hero.y += ( dy / d ) * step;
    }
  } else {
    // sale de escena tras el impacto
    hero.x += hero.exitDir.x * step;
    hero.y += hero.exitDir.y * step;
    if ( now - hero.tHit > HERO_EXIT_MS ) { hero = null; return; }
  }

  hero.trail.push( { x: hero.x, y: hero.y } );
  if ( hero.trail.length > HERO_TRAIL_LENGTH ) hero.trail.shift();
}

function intercept( at ) {
  hero.state = "exit";
  hero.tHit = performance.now();
  // rebotar hacia arriba en dirección contraria a la de entrada
  hero.exitDir = { x: -hero.exitDir.x, y: -1 };

  launch = null;
  setStatus( "MISIL DESTRUIDO", "abort" );
  el( "clock" ).textContent = "00:00:00";
  el( "cdFill" ).style.width = "0%";
  el( "progress" ).textContent = "—";
  el( "speed" ).textContent = "— Mach";
  el( "altitude" ).textContent = "— km";
  logLine( ">> OJIVA INTERCEPTADA EN VUELO", "warn" );
  logLine( ">> MISIL DESTRUIDO. CERO VÍCTIMAS.", "ok" );

  for ( let i = 0; i < IMPACT_RING_COUNT; i++ ) {
    impactRings.push( {
      t0: performance.now() + i * IMPACT_RING_DELAY_MS,
      x: at.x, y: at.y, color: "74,163,255",
    } );
  }

  el( "launchBtn" ).disabled = false;
  el( "launchBtn" ).textContent = "▶ REINICIAR";
  el( "abortBtn" ).disabled = true;
}

function drawHero() {
  if ( !hero ) return;

  // estela azul
  for ( let i = 0; i < hero.trail.length; i++ ) {
    const a = ( i + 1 ) / hero.trail.length;
    const pt = hero.trail[ i ];
    ctx.fillStyle = `rgba(74,163,255,${ a * 0.5 })`;
    ctx.beginPath();
    ctx.arc( pt.x, pt.y, HERO_RADIUS * a * 0.8, 0, Math.PI * 2 );
    ctx.fill();
  }

  // capa: un trazo rojo detrás del punto
  if ( hero.trail.length > 1 ) {
    const prev = hero.trail[ Math.max( 0, hero.trail.length - 5 ) ];
    ctx.strokeStyle = HERO_CAPE_COLOR;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo( prev.x, prev.y );
    ctx.lineTo( hero.x, hero.y );
    ctx.stroke();
  }

  // el héroe
  ctx.fillStyle = HERO_COLOR;
  ctx.shadowColor = HERO_COLOR;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc( hero.x, hero.y, HERO_RADIUS, 0, Math.PI * 2 );
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = HERO_COLOR;
  ctx.font = "bold 11px monospace";
  ctx.fillText( "S", hero.x + 9, hero.y + 4 );
}

// ---- Impacto ----
let impactRings = [];
function impact( b ) {
  launch.active = false;
  setStatus( "IMPACTO CONFIRMADO", "done" );
  logLine( `>> IMPACTO EN ${ target.name.toUpperCase() }`, "err" );
  logLine( ">> OBJETIVO NEUTRALIZADO", "err" );
  for ( let i = 0; i < IMPACT_RING_COUNT; i++ ) {
    impactRings.push( { t0: performance.now() + i * IMPACT_RING_DELAY_MS, x: b.x, y: b.y } );
  }
  document.getElementById( "launchBtn" ).disabled = false;
  document.getElementById( "launchBtn" ).textContent = "▶ REINICIAR";
  document.getElementById( "abortBtn" ).disabled = true;
}

function drawImpact( now ) {
  impactRings = impactRings.filter( r => now - r.t0 < IMPACT_RING_DURATION_MS );
  for ( const r of impactRings ) {
    if ( now < r.t0 ) continue;
    const p = ( now - r.t0 ) / IMPACT_RING_DURATION_MS;
    ctx.strokeStyle = `rgba(${ r.color || "255,59,78" },${ 1 - p })`;
    ctx.lineWidth = 3 * ( 1 - p );
    ctx.beginPath();
    ctx.arc( r.x, r.y, IMPACT_RING_BASE_RADIUS + p * IMPACT_RING_EXPAND, 0, Math.PI * 2 );
    ctx.stroke();
  }
}

// ---- Telemetría / UI de cuenta regresiva ----
const el = ( id ) => document.getElementById( id );

function updateTelemetry( p, altitude ) {
  const remain = launch.duration * ( 1 - p );
  el( "clock" ).textContent = fmtTime( remain );
  el( "cdFill" ).style.width = ( p * 100 ).toFixed( 1 ) + "%";
  el( "progress" ).textContent = Math.round( p * 100 ) + "%";
  el( "altitude" ).textContent = altitude + " km";
  const speed = ( launch.dist / ( launch.duration / 1000 ) / SPEED_OF_SOUND_KMS ).toFixed( 1 );
  el( "speed" ).textContent = "Mach " + speed;

  // lat/lon en vivo de la cabeza del misil
  const cur = interpLatLon( ORIGIN, target, p );
  el( "lat" ).textContent = cur.lat.toFixed( 2 );
  el( "lon" ).textContent = cur.lon.toFixed( 2 );
}

function interpLatLon( a, b, t ) {
  return { lat: a.lat + ( b.lat - a.lat ) * t, lon: a.lon + ( b.lon - a.lon ) * t };
}

function fmtTime( ms ) {
  const s = Math.max( 0, Math.ceil( ms / 1000 ) );
  const hh = String( Math.floor( s / 3600 ) ).padStart( 2, "0" );
  const mm = String( Math.floor( ( s % 3600 ) / 60 ) ).padStart( 2, "0" );
  const ss = String( s % 60 ).padStart( 2, "0" );
  return `${ hh }:${ mm }:${ ss }`;
}

function setStatus( text, cls ) {
  el( "statusText" ).textContent = text;
  const s = document.querySelector( ".status" );
  s.className = "status " + ( cls || "" );
}

function logLine( msg, cls ) {
  const box = el( "log" );
  const line = document.createElement( "div" );
  if ( cls ) line.className = cls;
  const time = new Date().toLocaleTimeString( "es", { hour12: false } );
  line.textContent = `[${ time }] ${ msg }`;
  box.appendChild( line );
  box.scrollTop = box.scrollHeight;
}

// ---- Selección de objetivo ----
function selectTarget( name ) {
  target = { name, ...CITIES[ name ] };
  el( "destName" ).textContent = name;
  el( "targetLabel" ).textContent = name;
  const d = distanceKm( ORIGIN, target );
  el( "distance" ).textContent = d.toLocaleString( "es" ) + " km";

  // colocar la mira sobre la ciudad
  const b = project( target.lat, target.lon, W, H );
  const ch = el( "crosshair" );
  ch.style.left = b.x + "px";
  ch.style.top = b.y + "px";
  ch.classList.add( "show" );

  document.querySelectorAll( ".tg-buttons button" ).forEach( btn =>
    btn.classList.toggle( "active", btn.dataset.name === name ) );

  logLine( `Objetivo fijado: ${ name } (${ d.toLocaleString( "es" ) } km)`, "warn" );
}

// ---- Lanzamiento / abortar ----
function startLaunch() {
  if ( !target ) { logLine( "ERROR: sin objetivo seleccionado", "err" ); return; }
  impactRings = [];
  hero = null;
  const dist = distanceKm( ORIGIN, target );
  const duration = MISSILE_DURATION_BASE_MS + dist * MISSILE_DURATION_PER_KM_MS;
  launch = { t0: performance.now(), duration, dist, active: true };
  setStatus( "MISIL EN VUELO", "live" );
  el( "launchBtn" ).disabled = true;
  el( "abortBtn" ).disabled = false;
  logLine( `>> LANZAMIENTO INICIADO -> ${ target.name }`, "err" );
  logLine( `>> Tiempo de vuelo estimado: ${ fmtTime( duration ) }` );
  scheduleChatter( performance.now() );
}

function abort() {
  if ( !launch ) return;
  launch = null;
  hero = null;
  setStatus( "LANZAMIENTO ABORTADO", "abort" );
  el( "clock" ).textContent = "00:00:00";
  el( "cdFill" ).style.width = "0%";
  el( "progress" ).textContent = "0%";
  el( "launchBtn" ).disabled = false;
  el( "abortBtn" ).disabled = true;
  logLine( ">> SECUENCIA ABORTADA POR OPERADOR", "warn" );
}

// ---- Bucle principal ----
function frame( now ) {
  const dt = lastFrame ? Math.min( ( now - lastFrame ) / 1000, 0.05 ) : 0;
  lastFrame = now;

  drawMap();
  drawTrajectory( now );
  updateChatter( now );
  updateHero( now, dt );
  drawHero();
  drawImpact( now );
  el( "clockNow" ).textContent = new Date().toLocaleTimeString( "es", { hour12: false } );
  requestAnimationFrame( frame );
}

// ---- Inicialización ----
function init() {
  resize();
  el( "origin" ).textContent = "BASE VULCANO";

  const box = el( "targetButtons" );
  Object.keys( CITIES ).forEach( name => {
    const btn = document.createElement( "button" );
    btn.textContent = name;
    btn.dataset.name = name;
    btn.onclick = () => selectTarget( name );
    box.appendChild( btn );
  } );

  el( "launchBtn" ).onclick = startLaunch;
  el( "abortBtn" ).onclick = abort;

  logLine( "Sistema OMEGA en línea." );
  logLine( "Esperando selección de objetivo...", "warn" );

  selectTarget( "NUEVA YORK" );
  requestAnimationFrame( frame );
}

init();
