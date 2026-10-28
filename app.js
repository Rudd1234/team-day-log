const SUPABASE_URL = "https://oxayfzuqzganoxwfvwqj.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_FnWMDdVsToal8pOdrocBnQ_fDXEwWzm";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const state = { members: [], entries: [] };
let currentMonth = startOfMonth(new Date());
let sheetDate = "";
let pressTimer = null;
let ignoreNextClick = false;

const personFilter = document.querySelector("#person-filter");
const formMessage = document.querySelector("#form-message");
const memberList = document.querySelector("#member-list");
const calendar = document.querySelector("#calendar");
const monthLabel = document.querySelector("#month-label");
const dayList = document.querySelector("#day-list");
const daySheet = document.querySelector("#day-sheet");
const daySheetTitle = document.querySelector("#day-sheet-title");
const daySheetPerson = document.querySelector("#day-sheet-person");
const daySheetDelete = document.querySelector("#day-sheet-delete");
const overviewButton = document.querySelector("#overview-button");
const overlapPanel = document.querySelector("#overlap-panel");
const overlapList = document.querySelector("#overlap-list");

document.querySelector("#member-form").addEventListener("submit", onAddMember);
document.querySelector("#prev-month").addEventListener("click", () => shiftMonth(-1));
document.querySelector("#next-month").addEventListener("click", () => shiftMonth(1));
personFilter.addEventListener("change", render);
overviewButton.addEventListener("click", showOverview);
calendar.addEventListener("pointerdown", onCalendarPointerDown);
calendar.addEventListener("click", onCalendarClick, true);
calendar.addEventListener("contextmenu", (event) => {
  if (event.target.closest(".day[data-date]")) event.preventDefault();
});
document.querySelector("#day-sheet-work").addEventListener("click", () => applySheetAction("work"));
document.querySelector("#day-sheet-off").addEventListener("click", () => applySheetAction("off"));
document.querySelector("#day-sheet-ot").addEventListener("click", () => applySheetAction("ot"));
document.querySelector("#day-sheet-delete").addEventListener("click", () => applySheetAction("delete"));
document.querySelector("#day-sheet-cancel").addEventListener("click", closeDaySheet);
document.querySelector("#day-sheet-backdrop").addEventListener("click", closeDaySheet);
daySheetPerson.addEventListener("change", syncSheetDeleteState);

loadState();

async function loadState() {
  showMessage("กำลังโหลดข้อมูลร่วม…");
  const [membersResult, entriesResult] = await Promise.all([
    db.from("team_members").select("id,name").order("name"),
    db.from("day_entries").select("id,member_id,date,type,note").order("date"),
  ]);
  if (membersResult.error || entriesResult.error) {
    showMessage("เชื่อมฐานข้อมูลไม่ได้ กรุณาตรวจการตั้งค่าและสิทธิ์ใน Supabase");
    console.error(membersResult.error || entriesResult.error);
    return;
  }
  state.members = membersResult.data;
  state.entries = entriesResult.data.map((entry) => ({
    id: entry.id,
    memberId: entry.member_id,
    date: entry.date,
    type: entry.type,
    note: entry.note,
  }));
  showMessage("");
  render();
}

