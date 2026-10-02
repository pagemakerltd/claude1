const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["petApiKey", "petModel", "petName", "petDogName", "petShareNotes"], (s) => {
  $("apiKey").value = s.petApiKey || "";
  $("model").value = s.petModel || "";
  $("name").value = s.petName || "";
  $("dogName").value = s.petDogName || "";
  $("share").checked = s.petShareNotes === true;
});

$("save").addEventListener("click", () => {
  chrome.storage.local.set(
    {
      petApiKey: $("apiKey").value.trim(),
      petModel: $("model").value.trim(),
      petName: $("name").value.trim(),
      petDogName: $("dogName").value.trim(),
      petShareNotes: $("share").checked,
    },
    () => {
      $("status").textContent = "บันทึกแล้ว ✓";
      setTimeout(() => ($("status").textContent = ""), 1500);
    }
  );
});
