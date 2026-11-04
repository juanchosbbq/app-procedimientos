"use strict";
/* ====== RENDER ====== */
const app=document.getElementById("app");
let session=null; // {label, quick, groups, email, name, admin} — lo envía el servidor tras iniciar sesión

async function api(path,body){
  const r=await fetch(path,{method:body?"POST":"GET",credentials:"same-origin",
    headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined});
  let data=null;try{data=await r.json();}catch(e){}
  return {status:r.status,data};
}
async function loadSession(){
  const r=await api("/api/content");
  if(r.status===200){session=r.data;renderHome();}
  else{session=null;renderLogin();}
  window.scrollTo(0,0);
}
async function logout(){
  try{await api("/api/logout",{});}catch(e){}
  session=null;renderLogin();window.scrollTo(0,0);
}
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const $=id=>document.getElementById(id);
const NET_ERR="No se pudo conectar. Revisa la conexión e inténtalo de nuevo.";
const TOO_MANY="Demasiados intentos. Espera unos minutos y vuelve a probar.";

function loginShell(inner){
  return `<div class="login"><div class="tape"></div><div class="login-body">
      <div class="brand">★ JUANCHO'S BBQ · PASIÓN A LA PARRILLA</div>
      <h1 class="display">Procedimientos<br>de equipo</h1>${inner}</div><div class="tape"></div></div>`;
}
// Ejecuta fn evitando dobles envíos y mostrando errores en #err.
function guard(btn,fn){
  let busy=false;
  return async()=>{
    if(busy)return;busy=true;btn.disabled=true;$("err").style.display="none";
    try{await fn();}catch(e){showErr(NET_ERR);}
    busy=false;btn.disabled=false;
  };
}
function showErr(m){const e=$("err");e.textContent=m;e.style.display="block";}
const onEnter=(ids,fn)=>ids.forEach(id=>$(id).addEventListener("keydown",e=>{if(e.key==="Enter")fn();}));

function renderLogin(){
  app.innerHTML=loginShell(`
      <p class="sub">Entra con tu correo y tu contraseña.</p>
      <input class="code-input is-email" id="email" type="email" placeholder="tu@correo.com" autocomplete="username" inputmode="email" aria-label="Correo electrónico">
      <input class="code-input is-email mt" id="pass" type="password" placeholder="Contraseña" autocomplete="current-password" aria-label="Contraseña">
      <div class="err" id="err" style="display:none"></div>
      <button class="enter-btn" id="go">Entrar</button>
      <div class="hint">Acceso restringido al equipo. Si no tienes cuenta o has olvidado tu contraseña, pide a tu responsable un enlace nuevo.</div>`);
  const go=guard($("go"),async()=>{
    const email=$("email").value.trim(),password=$("pass").value;
    if(!email||!password)return;
    const r=await api("/api/login",{email,password});
    if(r.status===200){await loadSession();return;}
    showErr(r.status===429?TOO_MANY:"Correo o contraseña incorrectos.");
  });
  $("go").onclick=go;onEnter(["email","pass"],go);
  $("email").focus();
}

// Pantalla a la que llega el enlace de invitación / cambio de contraseña.
async function renderLink(token){
  let info;
  try{info=await api("/api/link/info",{token});}catch(e){info={status:0};}
  if(info.status!==200){
    app.innerHTML=loginShell(`<p class="sub">Este enlace no es válido o ha caducado. Pide a tu responsable uno nuevo.</p>
      <button class="enter-btn" id="go">Ir a entrar</button>`);
    $("go").onclick=()=>renderLogin();return;
  }
  const d=info.data,invite=d.type==="invite";
  app.innerHTML=loginShell(`
      <p class="sub">${invite?`¡Hola${d.name?", "+esc(d.name):""}! Crea tu contraseña para entrar.`:"Elige tu nueva contraseña."}</p>
      <input class="code-input is-email" type="email" value="${esc(d.email)}" autocomplete="username" readonly aria-label="Correo">
      <input class="code-input is-email mt" id="p1" type="password" placeholder="Nueva contraseña (mín. ${d.minLength})" autocomplete="new-password" aria-label="Nueva contraseña">
      <input class="code-input is-email mt" id="p2" type="password" placeholder="Repítela" autocomplete="new-password" aria-label="Repite la contraseña">
      <div class="err" id="err" style="display:none"></div>
      <button class="enter-btn" id="go">${invite?"Crear contraseña y entrar":"Guardar y entrar"}</button>`);
  const go=guard($("go"),async()=>{
    const a=$("p1").value,b=$("p2").value;
    if(a.length<d.minLength)return showErr(`La contraseña debe tener al menos ${d.minLength} caracteres.`);
    if(a!==b)return showErr("Las dos contraseñas no coinciden.");
    const r=await api("/api/link/accept",{token,password:a});
    if(r.status===200){await loadSession();return;}
    showErr(r.status===429?TOO_MANY:(r.data&&r.data.message)||"Este enlace no es válido o ha caducado.");
  });
  $("go").onclick=go;onEnter(["p1","p2"],go);
  $("p1").focus();
}

