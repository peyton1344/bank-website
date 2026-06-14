function createId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(date) {
  return (date || todayDate()).slice(0, 7);
}

const DEVICE_ID_KEY = "aomdee-device-id";
const LEGACY_KEYS = {
  transactions: "aomdee-transactions",
  goal: "aomdee-goal",
  theme: "aomdee-theme",
};

const deviceId = getDeviceId();

function getDeviceId() {
  const saved = localStorage.getItem(DEVICE_ID_KEY);
  if (saved) return saved;

  const id = createId();
  localStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

function storageKey(name) {
  return `aomdee:${deviceId}:${name}`;
}

function getLocalValue(name) {
  return localStorage.getItem(storageKey(name)) || localStorage.getItem(LEGACY_KEYS[name]);
}

function setLocalValue(name, value) {
  localStorage.setItem(storageKey(name), value);
}

const defaultDate = todayDate();

const defaultTransactions = [
  { id: createId(), type: "income", name: "เงินเดือน", amount: 42000, category: "งาน", date: defaultDate },
  { id: createId(), type: "expense", name: "ค่าอาหารและกาแฟ", amount: 6200, category: "อาหาร", date: defaultDate },
  { id: createId(), type: "expense", name: "ค่าเดินทาง", amount: 2800, category: "เดินทาง", date: defaultDate },
  { id: createId(), type: "saving", name: "โอนเข้าบัญชีเงินออม", amount: 8500, category: "ออมเงิน", date: defaultDate },
  { id: createId(), type: "expense", name: "ค่าน้ำค่าไฟ", amount: 2100, category: "บ้าน", date: defaultDate },
];

const defaultGoal = {
  name: "กองทุนฉุกเฉิน",
  amount: 50000,
};

const tips = [
  "ตั้งงบรายสัปดาห์สำหรับหมวดที่จ่ายบ่อย จะช่วยเห็นจุดรั่วของเงินได้ไวขึ้น",
  "แยกบัญชีออมออกจากบัญชีใช้จ่าย เพื่อลดโอกาสดึงเงินออมมาใช้โดยไม่ตั้งใจ",
  "ตรวจรายการเล็ก ๆ ที่เกิดซ้ำทุกเดือน เพราะมักรวมกันเป็นเงินก้อนใหญ่",
  "เมื่อมีรายรับเพิ่ม ลองเพิ่มเงินออมก่อนเพิ่มค่าใช้จ่ายประจำ",
];

const formatter = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

const monthFormatter = new Intl.DateTimeFormat("th-TH", {
  month: "long",
  year: "numeric",
});

const state = {
  transactions: loadTransactions(),
  goal: loadGoal(),
  editingId: null,
  analysisMonth: monthKey(todayDate()),
  theme: getLocalValue("theme") || "light",
  currentSlipImage: "",
  filters: {
    query: "",
    type: "all",
    category: "all",
    month: "all",
  },
};

const form = document.querySelector("#transaction-form");
const installButton = document.querySelector("#install-app");
const themeToggle = document.querySelector("#theme-toggle");
const typeInput = document.querySelector("#type");
const nameInput = document.querySelector("#name");
const amountInput = document.querySelector("#amount");
const categoryInput = document.querySelector("#category");
const dateInput = document.querySelector("#date");
const slipInput = document.querySelector("#slip-input");
const slipPreview = document.querySelector("#slip-preview");
const slipPreviewImage = document.querySelector("#slip-preview-image");
const removeSlipButton = document.querySelector("#remove-slip");
const submitButton = document.querySelector("#submit-transaction");
const cancelEditButton = document.querySelector("#cancel-edit");
const list = document.querySelector("#transactions");
const resetButton = document.querySelector("#reset-data");
const searchInput = document.querySelector("#search-query");
const filterTypeInput = document.querySelector("#filter-type");
const filterCategoryInput = document.querySelector("#filter-category");
const filterMonthInput = document.querySelector("#filter-month");
const clearFiltersButton = document.querySelector("#clear-filters");
const exportCsvButton = document.querySelector("#export-csv");
const exportExcelButton = document.querySelector("#export-excel");
const filterCount = document.querySelector("#filter-count");
const chart = document.querySelector("#expense-chart");
const emptyChart = document.querySelector("#empty-chart");
const analysisMonthInput = document.querySelector("#analysis-month");
const aiSummary = document.querySelector("#ai-summary");
const aiExpenses = document.querySelector("#ai-expenses");
const aiIncomes = document.querySelector("#ai-incomes");
const aiAdvice = document.querySelector("#ai-advice");
const goalForm = document.querySelector("#goal-form");
const goalNameInput = document.querySelector("#goal-name");
const goalAmountInput = document.querySelector("#goal-amount");
let deferredInstallPrompt = null;

function loadTransactions() {
  const saved = getLocalValue("transactions");
  const transactions = saved ? JSON.parse(saved) : defaultTransactions;
  return transactions.map((item) => ({ ...item, id: item.id || createId(), date: item.date || defaultDate }));
}

function loadGoal() {
  const saved = getLocalValue("goal");
  return saved ? JSON.parse(saved) : defaultGoal;
}

function saveTransactions() {
  setLocalValue("transactions", JSON.stringify(state.transactions));
}

function saveGoal() {
  setLocalValue("goal", JSON.stringify(state.goal));
}

function getTotals(transactions = state.transactions) {
  return transactions.reduce(
    (totals, item) => {
      totals[item.type] += item.amount;
      return totals;
    },
    { income: 0, expense: 0, saving: 0 }
  );
}

function groupByCategory(transactions, type) {
  return transactions
    .filter((item) => item.type === type)
    .reduce((groups, item) => {
      groups[item.category] = (groups[item.category] || 0) + item.amount;
      return groups;
    }, {});
}

function getExpenseByCategory() {
  return groupByCategory(state.transactions, "expense");
}

function getMonthTransactions() {
  return state.transactions.filter((item) => monthKey(item.date) === state.analysisMonth);
}

function getFilteredTransactions() {
  const query = state.filters.query.trim().toLowerCase();

  return state.transactions.filter((item) => {
    const matchesQuery =
      !query ||
      item.name.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      getTypeLabel(item.type).toLowerCase().includes(query);
    const matchesType = state.filters.type === "all" || item.type === state.filters.type;
    const matchesCategory = state.filters.category === "all" || item.category === state.filters.category;
    const matchesMonth = state.filters.month === "all" || monthKey(item.date) === state.filters.month;

    return matchesQuery && matchesType && matchesCategory && matchesMonth;
  });
}

function getMonthLabel(key) {
  return monthFormatter.format(new Date(`${key}-01T00:00:00`));
}

function renderSummary() {
  const totals = getTotals();
  const balance = totals.income - totals.expense - totals.saving;
  const progress = Math.min(Math.round((totals.saving / state.goal.amount) * 100), 100);
  const remaining = Math.max(state.goal.amount - totals.saving, 0);

  document.querySelector("#income-total").textContent = formatter.format(totals.income);
  document.querySelector("#expense-total").textContent = formatter.format(totals.expense);
  document.querySelector("#saving-total").textContent = formatter.format(totals.saving);
  document.querySelector("#balance-total").textContent = formatter.format(balance);
  document.querySelector("#hero-balance").textContent = formatter.format(balance);
  document.querySelector("#goal-name-label").textContent = state.goal.name;
  document.querySelector("#goal-percent").textContent = `${progress}%`;
  document.querySelector("#goal-progress").style.width = `${progress}%`;
  document.querySelector("#goal-note").textContent =
    remaining > 0
      ? `เหลืออีก ${formatter.format(remaining)} เพื่อถึงเป้าหมาย ${formatter.format(state.goal.amount)}`
      : `ถึงเป้าหมาย ${formatter.format(state.goal.amount)} แล้ว`;
  document.querySelector("#money-tip").textContent = tips[state.transactions.length % tips.length];
  goalNameInput.value = state.goal.name;
  goalAmountInput.value = state.goal.amount;
}

function renderTheme() {
  document.body.classList.toggle("dark-mode", state.theme === "dark");
  themeToggle.textContent = state.theme === "dark" ? "☀" : "☾";
  themeToggle.title = state.theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด";
}

function setupMobileAppInstall() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installButton.classList.remove("hidden");
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installButton.classList.add("hidden");
  });
}