function showMessage(text) {
  formMessage.hidden = !text;
  formMessage.textContent = text;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(delta) {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
  render();
}

async function onAddMember(event) {
  event.preventDefault();
  const input = document.querySelector("#member-name");
  const name = input.value.trim();
  if (!name) return;
  if (state.members.some((member) => member.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    showMessage("มีชื่อนี้ในทีมแล้ว");
    return;
  }
  const { error } = await db.from("team_members").insert({ name });
  if (error) {
    showMessage("เพิ่มชื่อไม่สำเร็จ ลองอีกครั้ง");
    console.error(error);
    return;
  }
  input.value = "";
  await loadState();
}

async function removeMember(id) {
  if (!window.confirm("ลบสมาชิกและรายการวันทั้งหมดของชื่อนี้หรือไม่?")) return;
  const { error } = await db.from("team_members").delete().eq("id", id);
  if (error) {
    showMessage("ลบสมาชิกไม่สำเร็จ");
    console.error(error);
    return;
  }
  await loadState();
}

async function removeEntry(id) {
  const { error } = await db.from("day_entries").delete().eq("id", id);
  if (error) {
    showMessage("ลบรายการไม่สำเร็จ");
    console.error(error);
    return;
  }
  await loadState();
}

function selectedMemberId() {
  return personFilter.value;
}

function visibleEntries() {
  const memberId = selectedMemberId();
  return memberId ? state.entries.filter((entry) => entry.memberId === memberId) : state.entries;
}

function memberName(id) {
  return state.members.find((member) => member.id === id)?.name ?? "ไม่พบชื่อ";
}

function showOverview() {
  personFilter.value = "";
  render();
}

function isOverview() {
  return !selectedMemberId();
}

function render() {
  renderSelects();
  renderMembers();
  renderCalendar();
  renderOverlaps();
  renderDayList();
  overviewButton.classList.toggle("active", isOverview());
}

function renderSelects() {
  const previousFilter = personFilter.value;
  const options = [{ id: "", name: "ทุกคน" }, ...state.members];
  personFilter.innerHTML = options
    .map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}</option>`)
    .join("");
  personFilter.value = options.some((member) => member.id === previousFilter) ? previousFilter : "";
}

function renderMembers() {
  memberList.innerHTML = state.members.map((member) => `
    <li>
      <span>${escapeHtml(member.name)}</span>
      <button class="ghost" type="button" data-remove-member="${escapeHtml(member.id)}">ลบ</button>
    </li>`).join("");
  memberList.querySelectorAll("[data-remove-member]").forEach((button) => {
    button.addEventListener("click", () => removeMember(button.dataset.removeMember));
  });
}

function renderCalendar() {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  monthLabel.textContent = currentMonth.toLocaleDateString("th-TH", { month: "long", year: "numeric" });
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const entries = visibleEntries();
  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push('<div class="day empty"></div>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayEntries = entries.filter((entry) => entry.date === date)
      .sort((a, b) => Number(b.type === "off") - Number(a.type === "off"));
    const offCount = dayEntries.filter((entry) => entry.type === "off").length;
    const overlap = isOverview() && offCount >= 2;
    const chips = dayEntries.map((entry) => {
      const label = selectedMemberId() ? typeLabel(entry.type)
        : `${memberName(entry.memberId)}${entry.type === "work" ? "" : ` · ${typeLabel(entry.type)}`}`;
      return `<span class="chip ${escapeHtml(entry.type)}">${escapeHtml(label)}</span>`;
    }).join("");
    const flag = overlap ? `<span class="overlap-flag">หยุดทับ ${offCount} คน</span>` : "";
    cells.push(`<div class="day${overlap ? " overlap" : ""}" data-date="${date}"><div class="num">${day}</div>${flag}${chips}</div>`);
  }
  calendar.innerHTML = cells.join("");
}

function onCalendarPointerDown(event) {
  const day = event.target.closest(".day[data-date]");
  if (!day || event.button) return;
  const startX = event.clientX;
  const startY = event.clientY;
  day.classList.add("holding");
  pressTimer = setTimeout(() => {
    pressTimer = null;
    ignoreNextClick = true;
    day.classList.remove("holding");
    if (navigator.vibrate) navigator.vibrate(15);
    openDaySheet(day.dataset.date);
  }, 450);
  const cancelPress = (moveEvent) => {
    if (moveEvent.type === "pointermove" && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 12) return;
    clearTimeout(pressTimer);
    pressTimer = null;
    day.classList.remove("holding");
    window.removeEventListener("pointermove", cancelPress);
    window.removeEventListener("pointerup", cancelPress);
    window.removeEventListener("pointercancel", cancelPress);
  };
  window.addEventListener("pointermove", cancelPress);
  window.addEventListener("pointerup", cancelPress);
  window.addEventListener("pointercancel", cancelPress);
}

function onCalendarClick(event) {
  const day = event.target.closest(".day[data-date]");
  if (ignoreNextClick) {
    event.preventDefault();
    event.stopPropagation();
    ignoreNextClick = false;
    return;
  }
  if (day) openDaySheet(day.dataset.date);
}

function openDaySheet(date) {
  if (state.members.length === 0) {
    showMessage("เพิ่มชื่อคนในทีมก่อน");
    return;
  }
  sheetDate = date;
  daySheetTitle.textContent = `วันที่ ${formatThaiDate(date)}`;
  const preferred = selectedMemberId();
  daySheetPerson.innerHTML = state.members
    .map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)}</option>`).join("");
  if (state.members.some((member) => member.id === preferred)) daySheetPerson.value = preferred;
  syncSheetDeleteState();
  daySheet.hidden = false;
}

