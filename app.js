const stateKey = "01-mobile-sync-v1";
const saved = JSON.parse(localStorage.getItem(stateKey) || "{}");
const byId = (id) => document.getElementById(id);
const connection = byId("connection");

function save(next) { Object.assign(saved, next); localStorage.setItem(stateKey, JSON.stringify(saved)); }
function showChat() { byId("welcome").classList.add("hidden"); byId("chat").classList.remove("hidden"); connection.textContent = "Ollama Cloud"; }
function addMessage(text, you = false) {
  const item = document.createElement("div"); item.className = "bubble" + (you ? " you" : ""); item.textContent = text;
  byId("messages").append(item); item.scrollIntoView({ block:"end" });
}
async function pair() {
  const server = byId("server-url").value.trim().replace(/\/$/, "");
  const code = byId("pairing-code").value.trim();
  if (!/^https:\/\//i.test(server) || !code) return alert("Enter an HTTPS server address and the pairing code from 01.");
  const keyPair = await crypto.subtle.generateKey({ name:"ECDSA", namedCurve:"P-256" }, true, ["sign", "verify"]);
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const response = await fetch(server + "/api/v1/mobile/pair", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ pairing_code:code, device_name:"iPhone", public_key:publicKey }) });
  if (!response.ok) throw new Error("Sync was rejected. Check the code and server address.");
  const body = await response.json();
  if (!body.device_id || !body.session_token) throw new Error("The server returned an incomplete sync response.");
  save({ server, deviceId:body.device_id, token:body.session_token }); showChat();
}
byId("pair").onclick = () => pair().catch(error => alert(error.message));
byId("forget").onclick = () => { localStorage.removeItem(stateKey); location.reload(); };
byId("composer").onsubmit = async (event) => {
  event.preventDefault(); const input = byId("message"); const text = input.value.trim(); if (!text) return;
  input.value = ""; addMessage(text, true);
  try {
    const response = await fetch(saved.server + "/api/v1/mobile/messages", {
      method:"POST", headers:{ "Content-Type":"application/json", "Authorization":"Bearer " + saved.token },
      body:JSON.stringify({ device_id:saved.deviceId, text, mode:"chat_sync" }),
    });
    if (!response.ok) throw new Error("01 could not accept this message.");
    const body = await response.json(); addMessage(body.message || "01 did not return a reply.");
  } catch (error) { addMessage("Ollama Cloud is unavailable right now. Your computer’s 01 was not used as a fallback."); }
};
if (saved.server && saved.token && saved.deviceId) showChat();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js");