function renderSlipPreview() {
  slipPreview.classList.toggle("hidden", !state.currentSlipImage);
  slipPreviewImage.src = state.currentSlipImage || "";
}

function clearSlip() {
  state.currentSlipImage = "";
  slipInput.value = "";
  renderSlipPreview();
}

function openSlip(src) {
  const tab = window.open();
  if (tab) {
    tab.document.write(`<img src="${src}" alt="สลิป" style="max-width:100%;height:auto;display:block;margin:auto;">`);
    tab.document.title = "สลิป";
  }
}

function readSlipFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resizeImage(dataUrl, maxSize = 900, quality = 0.72) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.src = dataUrl;
  });
}

function renderTransactions() {
  list.innerHTML = "";
  const filteredTransactions = getFilteredTransactions();

  filterCount.textContent =
    filteredTransactions.length === state.transactions.length
      ? `แสดงรายการทั้งหมด ${state.transactions.length} รายการ`
      : `พบ ${filteredTransactions.length} จากทั้งหมด ${state.transactions.length} รายการ`;

  if (filteredTransactions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-transactions";
    empty.textContent = "ไม่พบรายการที่ตรงกับคำค้นหาหรือตัวกรอง";
    list.appendChild(empty);
    return;
  }

  filteredTransactions
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((item) => {
      const row = document.createElement("article");
      const detail = document.createElement("div");
      const title = document.createElement("h3");
      const meta = document.createElement("p");
      const amount = document.createElement("strong");
      const slipButton = document.createElement("button");
      const actions = document.createElement("div");
      const editButton = document.createElement("button");
      const deleteButton = document.createElement("button");

      row.className = "transaction";
      title.textContent = item.name;
      meta.textContent = `${getTypeLabel(item.type)} · ${item.category} · ${formatDate(item.date)}`;
      amount.className = `amount ${item.type}`;
      amount.textContent = `${getSign(item.type)}${formatter.format(item.amount)}`;
      actions.className = "row-actions";

      if (item.slipImage) {
        const slipImage = document.createElement("img");
        slipButton.type = "button";
        slipButton.className = "slip-thumb";
        slipButton.title = "เปิดรูปสลิป";
        slipImage.src = item.slipImage;
        slipImage.alt = `สลิป ${item.name}`;
        slipButton.appendChild(slipImage);
        slipButton.addEventListener("click", () => openSlip(item.slipImage));
      } else {
        slipButton.className = "hidden";
      }

      editButton.type = "button";
      editButton.textContent = "แก้";
      editButton.title = "แก้ไขรายการ";
      editButton.addEventListener("click", () => startEdit(item.id));

      deleteButton.type = "button";
      deleteButton.className = "delete";
      deleteButton.textContent = "ลบ";
      deleteButton.title = "ลบรายการ";
      deleteButton.addEventListener("click", () => deleteTransaction(item.id));

      detail.append(title, meta);
      actions.append(editButton, deleteButton);
      row.append(detail, amount, slipButton, actions);
      list.appendChild(row);
    });
}