/* ====== MI CONTRASEÑA ====== */
function renderMyPassword(){
  const min=session.admin?12:8;
  app.innerHTML=header("Inicio")+`<div class="wrap">
    <h1 class="d-title display">Mi contraseña</h1><p class="d-sum">${esc(session.email)}</p>
    <div class="form">
      <label>Contraseña actual<input id="cur" type="password" autocomplete="current-password"></label>
      <label>Nueva contraseña (mín. ${min})<input id="p1" type="password" autocomplete="new-password"></label>
      <label>Repite la nueva<input id="p2" type="password" autocomplete="new-password"></label>
      <div class="err" id="err" style="display:none"></div><div class="okmsg" id="okm" style="display:none"></div>
      <button class="enter-btn" id="go">Cambiar contraseña</button>
    </div></div>`;
  $("back").onclick=()=>{renderHome();window.scrollTo(0,0);};
  $("go").onclick=guard($("go"),async()=>{
    $("okm").style.display="none";
    const a=$("p1").value;
    if(a.length<min)return showErr(`La nueva contraseña debe tener al menos ${min} caracteres.`);
    if(a!==$("p2").value)return showErr("Las dos contraseñas nuevas no coinciden.");
    const r=await api("/api/me/password",{current:$("cur").value,password:a});
    if(r.status===200){["cur","p1","p2"].forEach(i=>$(i).value="");$("okm").textContent="Contraseña cambiada. Se han cerrado tus sesiones en otros dispositivos.";$("okm").style.display="block";}
    else showErr(r.status===429?TOO_MANY:(r.data&&r.data.message)||"No se pudo cambiar.");
  });
}

