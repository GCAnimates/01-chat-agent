const stateKey = "01-mobile-cloud-v1";
const saved = JSON.parse(localStorage.getItem(stateKey) || "{}");
const byId = (id) => document.getElementById(id);
function save(next) { Object.assign(saved, next); localStorage.setItem(stateKey, JSON.stringify(saved)); }
function addMessage(text, you = false) {
  const item = document.createElement("div"); item.className = "bubble" + (you ? " you" : ""); item.textContent = text;
  byId("messages").append(item); item.scrollIntoView({ block:"end" });
}
byId("settings-button").onclick = () => byId("connection-settings").classList.toggle("hidden");
byId("save-connection").onclick = () => {
  const server = byId("server-url").value.trim().replace(/\/$/, ""); const accessKey = byId("access-key").value.trim();
  if (!/^https:\/\//i.test(server) || !accessKey) return alert("Enter your HTTPS Render address and its access key.");
  save({ server, accessKey }); byId("connection-settings").classList.add("hidden");
};
byId("clear-chat").onclick = () => { if (confirm("Delete this phone's chat?")) location.reload(); };
byId("composer").onsubmit = async (event) => {
  event.preventDefault(); const input = byId("message"); const text = input.value.trim(); if (!text) return;
  input.value = ""; addMessage(text, true);
  try {
    if (!saved.server || !saved.accessKey) throw new Error("Not connected");
    const response = await fetch(saved.server + "/api/v1/chat", {
      method:"POST", headers:{ "Content-Type":"application/json", "X-01-Access-Key":saved.accessKey },
      body:JSON.stringify({ messages:[{ role:"user", content:text }], client:"01-mobile", provider:"ollama_cloud" }),
    });
    if (!response.ok) throw new Error("01 could not answer right now.");
    const body = await response.json(); addMessage(body.message || "I didn't receive a response.");
  } catch (error) { addMessage("Open ••• and add your Render server address and access key first."); }
};
byId("server-url").value = saved.server || "";
byId("access-key").value = saved.accessKey || "";
if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
