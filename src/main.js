import "./styles.css";

const STORAGE_KEY = "zfl-14-repairs";
const statuses = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完成"
};

const priorities = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

let state = loadState();
const app = document.querySelector("#app");

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const parsed = JSON.parse(saved);
    return {
      filter: parsed.filter || "all",
      repairs: (parsed.repairs || []).map(normalizeRepair)
    };
  }
  return {
    filter: "all",
    repairs: [
      normalizeRepair({
        id: crypto.randomUUID(),
        location: "厨房",
        title: "水槽下方渗水",
        priority: "high",
        cost: 260,
        status: "todo",
        photo: "",
        note: "先检查软管接口"
      })
    ]
  };
}

function normalizeRepair(repair) {
  const materials = Array.isArray(repair.materials)
    ? repair.materials.map((material) => ({
        id: material.id || crypto.randomUUID(),
        name: String(material.name || ""),
        price: toAmount(material.price),
        qty: toAmount(material.qty)
      }))
    : [];
  return { ...repair, cost: toAmount(repair.cost), materials };
}

function toAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : 0;
}

function materialTotal(repair) {
  return repair.materials.reduce((total, material) => total + material.price * material.qty, 0);
}

function formatMoney(value) {
  return String(Math.round((Number(value) || 0) * 100) / 100);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function render() {
  const repairs = filteredRepairs();
  const unfinished = state.repairs.filter((repair) => repair.status !== "done");
  const finished = state.repairs.filter((repair) => repair.status === "done");
  const estimatedCost = unfinished.reduce((total, repair) => total + Number(repair.cost || 0), 0);
  const finishedSpent = finished.reduce((total, repair) => total + materialTotal(repair), 0);
  const doing = state.repairs.filter((repair) => repair.status === "doing").length;

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <p class="eyebrow">本地家庭维护台</p>
          <h1>家庭维修事项</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>未完成</span><strong>${unfinished.length}</strong></div>
          <div class="stat"><span>处理中</span><strong>${doing}</strong></div>
          <div class="stat"><span>预计费用</span><strong data-stat="estimated">¥${formatMoney(estimatedCost)}</strong></div>
          <div class="stat"><span>已完成支出</span><strong data-stat="spent">¥${formatMoney(finishedSpent)}</strong></div>
        </section>
      </header>

      <section class="layout">
        <aside class="panel">
          <h2>新增维修事项</h2>
          <form class="form" id="repair-form">
            <label>位置<input name="location" required placeholder="例如卫生间"></label>
            <label>问题描述<textarea name="title" required placeholder="例如门锁松动"></textarea></label>
            <label>优先级<select name="priority">${renderPriorityOptions("medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
            <label>处理状态<select name="status">${renderStatusOptions("todo")}</select></label>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
            <button class="primary" type="submit">保存事项</button>
          </form>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(statuses).map(([value, label]) => `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`).join("")}
          </div>
          <div class="repairs">
            ${repairs.length ? repairs.map(renderRepair).join("") : `<div class="empty">当前状态下没有维修事项</div>`}
          </div>
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function renderRepair(repair) {
  const actual = materialTotal(repair);
  return `
    <article class="repair">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3>${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${priorities[repair.priority]}</span>
          <span class="status ${repair.status}">${statuses[repair.status]}</span>
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">预计 ¥${formatMoney(repair.cost)}</span>
          <span class="chip actual">实际费用 ¥<strong data-actual="${repair.id}">${formatMoney(actual)}</strong></span>
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>
        ${renderMaterials(repair)}
        <div class="actions">
          <select data-status="${repair.id}">${renderStatusOptions(repair.status)}</select>
          <button class="ghost" data-delete="${repair.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderMaterials(repair) {
  return `
    <div class="materials">
      <h4>耗材明细</h4>
      <div class="material-row material-labels">
        <span>名称</span><span>单价</span><span>数量</span><span>小计</span><span></span>
      </div>
      ${repair.materials.length ? repair.materials.map((material) => renderMaterialRow(repair, material)).join("") : `<p class="no-material">暂无耗材，点击下方按钮添加</p>`}
      <button class="ghost material-add" type="button" data-material-add="${repair.id}">＋ 添加耗材</button>
    </div>
  `;
}

function renderMaterialRow(repair, material) {
  const subtotal = material.price * material.qty;
  return `
    <div class="material-row">
      <input data-repair="${repair.id}" data-material="${material.id}" data-field="name" placeholder="耗材名称" value="${escapeHtml(material.name)}">
      <input data-repair="${repair.id}" data-material="${material.id}" data-field="price" type="number" min="0" step="0.01" value="${material.price}">
      <input data-repair="${repair.id}" data-material="${material.id}" data-field="qty" type="number" min="0" step="1" value="${material.qty}">
      <span class="subtotal">¥<em data-subtotal="${repair.id}:${material.id}">${formatMoney(subtotal)}</em></span>
      <button class="ghost" type="button" data-material-remove="${repair.id}" data-material-id="${material.id}">移除</button>
    </div>
  `;
}

function renderStatusOptions(selected) {
  return Object.entries(statuses)
    .filter(([value]) => value !== "all")
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function renderPriorityOptions(selected) {
  return Object.entries(priorities)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function bindEvents() {
  document.querySelector("#repair-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    state.repairs.unshift(
      normalizeRepair({
        id: crypto.randomUUID(),
        location: data.location.trim(),
        title: data.title.trim(),
        priority: data.priority,
        cost: Number(data.cost || 0),
        status: data.status,
        photo: data.photo.trim(),
        note: data.note.trim()
      })
    );
    saveState();
    render();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const repair = state.repairs.find((item) => item.id === select.dataset.status);
      repair.status = select.value;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.repairs = state.repairs.filter((repair) => repair.id !== button.dataset.delete);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-material-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const repair = state.repairs.find((item) => item.id === button.dataset.materialAdd);
      const material = { id: crypto.randomUUID(), name: "", price: 0, qty: 1 };
      repair.materials.push(material);
      saveState();
      render();
      const nameInput = document.querySelector(`[data-material="${material.id}"][data-field="name"]`);
      if (nameInput) nameInput.focus();
    });
  });

  document.querySelectorAll("[data-material-remove]").forEach((button) => {
    button.addEventListener("click", () => {
      const repair = state.repairs.find((item) => item.id === button.dataset.materialRemove);
      repair.materials = repair.materials.filter((material) => material.id !== button.dataset.materialId);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("input", () => {
      const repair = state.repairs.find((item) => item.id === input.dataset.repair);
      const material = repair.materials.find((item) => item.id === input.dataset.material);
      if (input.dataset.field === "name") {
        material.name = input.value;
      } else {
        material[input.dataset.field] = toAmount(input.value);
      }
      saveState();
      refreshAmounts();
    });
  });
}

function refreshAmounts() {
  state.repairs.forEach((repair) => {
    repair.materials.forEach((material) => {
      const subtotal = document.querySelector(`[data-subtotal="${repair.id}:${material.id}"]`);
      if (subtotal) subtotal.textContent = formatMoney(material.price * material.qty);
    });
    const actual = document.querySelector(`[data-actual="${repair.id}"]`);
    if (actual) actual.textContent = formatMoney(materialTotal(repair));
  });

  const unfinished = state.repairs.filter((repair) => repair.status !== "done");
  const finished = state.repairs.filter((repair) => repair.status === "done");
  const estimated = document.querySelector('[data-stat="estimated"]');
  const spent = document.querySelector('[data-stat="spent"]');
  if (estimated) {
    estimated.textContent = `¥${formatMoney(unfinished.reduce((total, repair) => total + Number(repair.cost || 0), 0))}`;
  }
  if (spent) {
    spent.textContent = `¥${formatMoney(finished.reduce((total, repair) => total + materialTotal(repair), 0))}`;
  }
}

function filteredRepairs() {
  if (state.filter === "all") return state.repairs;
  return state.repairs.filter((repair) => repair.status === state.filter);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