/* ====== ADMINISTRACIÓN DE USUARIOS ====== */
let adminData=null; // {users, profiles, mail, me}
const fmtDate=t=>t?new Date(t).toLocaleString("es-ES",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"nunca";
const profileLabel=k=>(adminData.profiles.find(p=>p.key===k)||{label:k}).label;
const profileOptions=sel=>adminData.profiles.map(p=>`<option value="${esc(p.key)}"${p.key===sel?" selected":""}>${esc(p.label)}</option>`).join("");
function status(u){
  if(u.active)return `<span class="st on">Activo</span>`;
  return `<span class="st pend">${u.pendingLink?"Invitación pendiente":"Sin contraseña"}</span>`;
}
async function adminLoad(){
  const r=await api("/api/admin/users",{});
  if(r.status===401){await loadSession();return false;}
  if(r.status!==200){app.innerHTML=header("Inicio")+`<div class="wrap"><p class="d-sum">No tienes permiso para ver esto.</p></div>`;$("back").onclick=()=>renderHome();return false;}
  adminData=r.data;return true;
}
// Caja con el enlace para copiar o compartir.
function linkBox(res){
  const what=res.type==="invite"?"Enlace de invitación":"Enlace para cambiar la contraseña";
  const days=res.type==="invite"?"7 días":"48 horas";
  const wa="https://wa.me/?text="+encodeURIComponent(`Tu acceso a Procedimientos de equipo de Juancho's BBQ: ${res.url}`);
  return `<div class="linkbox"><div class="lb-h">${what}</div>
    ${res.mailed?`<div class="okmsg">Enviado por correo a ${esc(res.user.email)}.</div>`:""}
    ${res.mailError?`<div class="err">${esc(res.mailError)}</div>`:""}
    <div class="lb-url" id="lburl">${esc(res.url)}</div>
    <div class="row"><button class="sbtn" id="copy">Copiar enlace</button><a class="sbtn" href="${esc(wa)}" target="_blank" rel="noopener">Enviar por WhatsApp</a></div>
    <div class="small">Caduca en ${days} y solo sirve una vez. Quien lo tenga puede entrar como esta persona: envíaselo solo a ella.</div></div>`;
}
function wireCopy(url){
  const b=$("copy");if(!b)return;
  b.onclick=async()=>{try{await navigator.clipboard.writeText(url);b.textContent="¡Copiado!";}catch(e){const r=document.createRange();r.selectNodeContents($("lburl"));const s=getSelection();s.removeAllRanges();s.addRange(r);b.textContent="Selecciona y copia";}};
}

async function renderAdmin(){
  if(!(await adminLoad()))return;
  const users=adminData.users;
  let html=header("Inicio")+`<div class="wrap">
    <h1 class="d-title display">Usuarios</h1><p class="d-sum">${users.length} persona${users.length===1?"":"s"} con acceso</p>
    <div class="sec"><div class="sec-h"><span class="t display">Añadir persona</span></div>
    <div class="form">
      <label>Correo<input id="nemail" type="email" autocomplete="off" placeholder="nombre@correo.com"></label>
      <label>Nombre (opcional)<input id="nname" type="text" autocomplete="off"></label>
      <label>Categoría<select id="nprof">${profileOptions("cocina")}</select></label>
      ${adminData.mail?`<label class="chk"><input id="nmail" type="checkbox" checked> Enviar la invitación por correo</label>`:`<div class="small">El envío por correo no está configurado: te daremos un enlace para que se lo mandes tú.</div>`}
      <div class="err" id="err" style="display:none"></div>
      <button class="enter-btn" id="add">Dar de alta e invitar</button>
      <div id="addres"></div>
    </div></div>
    <div class="sec"><div class="sec-h"><span class="t display">Equipo</span></div>`;
  for(const p of adminData.profiles){
    const list=users.filter(u=>u.profile===p.key);
    if(!list.length)continue;
    html+=`<div class="ugroup">${esc(p.label)}</div>`;
    list.forEach(u=>{
      html+=`<button class="card" data-u="${esc(u.email)}"><span><div class="tt">${esc(u.name||u.email)}</div>
        <div class="ss">${u.name?esc(u.email)+" · ":""}${status(u)} · último acceso: ${fmtDate(u.lastLogin)}</div></span><span class="ar">→</span></button>`;
    });
  }
  html+=`</div></div>`;
  app.innerHTML=html;
  $("back").onclick=()=>{renderHome();window.scrollTo(0,0);};
  app.querySelectorAll(".card[data-u]").forEach(c=>c.onclick=()=>{renderUser(c.dataset.u);window.scrollTo(0,0);});
  $("add").onclick=guard($("add"),async()=>{
    const email=$("nemail").value.trim();
    if(!email)return showErr("Escribe el correo.");
    const r=await api("/api/admin/create",{email,name:$("nname").value,profile:$("nprof").value,sendMail:!!($("nmail")&&$("nmail").checked)});
    if(r.status!==200)return showErr((r.data&&r.data.message)||"No se pudo dar de alta.");
    await adminLoad();
    $("nemail").value="";$("nname").value="";
    $("addres").innerHTML=`<div class="okmsg">${esc(email)} dado de alta como ${esc(profileLabel(r.data.user.profile))}.</div>`+linkBox(r.data)+
      `<button class="link-btn" id="reload">Ver lista actualizada</button>`;
    wireCopy(r.data.url);
    $("reload").onclick=()=>renderAdmin();
  });
}

async function renderUser(email,notice){
  if(!adminData&&!(await adminLoad()))return;
  const u=adminData.users.find(x=>x.email===email);
  if(!u)return renderAdmin();
  const self=email===adminData.me;
  app.innerHTML=header("Usuarios")+`<div class="wrap">
    <h1 class="d-title display">${esc(u.name||u.email)}</h1>
    <p class="d-sum">${esc(u.email)} · ${status(u)} · último acceso: ${fmtDate(u.lastLogin)}</p>
    <div id="notice">${notice||""}</div>
    <div class="form">
      <label>Nombre<input id="uname" type="text" value="${esc(u.name)}"></label>
      <label>Categoría<select id="uprof"${u.protected?" disabled":""}>${profileOptions(u.profile)}</select></label>
      ${u.protected?`<div class="small">Administrador principal: no se puede cambiar de categoría ni eliminar.</div>`:""}
      <button class="enter-btn" id="save">Guardar cambios</button>
    </div>
    <div class="sec"><div class="sec-h"><span class="t display">Contraseña</span></div><div class="form">
      <button class="sbtn wide" id="link">${u.active?"Generar enlace para que cambie su contraseña":"Generar nuevo enlace de invitación"}</button>
      ${adminData.mail?`<label class="chk"><input id="lmail" type="checkbox" checked> Enviarlo también por correo</label>`:""}
      <div id="linkres"></div>
      <details class="det"><summary>O ponerle una contraseña yo mismo</summary>
        <label>Nueva contraseña (mín. ${u.profile==="admin"?12:8})<input id="upass" type="text" autocomplete="off"></label>
        <button class="sbtn wide" id="setpass">Cambiar contraseña</button>
        <div class="small">Tendrás que decírsela tú. Puede cambiarla después desde «Mi contraseña».</div>
      </details>
    </div></div>
    <div class="sec"><div class="sec-h"><span class="t display">Acceso</span></div><div class="form">
      <button class="sbtn wide" id="kick">Cerrar sus sesiones abiertas</button>
      ${u.protected||self?"":`<button class="sbtn wide danger" id="del">Eliminar acceso</button>`}
    </div></div>
    <div class="err" id="err" style="display:none"></div>
  </div>`;
  $("back").onclick=()=>{renderAdmin();window.scrollTo(0,0);};
  const done=async(msg)=>{await adminLoad();renderUser(email,`<div class="okmsg">${esc(msg)}</div>`);window.scrollTo(0,0);};
  const errOf=(r,def)=>showErr((r.data&&r.data.message)||def);
  $("save").onclick=guard($("save"),async()=>{
    const profile=$("uprof").value;
    if(profile!==u.profile&&!confirm(`¿Cambiar a ${u.email} a «${profileLabel(profile)}»? Se cerrarán sus sesiones abiertas.`))return;
    const r=await api("/api/admin/update",{email,name:$("uname").value,profile:u.protected?undefined:profile});
    if(r.status!==200)return errOf(r,"No se pudo guardar.");
    if(r.data.passwordReset){
      await adminLoad();
      renderUser(email,`<div class="okmsg">Ahora es administrador. Los administradores necesitan una contraseña más larga, así que tendrá que crear una nueva con este enlace:</div>`+linkBox(r.data));
      wireCopy(r.data.url);return;
    }
    done("Cambios guardados.");
  });
  $("link").onclick=guard($("link"),async()=>{
    const r=await api("/api/admin/link",{email,sendMail:!!($("lmail")&&$("lmail").checked)});
    if(r.status!==200)return errOf(r,"No se pudo generar el enlace.");
    $("linkres").innerHTML=linkBox(r.data);wireCopy(r.data.url);
  });
  $("setpass").onclick=guard($("setpass"),async()=>{
    const r=await api("/api/admin/password",{email,password:$("upass").value});
    if(r.status!==200)return errOf(r,"No se pudo cambiar la contraseña.");
    done("Contraseña cambiada. Se han cerrado sus sesiones abiertas.");
  });
  $("kick").onclick=guard($("kick"),async()=>{
    const r=await api("/api/admin/logout",{email});
    if(r.status!==200)return errOf(r,"No se pudo.");
    if(self){await loadSession();return;}
    done("Sesiones cerradas: tendrá que volver a entrar.");
  });
  if($("del"))$("del").onclick=guard($("del"),async()=>{
    if(!confirm(`¿Eliminar el acceso de ${u.email}? Se le echará al momento.`))return;
    const r=await api("/api/admin/delete",{email});
    if(r.status!==200)return errOf(r,"No se pudo eliminar.");
    renderAdmin();window.scrollTo(0,0);
  });
}

function header(backLabel){
  return `<div class="hdr"><div class="hdr-in">
    ${backLabel?`<button class="back" id="back">← ${esc(backLabel)}</button>`:`<span class="t display"><span class="star">★</span> Juancho's</span>`}
    <span class="sp"></span>
    <span class="chip">${esc(session.label)}</span>
    ${backLabel?"":`<button class="out" id="out">Salir</button>`}
  </div></div>`;
}

function renderHome(){
  const groups=session.groups;
  const qd=session.quick;
  let html=header(null)+`<div class="wrap">`;
  if(session.admin){
    html+=`<div class="sec"><div class="sec-h"><span class="t display">Administración</span></div>
      <button class="card" id="adm"><span class="n">★</span><span><div class="tt">Usuarios</div><div class="ss">Altas, invitaciones, categorías, contraseñas y bajas</div></span><span class="ar">→</span></button></div>`;
  }
  if(qd){
    html+=`<div class="qb"><div class="qb-h display"><span class="star">★</span> Datos críticos</div><div class="qb-grid">`+
      qd.map(q=>`<div class="qb-cell"><div class="qb-v mono">${esc(q.v)}</div><div class="qb-k">${esc(q.k)}</div></div>`).join("")+
      `</div></div>`;
  }
  groups.forEach(g=>{
    html+=`<div class="sec"><div class="sec-h"><span class="t display">${esc(g.groupLabel)}</span>${g.draft?`<span class="draft-tag">Borrador</span>`:""}</div>`;
    if(g.menu){
      html+=`<button class="card" data-menu="${g.group}"><span class="n">★</span><span><div class="tt">Listado completo</div><div class="ss">${esc(g.summary)}</div></span><span class="ar">→</span></button></div>`;
      return;
    }
    g.items.forEach((it,i)=>{
      html+=`<button class="card" data-g="${g.group}" data-i="${it.id}">
        <span class="n">${String(i+1).padStart(2,"0")}</span>
        <span><div class="tt">${esc(it.title)}</div><div class="ss">${esc(it.summary)}</div></span>
        <span class="ar">→</span></button>`;
    });
    html+=`</div>`;
  });
  html+=`<div class="me">Has entrado como <b>${esc(session.email)}</b> · <button class="link-inline" id="mypass">Cambiar mi contraseña</button></div>`;
  html+=`<div class="note">Prototipo v0.7 · Fichas de hamburguesas con ingredientes y alérgenos oficiales (jun 2026) · huecos de foto/vídeo pendientes de material · Identidad Brand Kit 2025. Los huecos «Foto / Vídeo pendiente» marcan dónde irá el material audiovisual.</div></div>`;
  app.innerHTML=html;
  document.getElementById("out").onclick=logout;
  $("mypass").onclick=()=>{renderMyPassword();window.scrollTo(0,0);};
  if($("adm"))$("adm").onclick=()=>{renderAdmin();window.scrollTo(0,0);};
  app.querySelectorAll(".card[data-i]").forEach(c=>{
    c.onclick=()=>{
      const g=session.groups.find(x=>x.group===c.dataset.g);
      const it=g.items.find(x=>x.id===c.dataset.i);
      renderDetail(g,it);window.scrollTo(0,0);
    };
  });
  app.querySelectorAll(".card[data-menu]").forEach(c=>{
    c.onclick=()=>{renderGroupMenu(session.groups.find(x=>x.group===c.dataset.menu));window.scrollTo(0,0);};
  });
}

function renderGroupMenu(g){
  let html=header("Inicio")+`<div class="wrap"><h1 class="d-title display">${esc(g.groupLabel)}</h1><p class="d-sum">${esc(g.summary)}</p>`;
  g.items.forEach((it,i)=>{
    html+=`<button class="card" data-i="${it.id}"><span class="n">${String(i+1).padStart(2,"0")}</span><span><div class="tt">${esc(it.title)}</div><div class="ss">${esc(it.summary)}</div></span><span class="ar">→</span></button>`;
  });
  html+=`</div>`;
  app.innerHTML=html;
  document.getElementById("back").onclick=()=>{renderHome();window.scrollTo(0,0);};
  app.querySelectorAll(".card").forEach(c=>{
    c.onclick=()=>{const it=g.items.find(x=>x.id===c.dataset.i);renderDetail(g,it,()=>renderGroupMenu(g));window.scrollTo(0,0);};
  });
}

function blockHtml(b){
  switch(b.t){
    case "p":return `<p class="blk-p">${esc(b.x)}</p>`;
    case "h":return `<div class="blk-h">${esc(b.x)}</div>`;
    case "warn":return `<div class="blk-warn"><div class="bar"></div><div class="tx">${esc(b.x)}</div></div>`;
    case "ban":return `<div class="blk-ban">${esc(b.x)}</div>`;
    case "steps":return `<ol class="blk-steps">${b.x.map(s=>`<li><span>${esc(s)}</span></li>`).join("")}</ol>`;
    case "list":return `<ul class="blk-list">${b.x.map(s=>`<li>${esc(s)}</li>`).join("")}</ul>`;
    case "split":return `<div class="split">
      <div class="col"><div class="ch">${esc(b.a.h)}</div><ul>${b.a.x.map(s=>`<li>${esc(s)}</li>`).join("")}</ul></div>
      <div class="col"><div class="ch">${esc(b.b.h)}</div><ul>${b.b.x.map(s=>`<li>${esc(s)}</li>`).join("")}</ul></div></div>`;
    case "media":
      if(b.img){
        return `<div class="media-img"><img src="/${esc(b.img)}" alt="${esc(b.label)}" loading="lazy"><div class="cap">${b.kind==="video"?"▶ Vídeo":"📷 Foto"} — ${esc(b.label)}</div></div>`;
      }
      return `<div class="media"><div class="mk">${b.kind==="video"?"▶ Vídeo":"📷 Foto"} — pendiente</div><div class="ml">${esc(b.label)}</div></div>`;
    case "grid":return `<div class="grid-err">${b.x.map(g=>`<div class="gcard"><div class="e">${esc(g.e)}</div><div class="c">${esc(g.c)}</div><div class="s"><b>→</b> ${esc(g.s)}</div></div>`).join("")}</div>`;
    case "check":return `<div class="ck" data-ck><div class="ck-h"><span class="t">${esc(b.title)}</span><span class="pr">0/${b.x.length}</span></div>`+
      b.x.map(it=>`<button class="ck-item"><span class="ck-box"></span><span class="lx">${esc(it)}</span></button>`).join("")+`</div>`;
    default:return "";
  }
}

function renderDetail(g,it,onBack){
  let html=header(g.groupLabel)+`<div class="wrap">
    <h1 class="d-title display">${esc(it.title)}</h1>
    <p class="d-sum">${esc(it.summary)}</p>`+
    it.blocks.map(blockHtml).join("")+`</div>`;
  app.innerHTML=html;
  document.getElementById("back").onclick=()=>{(onBack||renderHome)();window.scrollTo(0,0);};
  app.querySelectorAll("[data-ck]").forEach(ck=>{
    const items=ck.querySelectorAll(".ck-item");
    const pr=ck.querySelector(".pr");
    items.forEach(item=>{
      item.onclick=()=>{
        item.classList.toggle("on");
        item.querySelector(".ck-box").textContent=item.classList.contains("on")?"✓":"";
        const done=ck.querySelectorAll(".ck-item.on").length;
        pr.textContent=done+"/"+items.length;
        pr.classList.toggle("done",done===items.length);
      };
    });
  });
}

// Arranque: si se llega desde un enlace de invitación (#t=...), se quita de la barra y se procesa.
(function boot(){
  const m=location.hash.match(/^#t=([A-Za-z0-9_-]{20,})$/);
  if(m){history.replaceState(null,"",location.pathname);renderLink(m[1]);}
  else loadSession();
})();