function renderFilterOptions() {
  const categories = [...new Set(state.transactions.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "th"));
  const months = [...new Set(state.transactions.map((item) => monthKey(item.date)))].sort().reverse();

  renderSelectOptions(filterCategoryInput, categories, "all", "ทั้งหมด", state.filters.category);
  renderSelectOptions(filterMonthInput, months, "all", "ทุกเดือน", state.filters.month, getMonthLabel);

  searchInput.value = state.filters.query;
  filterTypeInput.value = state.filters.type;
}

function renderSelectOptions(select, values, allValue, allLabel, selectedValue, labelFormatter = (value) => value) {
  select.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = allValue;
  allOption.textContent = allLabel;
  select.appendChild(allOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelFormatter(value);
    select.appendChild(option);
  });

  select.value = values.includes(selectedValue) ? selectedValue : allValue;
  if (select.value !== selectedValue) {
    if (select === filterCategoryInput) state.filters.category = allValue;
    if (select === filterMonthInput) state.filters.month = allValue;
  }
}

function renderChart() {
  const groups = getExpenseByCategory();
  const entries = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map((entry) => entry[1]), 0);

  chart.innerHTML = "";
  emptyChart.classList.toggle("visible", entries.length === 0);

  entries.forEach(([category, value]) => {
    const row = document.createElement("div");
    const label = document.createElement("span");
    const track = document.createElement("div");
    const fill = document.createElement("span");
    const amount = document.createElement("strong");

    row.className = "chart-row";
    label.className = "chart-label";
    track.className = "chart-track";
    fill.className = "chart-fill";
    amount.className = "chart-value";

    label.textContent = category;
    fill.style.width = `${Math.max((value / max) * 100, 4)}%`;
    amount.textContent = formatter.format(value);

    track.appendChild(fill);
    row.append(label, track, amount);
    chart.appendChild(row);
  });
}

