const CATS = { trabalho: "Trabalho", estudo: "Estudo", saude: "Saúde", lazer: "Lazer" };
const START = 6, END = 23, PX = 60; // linha do tempo mostra das 06:00 às 23:00
 
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const mins = (t) => { const [h, m] = t.split(":"); return +h * 60 + +m; };
const tp = (m) => (m - START * 60) / 60 * PX;
 
const hoje = new Date();
const HOJE = iso(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
let view = { y: hoje.getFullYear(), m: hoje.getMonth() }; // mês exibido
let sel = HOJE;      // dia selecionado
let tasks = [];      // tarefas do mês exibido
let lists = [];      // checklists e contadores
let hidden = {};     // categorias escondidas pelo filtro
 
// Cria elementos sem usar innerHTML (mais seguro)
function h(tag, props = {}, kids = []) {
  const e = document.createElement(tag);
  for (const k in props) {
    if (k === "class") e.className = props[k];
    else if (k === "text") e.textContent = props[k];
    else if (k.startsWith("on")) e[k] = props[k];
    else e.setAttribute(k, props[k]);
  }
  kids.forEach((c) => e.appendChild(c));
  return e;
}
 
// ---------- "Banco de dados" no navegador (localStorage) ----------
// Os dados ficam salvos neste navegador, sem precisar de servidor.
const CHAVE = "agenda-rosa-dados";
const DADOS_INICIAIS = {
  tasks: [],
  lists: [
    { id: "l1", kind: "check", title: "Tarefas a fazer", items: [{ id: "i1", t: "Responder e-mails", d: false }, { id: "i2", t: "Pagar contas", d: false }] },
    { id: "l2", kind: "water", title: "Beber água", goal: 8, n: 0 },
  ],
};
function carregar() {
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE));
    if (d && d.tasks && d.lists) return d;
  } catch (e) { /* começa do zero */ }
  return JSON.parse(JSON.stringify(DADOS_INICIAIS));
}
function gravar(d) { try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch (e) { alert("Não foi possível salvar neste navegador."); } }
function erro(msg) { alert(msg); throw new Error(msg); }
 
// Lista as datas da tarefa, do dia escolhido até o fim do mês
function datasDaRepeticao(inicio, repeticao) {
  if (repeticao === "none") return [inicio];
  const [y, m, d] = inicio.split("-").map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  const passo = repeticao === "weekly" ? 7 : 1;
  const datas = [];
  for (let dia = d; dia <= ultimo; dia += passo) {
    const sem = new Date(y, m - 1, dia).getDay(); // 0 = domingo ... 6 = sábado
    if (repeticao !== "weekdays" || (sem > 0 && sem < 6)) datas.push(iso(y, m - 1, dia));
  }
  return datas;
}
 
// Mantém o mesmo formato de chamadas "/api/..." usado no resto do código
async function api(url, method = "GET", body = {}) {
  const dados = carregar();
  const [rota, qs] = url.split("?");
  const params = new URLSearchParams(qs || "");
 
  if (rota === "/api/tasks" && method === "GET")
    return dados.tasks.filter((t) => t.date.startsWith(params.get("month")));
 
  if (rota === "/api/tasks" && method === "POST") {
    const nome = String(body.name || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) erro("Data inválida.");
    if (!nome) erro("Digite o nome da tarefa.");
    if (!body.start || !body.end || body.end <= body.start) erro("O horário de fim precisa ser depois do início.");
    const serie = body.repeat !== "none" ? novoId() : null;
    const novas = datasDaRepeticao(body.date, body.repeat).map((data) => ({
      id: novoId(), series: serie, date: data, name: nome,
      start: body.start, end: body.end, cat: body.cat, done: false,
    }));
    dados.tasks.push(...novas);
    gravar(dados);
    return novas;
  }
 
  const m = rota.match(/^\/api\/tasks\/(.+)$/);
  if (m && method === "PATCH") {
    const t = dados.tasks.find((q) => q.id === m[1]);
    if (!t) erro("Tarefa não encontrada.");
    Object.assign(t, body);
    gravar(dados);
    return t;
  }
  if (m && method === "DELETE") {
    const alvo = dados.tasks.find((q) => q.id === m[1]);
    if (!alvo) erro("Tarefa não encontrada.");
    const serie = params.get("series") === "1" && alvo.series;
    dados.tasks = dados.tasks.filter((q) => (serie ? q.series !== alvo.series : q.id !== alvo.id));
    gravar(dados);
    return { ok: true };
  }
 
  if (rota === "/api/lists" && method === "GET") return dados.lists;
  if (rota === "/api/lists" && method === "PUT") { dados.lists = body; gravar(dados); return { ok: true }; }
  erro("Rota desconhecida: " + rota);
}
 
