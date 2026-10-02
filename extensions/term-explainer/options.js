const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["apiKey", "model", "language"], (data) => {
  $("apiKey").value = data.apiKey || "";
  $("model").value = data.model || "";
  $("language").value = data.language || "th";
});

$("save").addEventListener("click", () => {
  chrome.storage.local.set(
    {
      apiKey: $("apiKey").value.trim(),
      model: $("model").value.trim(),
      language: $("language").value,
    },
    () => {
      $("status").textContent = "บันทึกแล้ว ✓";
      setTimeout(() => ($("status").textContent = ""), 1500);
    }
  );
});