function renderMonthOptions() {
  const months = [...new Set(state.transactions.map((item) => monthKey(item.date)))].sort().reverse();
  if (!months.includes(state.analysisMonth)) months.unshift(state.analysisMonth);

  analysisMonthInput.innerHTML = "";
  months.forEach((key) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = getMonthLabel(key);
    analysisMonthInput.appendChild(option);
  });
  analysisMonthInput.value = state.analysisMonth;
}

function renderAiAnalysis() {
  const monthTransactions = getMonthTransactions();
  const totals = getTotals(monthTransactions);
  const expenseEntries = Object.entries(groupByCategory(monthTransactions, "expense")).sort((a, b) => b[1] - a[1]);
  const incomeEntries = Object.entries(groupByCategory(monthTransactions, "income")).sort((a, b) => b[1] - a[1]);
  const biggestExpense = monthTransactions
    .filter((item) => item.type === "expense")
    .sort((a, b) => b.amount - a.amount)[0];
  const balance = totals.income - totals.expense - totals.saving;
  const savingRate = totals.income ? Math.round((totals.saving / totals.income) * 100) : 0;
  const monthLabel = getMonthLabel(state.analysisMonth);

  renderAiList(aiExpenses, expenseEntries, "ยังไม่มีรายจ่ายในเดือนนี้");
  renderAiList(aiIncomes, incomeEntries, "ยังไม่มีรายรับในเดือนนี้");

  if (monthTransactions.length === 0) {
    aiSummary.textContent = `เดือน${monthLabel}ยังไม่มีข้อมูลให้วิเคราะห์`;
    aiAdvice.textContent = "ลองเพิ่มรายการพร้อมวันที่ในเดือนที่ต้องการ แล้ว AI จะสรุปที่มาของเงินและจุดที่ใช้เงินมากที่สุดให้";
    return;
  }

  const topExpenseText = expenseEntries[0] ? `${expenseEntries[0][0]} ${formatter.format(expenseEntries[0][1])}` : "ยังไม่มีรายจ่าย";
  const topIncomeText = incomeEntries[0] ? `${incomeEntries[0][0]} ${formatter.format(incomeEntries[0][1])}` : "ยังไม่มีรายรับ";

  aiSummary.textContent =
    `เดือน${monthLabel} มีรายรับ ${formatter.format(totals.income)} รายจ่าย ${formatter.format(totals.expense)} ` +
    `และออม ${formatter.format(totals.saving)} คงเหลือสุทธิ ${formatter.format(balance)} ` +
    `เงินส่วนใหญ่ได้จาก ${topIncomeText} และใช้มากสุดกับ ${topExpenseText}`;

  aiAdvice.textContent = buildAdvice({ totals, savingRate, biggestExpense, expenseEntries, balance });
}

function renderAiList(container, entries, emptyText) {
  container.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }

  entries.forEach(([category, value]) => {
    const row = document.createElement("div");
    const label = document.createElement("span");
    const amount = document.createElement("strong");

    row.className = "ai-line";
    label.textContent = category;
    amount.textContent = formatter.format(value);
    row.append(label, amount);
    container.appendChild(row);
  });
}

