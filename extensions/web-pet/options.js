const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["petApiKey", "petModel", "petName", "petDogName", "petPlutoName", "petHappyName", "petShareNotes"], (s) => {
  $("apiKey").value = s.petApiKey || "";
  $("model").value = s.petModel || "";
  $("name").value = s.petName || "";
  $("dogName").value = s.petDogName || "";
  $("plutoName").value = s.petPlutoName || "";
  $("happyName").value = s.petHappyName || "";
  $("share").checked = s.petShareNotes === true;
});

$("save").addEventListener("click", () => {
  chrome.storage.local.set(
    {
      petApiKey: $("apiKey").value.trim(),
      petModel: $("model").value.trim(),
      petName: $("name").value.trim(),
      petDogName: $("dogName").value.trim(),
      petPlutoName: $("plutoName").value.trim(),
      petHappyName: $("happyName").value.trim(),
      petShareNotes: $("share").checked,
    },
    () => {
      $("status").textContent = "บันทึกแล้ว ✓";
      setTimeout(() => ($("status").textContent = ""), 1500);
    }
  );
});