async function carregarMes() {
  tasks = await api(`/api/tasks?month=${view.y}-${pad(view.m + 1)}`);
  renderMes();
  renderDia();
}
 
// ---------- Calendário do mês ----------
function renderMes() {
  const nomeMes = new Date(view.y, view.m, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  $("monthTitle").textContent = nomeMes;
 
  const grade = $("month");
  grade.innerHTML = "";
  const primeiro = new Date(view.y, view.m, 1);
  const vazios = (primeiro.getDay() + 6) % 7; // semana começa na segunda
  const total = new Date(view.y, view.m + 1, 0).getDate();
 
  for (let i = 0; i < vazios; i++) grade.appendChild(h("div", { class: "cell empty" }));
 
  for (let d = 1; d <= total; d++) {
    const data = iso(view.y, view.m, d);
    const doDia = tasks.filter((t) => t.date === data);
    const dots = h("div", { class: "dots" });
    doDia.slice(0, 6).forEach((t) =>
      dots.appendChild(h("i", { class: t.done ? "done" : "", style: `--cc:var(--c-${t.cat})` })));
    const cel = h("button", {
      type: "button",
      class: "cell" + (data === HOJE ? " today" : ""),
      "aria-pressed": data === sel,
      "aria-label": `Dia ${d}, ${doDia.length} tarefas`,
    }, [h("b", { text: d }), dots]);
    cel.onclick = () => { sel = data; $("d").value = data; renderMes(); renderDia(); };
    grade.appendChild(cel);
  }
}
 
// ---------- Dia selecionado ----------
function renderDia() {
  const [y, m, d] = sel.split("-").map(Number);
  $("dayTitle").textContent = new Date(y, m - 1, d)
    .toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
 
  const T = tasks.filter((t) => t.date === sel).sort((a, b) => a.start.localeCompare(b.start));
  const feitas = T.filter((t) => t.done).length;
  $("ptxt").textContent = T.length ? `${feitas} de ${T.length} tarefas feitas` : "Nenhuma tarefa neste dia";
  $("ppct").textContent = T.length ? Math.round(feitas / T.length * 100) + "%" : "";
 
  const bar = $("bar");
  bar.innerHTML = "";
  Object.keys(CATS).forEach((k) => {
    const n = T.filter((t) => t.done && t.cat === k).length;
    if (n) bar.appendChild(h("span", { style: `width:${n / T.length * 100}%;background:var(--c-${k})` }));
  });
 
  const tags = $("tags");
  tags.innerHTML = "";
  Object.keys(CATS).forEach((k) => {
    const b = h("button", { type: "button", class: "tag", "aria-pressed": !hidden[k], style: `--cc:var(--c-${k})` },
      [h("i"), document.createTextNode(CATS[k])]);
    b.onclick = () => { hidden[k] = !hidden[k]; renderDia(); };
    tags.appendChild(b);
  });
 
  const tl = $("tl");
  tl.innerHTML = "";
  tl.style.height = (END - START) * PX + "px";
  for (let i = START; i <= END; i++)
    tl.appendChild(h("div", { class: "hour", style: `top:${(i - START) * PX}px`, text: pad(i) + ":00" }));
 
  T.forEach((t) => {
    if (hidden[t.cat]) return;
    const a = mins(t.start), b = mins(t.end);
    const cb = h("input", { type: "checkbox", "aria-label": "Concluir " + t.name });
    cb.checked = t.done;
    cb.onchange = async () => { t.done = cb.checked; renderMes(); renderDia(); await api(`/api/tasks/${t.id}`, "PATCH", { done: t.done }); };
 
    const x = h("button", { type: "button", class: "x", "aria-label": "Remover " + t.name, text: "×" });
    x.onclick = async () => {
      let serie = false;
      if (t.series) serie = confirm("Esta tarefa se repete.\n\nOK = apagar todas as repetições\nCancelar = apagar só esta");
      await api(`/api/tasks/${t.id}${serie ? "?series=1" : ""}`, "DELETE");
      carregarMes();
    };
 
    tl.appendChild(h("div", {
      class: "ev" + (t.done ? " done" : ""),
      style: `--cc:var(--c-${t.cat});top:${tp(a) + 2}px;height:${Math.max(tp(b) - tp(a) - 4, 28)}px`,
    }, [cb, h("div", {}, [h("div", { class: "t", text: t.name }),
        h("div", { class: "h", text: `${t.start} – ${t.end} · ${CATS[t.cat]}` })]), x]));
  });
 
  if (sel === HOJE) tl.appendChild(h("div", { class: "now", id: "now" }, [h("b", { id: "nowt" })]));
  atualizarAgora();
}
 
function atualizarAgora() {
  const el = $("now");
  if (!el) return;
  const n = new Date(), m = n.getHours() * 60 + n.getMinutes();
  if (m < START * 60 || m > END * 60) { el.style.display = "none"; return; }
  el.style.display = "block";
  el.style.top = tp(m) + "px";
  $("nowt").textContent = pad(n.getHours()) + ":" + pad(n.getMinutes());
}
setInterval(atualizarAgora, 30000);
 
// ---------- Nova tarefa ----------
$("add").onclick = async () => {
  const nome = $("n").value.trim();
  if (!nome) { $("n").focus(); return; }
  const dia = $("d").value;
  await api("/api/tasks", "POST", {
    name: nome, date: dia, start: $("s").value, end: $("e").value, cat: $("c").value, repeat: $("r").value,
  });
  $("n").value = "";
  sel = dia;
  const [y, m] = dia.split("-").map(Number);
  view = { y, m: m - 1 }; // pula para o mês da tarefa, se for outro
  carregarMes();
};
 
// Navegação entre meses
function mudarMes(delta) {
  const novo = new Date(view.y, view.m + delta, 1);
  view = { y: novo.getFullYear(), m: novo.getMonth() };
  const mesmoMesQueHoje = view.y === hoje.getFullYear() && view.m === hoje.getMonth();
  sel = mesmoMesQueHoje ? HOJE : iso(view.y, view.m, 1);
  $("d").value = sel;
  carregarMes();
}
$("prev").onclick = () => mudarMes(-1);
$("next").onclick = () => mudarMes(1);
 
// ---------- Listas editáveis ----------
const GOTA = '<svg viewBox="0 0 24 30" aria-hidden="true"><path d="M12 1C12 1 3 12 3 19a9 9 0 0 0 18 0C21 12 12 1 12 1z"/></svg>';
const novoId = () => Math.random().toString(36).slice(2, 10);
let timer;
function salvarListas() { // espera um instante para não salvar a cada letra digitada
  clearTimeout(timer);
  timer = setTimeout(() => api("/api/lists", "PUT", lists), 400);
}
 
function renderListas(focoId) {
  const box = $("notes");
  box.innerHTML = "";
  if (!lists.length) box.appendChild(h("p", { style: "color:var(--mute)", text: "Nenhuma lista ainda. Use os botões acima para criar a sua." }));
 
  lists.forEach((L) => {
    const titulo = h("input", { type: "text", "aria-label": "Nome da lista", placeholder: "Nome da lista", value: L.title });
    titulo.oninput = () => { L.title = titulo.value; salvarListas(); };
    const del = h("button", { type: "button", class: "x", "aria-label": "Apagar lista", text: "×" });
    del.onclick = () => { lists = lists.filter((q) => q.id !== L.id); salvarListas(); renderListas(); };
    const corpo = h("div", { class: "body" });
 
    if (L.kind === "water") {
      const gotas = h("div", { class: "drops" });
      for (let i = 0; i < L.goal; i++) {
        const g = h("button", { type: "button", class: "drop" + (i < L.n ? " on" : ""), "aria-label": "Copo " + (i + 1) });
        g.innerHTML = GOTA;
        g.onclick = () => { L.n = L.n === i + 1 ? i : i + 1; salvarListas(); renderListas(); };
        gotas.appendChild(g);
      }
      const menos = h("button", { type: "button", "aria-label": "Diminuir meta", text: "−" });
      const mais = h("button", { type: "button", "aria-label": "Aumentar meta", text: "+" });
      menos.onclick = () => { if (L.goal > 1) { L.goal--; L.n = Math.min(L.n, L.goal); salvarListas(); renderListas(); } };
      mais.onclick = () => { if (L.goal < 20) { L.goal++; salvarListas(); renderListas(); } };
      corpo.appendChild(gotas);
      corpo.appendChild(h("div", { class: "goal" }, [h("span", { text: `${L.n} de ${L.goal} · meta` }), menos, mais]));
    } else {
      L.items.forEach((it) => {
        const cb = h("input", { type: "checkbox", "aria-label": "Concluir item" });
        cb.checked = it.d;
        cb.onchange = () => { it.d = cb.checked; salvarListas(); renderListas(); };
        const tx = h("input", { type: "text", "aria-label": "Texto do item", value: it.t });
        tx.oninput = () => { it.t = tx.value; salvarListas(); };
        const rm = h("button", { type: "button", class: "x", "aria-label": "Remover item", text: "×" });
        rm.onclick = () => { L.items = L.items.filter((q) => q.id !== it.id); salvarListas(); renderListas(); };
        corpo.appendChild(h("div", { class: "row" + (it.d ? " done" : "") }, [cb, tx, rm]));
      });
      const novo = h("input", { type: "text", "data-add": L.id, placeholder: "+ Adicionar item", "aria-label": "Adicionar item" });
      novo.onkeydown = (e) => {
        if (e.key === "Enter" && novo.value.trim()) {
          L.items.push({ id: novoId(), t: novo.value.trim(), d: false });
          salvarListas(); renderListas(L.id);
        }
      };
      corpo.appendChild(h("div", { class: "addrow" }, [novo]));
      corpo.appendChild(h("div", { class: "cnt", text: `${L.items.filter((q) => q.d).length} de ${L.items.length} feitos` }));
    }
    box.appendChild(h("div", { class: "card" }, [h("div", { class: "head" }, [titulo, del]), corpo]));
  });
 
  if (focoId) { const f = document.querySelector(`[data-add="${focoId}"]`); if (f) f.focus(); }
}
 
$("addList").onclick = () => { const id = novoId(); lists.push({ id, kind: "check", title: "Nova lista", items: [] }); salvarListas(); renderListas(id); };
$("addWater").onclick = () => { lists.push({ id: novoId(), kind: "water", title: "Novo contador", goal: 6, n: 0 }); salvarListas(); renderListas(); };
 
// ---------- Temas de cor ----------
// As cores de cada tema ficam no style.css. Para criar um tema novo, adicione o nome aqui também.
const TEMAS = { branco: "Branco", rosa: "Rosa", azul: "Azul", verde: "Verde", amarelo: "Amarelo", lilas: "Lilás" };
 
function aplicarTema(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("agenda-tema", t); } catch (e) { /* sem salvar */ }
  document.querySelectorAll(".sw").forEach((b) => b.setAttribute("aria-pressed", b.dataset.theme === t));
}
function iniciarTemas() {
  Object.keys(TEMAS).forEach((k) => {
    const b = h("button", { type: "button", class: "sw", "data-theme": k, title: TEMAS[k], "aria-label": "Tema " + TEMAS[k] });
    b.onclick = () => aplicarTema(k);
    $("themes").appendChild(b);
  });
  let t = "branco";
  try { t = localStorage.getItem("agenda-tema") || "branco"; } catch (e) { /* usa o padrão */ }
  aplicarTema(TEMAS[t] ? t : "branco");
}
 
// ---------- Início ----------
(async function iniciar() {
  iniciarTemas();
  ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"].forEach((s) => $("weekdays").appendChild(h("div", { text: s })));
  Object.keys(CATS).forEach((k) => $("c").appendChild(h("option", { value: k, text: CATS[k] })));
  $("d").value = sel;
  lists = await api("/api/lists");
  renderListas();
  carregarMes();
})();