function buildAdvice({ totals, savingRate, biggestExpense, expenseEntries, balance }) {
  if (totals.income === 0) return "เดือนนี้ยังไม่มีรายรับ แนะนำให้บันทึกแหล่งรายได้ก่อน เพื่อดูว่ารายได้หลักมาจากทางไหน";
  if (balance < 0) return "เดือนนี้ใช้เกินรายรับ ลองลดหมวดรายจ่ายที่สูงที่สุดก่อน และกันเงินสำหรับค่าใช้จ่ายจำเป็นไว้ตั้งแต่ต้นเดือน";
  if (savingRate < 10) return "อัตราออมยังต่ำกว่า 10% ของรายรับ ลองตั้งโอนออมอัตโนมัติทันทีหลังมีรายรับ";
  if (biggestExpense && biggestExpense.amount > totals.income * 0.3) {
    return `รายการที่หนักที่สุดคือ ${biggestExpense.name} ในหมวด${biggestExpense.category} คิดเป็นสัดส่วนสูง ควรเช็กว่ายังลดหรือตั้งเพดานได้ไหม`;
  }
  if (expenseEntries.length > 0) return `หมวดที่ใช้มากสุดคือ ${expenseEntries[0][0]} ถ้าคุมหมวดนี้ได้ เงินคงเหลือปลายเดือนจะดีขึ้นชัดเจน`;
  return "ภาพรวมดี รายรับมากกว่ารายจ่ายและมีเงินออมต่อเนื่อง ลองเพิ่มเป้าหมายออมให้ท้าทายขึ้นได้";
}

function getTypeLabel(type) {
  return {
    income: "รายรับ",
    expense: "รายจ่าย",
    saving: "เงินออม",
  }[type];
}

function getSign(type) {
  return type === "income" ? "+" : "-";
}