function closeDaySheet() {
  daySheet.hidden = true;
  sheetDate = "";
}

function syncSheetDeleteState() {
  daySheetDelete.disabled = !findEntry(daySheetPerson.value, sheetDate);
}

function findEntry(memberId, date) {
  return state.entries.find((entry) => entry.memberId === memberId && entry.date === date);
}

async function applySheetAction(action) {
  const memberId = daySheetPerson.value;
  if (!memberId || !sheetDate) return;
  let result;
  if (action === "delete") {
    result = await db.from("day_entries").delete().eq("member_id", memberId).eq("date", sheetDate);
  } else {
    result = await db.from("day_entries").upsert(
      { member_id: memberId, date: sheetDate, type: action, note: "" },
      { onConflict: "member_id,date" }
    );
  }
  if (result.error) {
    showMessage("บันทึกรายการไม่สำเร็จ");
    console.error(result.error);
    return;
  }
  closeDaySheet();
  await loadState();
}

function monthOffOverlaps() {
  const prefix = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
  const byDate = new Map();
  state.entries.filter((entry) => entry.type === "off" && entry.date.startsWith(prefix)).forEach((entry) => {
    const names = byDate.get(entry.date) ?? [];
    names.push(memberName(entry.memberId));
    byDate.set(entry.date, names);
  });
  return [...byDate.entries()].filter(([, names]) => names.length >= 2)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, names]) => ({ date, names: names.sort((a, b) => a.localeCompare(b, "th")) }));
}

function renderOverlaps() {
  if (!isOverview()) {
    overlapPanel.hidden = true;
    overlapList.innerHTML = "";
    return;
  }
  const overlaps = monthOffOverlaps();
  overlapPanel.hidden = false;
  if (!overlaps.length) {
    overlapList.innerHTML = "<li>เดือนนี้ยังไม่มีวันหยุดทับกัน</li>";
    return;
  }
  overlapList.innerHTML = overlaps.map((item) =>
    `<li>${formatThaiDate(item.date)} · ${escapeHtml(item.names.join(", "))} (${item.names.length} คน)</li>`
  ).join("");
}

function renderDayList() {
  const prefix = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
  const rows = visibleEntries().filter((entry) => entry.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date) || memberName(a.memberId).localeCompare(memberName(b.memberId), "th"));
  if (!rows.length) {
    dayList.innerHTML = "<li>ยังไม่มีรายการในเดือนนี้</li>";
    return;
  }
  dayList.innerHTML = rows.map((entry) => `
    <li>
      <span>${formatThaiDate(entry.date)} · ${escapeHtml(memberName(entry.memberId))} · ${typeLabel(entry.type)}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</span>
      <button class="ghost" type="button" data-remove-entry="${escapeHtml(entry.id)}">ลบ</button>
    </li>`).join("");
  dayList.querySelectorAll("[data-remove-entry]").forEach((button) => {
    button.addEventListener("click", () => removeEntry(button.dataset.removeEntry));
  });
}

function typeLabel(type) {
  if (type === "off") return "วันหยุด";
  if (type === "ot") return "ทำ OT";
  return "วันทำงาน";
}

function formatThaiDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
