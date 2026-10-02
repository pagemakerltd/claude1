const input = document.getElementById("input");
const addBtn = document.getElementById("add");
const list = document.getElementById("list");
const empty = document.getElementById("empty");

let notes = [];

function save() {
  chrome.storage.local.set({ notes });
}

function render() {
  list.textContent = "";
  empty.hidden = notes.length > 0;

  for (const note of notes) {
    const li = document.createElement("li");

    const text = document.createElement("div");
    text.className = "text";
    text.textContent = note.text;

    const meta = document.createElement("div");
    meta.className = "meta";

    const time = document.createElement("span");
    time.textContent = new Date(note.createdAt).toLocaleString("th-TH");

    const del = document.createElement("button");
    del.textContent = "ลบ";
    del.addEventListener("click", () => {
      notes = notes.filter((n) => n.id !== note.id);
      save();
      render();
    });

    meta.append(time, del);
    li.append(text, meta);
    list.append(li);
  }
}

function addNote() {
  const text = input.value.trim();
  if (!text) return;
  notes.unshift({ id: Date.now(), text, createdAt: Date.now() });
  input.value = "";
  save();
  render();
}

addBtn.addEventListener("click", addNote);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) addNote();
});

chrome.storage.local.get("notes", (data) => {
  notes = data.notes || [];
  render();
  input.focus();
});