function formatDate(date) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T00:00:00`));
}

function startEdit(id) {
  const item = state.transactions.find((transaction) => transaction.id === id);
  if (!item) return;

  state.editingId = id;
  typeInput.value = item.type;
  nameInput.value = item.name;
  amountInput.value = item.amount;
  categoryInput.value = item.category;
  dateInput.value = item.date;
  state.currentSlipImage = item.slipImage || "";
  renderSlipPreview();
  submitButton.textContent = "บันทึกการแก้ไข";
  cancelEditButton.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelEdit() {
  state.editingId = null;
  form.reset();
  dateInput.value = todayDate();
  clearSlip();
  submitButton.textContent = "บันทึกรายการ";
  cancelEditButton.classList.add("hidden");
}

function deleteTransaction(id) {
  state.transactions = state.transactions.filter((item) => item.id !== id);
  saveTransactions();
  if (state.editingId === id) cancelEdit();
  render();
}

function upsertTransaction(transaction) {
  if (!state.editingId) {
    state.transactions.push({ ...transaction, id: createId() });
    return;
  }

  state.transactions = state.transactions.map((item) =>
    item.id === state.editingId ? { ...transaction, id: state.editingId } : item
  );
  cancelEdit();
}

function render() {
  renderTheme();
  renderSummary();
  renderFilterOptions();
  renderTransactions();
  renderChart();
  renderMonthOptions();
  renderAiAnalysis();
}

function exportTransactions(format) {
  const rows = getFilteredTransactions()
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));

  if (rows.length === 0) {
    alert("ไม่มีรายการสำหรับส่งออก");
    return;
  }

  const fileDate = todayDate();
  if (format === "csv") {
    downloadBlob(buildCsv(rows), `aomdee-transactions-${fileDate}.csv`, "text/csv;charset=utf-8");
    return;
  }

  downloadBlob(buildExcelHtml(rows), `aomdee-transactions-${fileDate}.xls`, "application/vnd.ms-excel;charset=utf-8");
}

function buildCsv(rows) {
  const headers = ["วันที่", "ประเภท", "รายละเอียด", "หมวดหมู่", "จำนวนเงิน", "มีสลิป"];
  const body = rows.map((item) => [
    item.date,
    getTypeLabel(item.type),
    item.name,
    item.category,
    item.amount,
    item.slipImage ? "มี" : "ไม่มี",
  ]);

  return [headers, ...body].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildExcelHtml(rows) {
  const totals = getTotals(rows);
  const balance = totals.income - totals.expense - totals.saving;
  const dataRows = rows
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.date)}</td>
          <td>${escapeHtml(getTypeLabel(item.type))}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.category)}</td>
          <td class="number">${item.amount}</td>
          <td>${item.slipImage ? "มี" : "ไม่มี"}</td>
        </tr>`
    )
    .join("");

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: Tahoma, Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; }
          th { background: #0f8f68; color: #fff; }
          th, td { border: 1px solid #dfe7e2; padding: 8px; }
          .number { mso-number-format: "#,##0"; text-align: right; }
          .summary td { font-weight: bold; background: #eef9f2; }
        </style>
      </head>
      <body>
        <h2>ออมดี - รายการการเงิน</h2>
        <table>
          <tr><th>วันที่</th><th>ประเภท</th><th>รายละเอียด</th><th>หมวดหมู่</th><th>จำนวนเงิน</th><th>มีสลิป</th></tr>
          ${dataRows}
          <tr class="summary"><td colspan="4">รวมรายรับ</td><td class="number">${totals.income}</td><td></td></tr>
          <tr class="summary"><td colspan="4">รวมรายจ่าย</td><td class="number">${totals.expense}</td><td></td></tr>
          <tr class="summary"><td colspan="4">รวมเงินออม</td><td class="number">${totals.saving}</td><td></td></tr>
          <tr class="summary"><td colspan="4">คงเหลือสุทธิ</td><td class="number">${balance}</td><td></td></tr>
        </table>
      </body>
    </html>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function downloadBlob(content, filename, type) {
  const blob = new Blob(["\uFEFF", content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  upsertTransaction({
    type: typeInput.value,
    name: nameInput.value.trim(),
    amount: Number(amountInput.value),
    category: categoryInput.value,
    date: dateInput.value,
    slipImage: state.currentSlipImage,
  });

  state.analysisMonth = monthKey(dateInput.value);
  saveTransactions();
  form.reset();
  dateInput.value = todayDate();
  clearSlip();
  render();
});

cancelEditButton.addEventListener("click", cancelEdit);

slipInput.addEventListener("change", async () => {
  const file = slipInput.files?.[0];
  if (!file) return;

  const dataUrl = await readSlipFile(file);
  state.currentSlipImage = await resizeImage(dataUrl);
  renderSlipPreview();
});

removeSlipButton.addEventListener("click", clearSlip);

themeToggle.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  setLocalValue("theme", state.theme);
  renderTheme();
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    alert("บน iPhone/iPad ให้กดปุ่ม Share แล้วเลือก Add to Home Screen");
    return;
  }

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.classList.add("hidden");
});

resetButton.addEventListener("click", () => {
  state.transactions = defaultTransactions.map((item) => ({ ...item, id: createId(), date: todayDate() }));
  state.analysisMonth = monthKey(todayDate());
  resetFilters();
  saveTransactions();
  cancelEdit();
  render();
});

searchInput.addEventListener("input", () => {
  state.filters.query = searchInput.value;
  renderTransactions();
});

filterTypeInput.addEventListener("change", () => {
  state.filters.type = filterTypeInput.value;
  renderTransactions();
});

filterCategoryInput.addEventListener("change", () => {
  state.filters.category = filterCategoryInput.value;
  renderTransactions();
});

filterMonthInput.addEventListener("change", () => {
  state.filters.month = filterMonthInput.value;
  renderTransactions();
});

clearFiltersButton.addEventListener("click", () => {
  resetFilters();
  render();
});

exportCsvButton.addEventListener("click", () => exportTransactions("csv"));

exportExcelButton.addEventListener("click", () => exportTransactions("excel"));

function resetFilters() {
  state.filters = {
    query: "",
    type: "all",
    category: "all",
    month: "all",
  };
}

analysisMonthInput.addEventListener("change", () => {
  state.analysisMonth = analysisMonthInput.value;
  renderAiAnalysis();
});

goalForm.addEventListener("submit", (event) => {
  event.preventDefault();

  state.goal = {
    name: goalNameInput.value.trim(),
    amount: Number(goalAmountInput.value),
  };
  saveGoal();
  render();
});

dateInput.value = todayDate();
setupMobileAppInstall();
render();
