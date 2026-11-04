"use strict";
/* ====== RENDER ====== */
const app=document.getElementById("app");
let session=null; // {label, quick, groups} — lo envía el servidor tras validar el código

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
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

function renderLogin(){
  app.innerHTML=`
  <div class="login">
    <div class="tape"></div>
    <div class="login-body">
      <div class="brand">★ JUANCHO'S BBQ · PASIÓN A LA PARRILLA</div>
      <h1 class="display">Procedimientos<br>de equipo</h1>
      <p class="sub">Introduce el código de tu puesto para ver tus procedimientos.</p>
      <input class="code-input" id="code" placeholder="CÓDIGO" autocomplete="off" aria-label="Código de acceso">
      <div class="err" id="err" style="display:none"></div>
      <button class="enter-btn" id="go">Entrar</button>
      <div class="hint">Acceso restringido al equipo. Si no tienes código o ha dejado de funcionar, pídeselo a tu responsable.</div>
    </div>
    <div class="tape"></div>
  </div>`;
  const input=document.getElementById("code");
  const err=document.getElementById("err");
  const btn=document.getElementById("go");
  const showErr=m=>{err.textContent=m;err.style.display="block";};
  let busy=false;
  const go=async()=>{
    const code=input.value.trim();
    if(!code||busy)return;
    busy=true;btn.disabled=true;
    try{
      const r=await api("/api/login",{code});
      if(r.status===200){input.value="";await loadSession();return;}
      if(r.status===429)showErr("Demasiados intentos. Espera unos minutos y vuelve a probar.");
      else showErr("Código no válido. Revisa con tu responsable.");
    }catch(e){showErr("No se pudo conectar. Revisa la conexión e inténtalo de nuevo.");}
    busy=false;btn.disabled=false;
  };
  document.getElementById("go").onclick=go;
  input.addEventListener("keydown",e=>{if(e.key==="Enter")go();});
  input.addEventListener("input",()=>document.getElementById("err").style.display="none");
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
  html+=`<div class="note">Prototipo v0.7 · Fichas de las 12 hamburguesas con ingredientes y alérgenos oficiales (jun 2026) · huecos de foto/vídeo pendientes de material · Identidad Brand Kit 2025. Los huecos «Foto / Vídeo pendiente» marcan dónde irá el material audiovisual.</div></div>`;
  app.innerHTML=html;
  document.getElementById("out").onclick=logout;
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

loadSession();
