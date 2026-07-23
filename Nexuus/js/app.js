import {
  auth, db, onAuthStateChanged, ref, set, get, push, update, remove,
  onValue, onDisconnect, query, orderByChild, equalTo
} from "./firebase.js";
import { register, login, logout, changeDisplayName, authError } from "./auth.js";
import {
  initPubNub, subscribeToConversation, unsubscribeFromConversation,
  publishMessage, sendTypingSignal
} from "./pubnub.js";
import * as ui from "./ui.js";

let currentUser = null;
let activeConversationId = null;
let activeOtherUser = null;
let conversations = [];
let users = [];
let conversationStop = null;
let presenceStop = null;
let typingTimer;
let lastDateShown = "";
const emojis = ["😀", "😂", "😍", "🥳", "😎", "🤔", "😭", "😅", "🙌", "👏", "❤️", "🔥", "✨", "🎉", "👍", "👀", "💜", "✅"];

const conversationIdFor = (first, second) => [first, second].sort().join("_");
const userRecord = (uid) => users.find(user => user.uid === uid);

function dateLabel(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
}

function showDateIfNeeded(timestamp) {
  const label = dateLabel(timestamp);
  if (label !== lastDateShown) {
    lastDateShown = label;
    ui.addDateSeparator(label);
  }
}

function currentConversationItems(data) {
  return Object.entries(data || {}).filter(([, value]) => value?.participants?.[currentUser.uid] === true).map(([id, value]) => {
    const otherUid = Object.keys(value.participants).find(uid => uid !== currentUser.uid);
    return { id, data: value, user: userRecord(otherUid) || { uid: otherUid, displayName: "Unknown user", email: "" } };
  }).sort((a, b) => (b.data.updatedAt || 0) - (a.data.updatedAt || 0));
}

function watchConversations() {
  if (conversationStop) conversationStop();
  conversationStop = onValue(ref(db, "conversations"), snapshot => {
    conversations = currentConversationItems(snapshot.val());
    ui.renderConversations(conversations, activeConversationId);
  });
}

async function loadUsers() {
  const snapshot = await get(ref(db, "users"));
  users = Object.entries(snapshot.val() || {}).map(([uid, value]) => ({ uid, ...value })).filter(user => user.uid !== currentUser.uid);
}

async function startConversation(otherUser) {
  const id = conversationIdFor(currentUser.uid, otherUser.uid);
  const participants = { [currentUser.uid]: true, [otherUser.uid]: true };
  await update(ref(db, `conversations/${id}`), { participants, updatedAt: Date.now() });
  ui.renderSearchResults([]);
  ui.els.searchInput.value = "";
  await openConversation({ id, user: otherUser, data: { participants } });
}

function handleIncomingMessage(message) {
  if (message.conversationId !== activeConversationId) return;
  showDateIfNeeded(message.createdAt);
  ui.addMessage(message, false, deleteOwnMessage);
  ui.scrollMessages();
}

function handleTyping(signal) {
  if (signal.conversationId && signal.conversationId !== activeConversationId) return;
  ui.els.typing.textContent = signal.isTyping && activeOtherUser ? `${activeOtherUser.displayName} is typing...` : "";
  if (signal.isTyping) {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => ui.els.typing.textContent = "", 2400);
  }
}

async function openConversation(item) {
  if (activeConversationId && activeConversationId !== item.id) unsubscribeFromConversation(activeConversationId);
  activeConversationId = item.id;
  activeOtherUser = item.user;
  lastDateShown = "";
  ui.els.emptyChat.classList.add("hidden");
  ui.els.chatView.classList.remove("hidden");
  ui.setChatUser(activeOtherUser);
  ui.renderConversations(conversations, activeConversationId);
  ui.els.messages.replaceChildren();
  ui.els.typing.textContent = "";
  subscribeToConversation(activeConversationId);
  watchPresence(activeOtherUser.uid);

  // History is loaded once when opening a conversation; messages never use onValue.
  const snapshot = await get(ref(db, `messages/${activeConversationId}`));
  const history = Object.entries(snapshot.val() || {}).map(([key, message]) => ({ key, ...message })).sort((a, b) => a.createdAt - b.createdAt);
  history.forEach(message => {
    showDateIfNeeded(message.createdAt);
    ui.addMessage(message, message.uid === currentUser.uid, deleteOwnMessage);
  });
  ui.scrollMessages();
  document.body.classList.add("chat-open");
}

function watchPresence(uid) {
  if (presenceStop) presenceStop();
  presenceStop = onValue(ref(db, `users/${uid}/online`), snapshot => {
    const online = snapshot.val() === true;
    ui.els.chatStatus.className = `status ${online ? "online" : ""}`;
    ui.els.chatStatus.innerHTML = `<i></i>${online ? "Online" : "Offline"}`;
  });
}

async function sendMessage(event) {
  event.preventDefault();
  const text = ui.els.messageInput.value.trim();
  if (!text || !activeConversationId || !activeOtherUser) return;
  const messageRef = push(ref(db, `messages/${activeConversationId}`));
  const message = { key: messageRef.key, conversationId: activeConversationId, uid: currentUser.uid, text, createdAt: Date.now() };
  showDateIfNeeded(message.createdAt);
  ui.addMessage(message, true, deleteOwnMessage);
  ui.scrollMessages();
  ui.els.messageInput.value = "";
  ui.els.messageInput.style.height = "auto";
  sendTypingSignal(activeConversationId, currentUser.uid, false);
  try {
    await set(messageRef, message);
    await update(ref(db, `conversations/${activeConversationId}`), { lastMessage: { text, uid: currentUser.uid, createdAt: message.createdAt }, updatedAt: message.createdAt });
    publishMessage(activeConversationId, message);
  } catch (error) {
    ui.toast(authError(error), "error");
  }
}

async function deleteOwnMessage(key, row) {
  if (!activeConversationId) return;
  await remove(ref(db, `messages/${activeConversationId}/${key}`));
  row.remove();
}

async function deleteConversation() {
  if (!activeConversationId || !confirm("Delete this conversation for you and the other person?")) return;
  await Promise.all([
    remove(ref(db, `conversations/${activeConversationId}`)),
    remove(ref(db, `messages/${activeConversationId}`))
  ]);
  unsubscribeFromConversation(activeConversationId);
  activeConversationId = null;
  activeOtherUser = null;
  ui.els.chatView.classList.add("hidden");
  ui.els.emptyChat.classList.remove("hidden");
  document.body.classList.remove("chat-open");
  ui.toast("Conversation deleted");
}

async function setPresence(user) {
  const onlineRef = ref(db, `users/${user.uid}/online`);
  await update(ref(db, `users/${user.uid}`), { uid: user.uid, email: user.email, displayName: user.displayName || "Nexus user", online: true });
  await onDisconnect(onlineRef).set(false);
}

function searchUsers(value) {
  const term = value.trim().toLowerCase();
  ui.renderSearchResults(term ? users.filter(user => `${user.displayName} ${user.email}`.toLowerCase().includes(term)).slice(0, 8) : []);
}

function bindEvents() {
  let signUpMode = false;
  ui.setAuthMode(false);
  ui.els.authSwitch.addEventListener("click", () => { signUpMode = !signUpMode; ui.setAuthMode(signUpMode); });
  ui.els.authForm.addEventListener("submit", async event => {
    event.preventDefault();
    ui.els.authError.textContent = "";
    try {
      if (signUpMode) await register(ui.els.emailInput.value.trim(), ui.els.passwordInput.value, ui.els.nameInput.value.trim() || "Nexus user");
      else await login(ui.els.emailInput.value.trim(), ui.els.passwordInput.value);
    } catch (error) { ui.els.authError.textContent = authError(error); }
  });
  ui.els.logoutButton.addEventListener("click", () => logout().catch(error => ui.toast(authError(error), "error")));
  ui.els.searchInput.addEventListener("input", event => searchUsers(event.target.value));
  ui.els.searchResults.addEventListener("click", event => { const result = event.target.closest("[data-uid]"); if (result) startConversation(userRecord(result.dataset.uid)); });
  ui.els.conversations.addEventListener("click", event => { const button = event.target.closest("[data-conversation-id]"); const item = conversations.find(conversation => conversation.id === button?.dataset.conversationId); if (item) openConversation(item); });
  ui.els.modalForm.addEventListener("submit", async event => { event.preventDefault(); const name = ui.els.modalInput.value.trim(); if (!name) return; try { await changeDisplayName(currentUser, name); await update(ref(db, `users/${currentUser.uid}`), { displayName: name }); ui.els.currentName.replaceChildren(ui.nameMarkup(name)); if (activeOtherUser) ui.setChatUser(activeOtherUser); ui.els.modal.classList.add("hidden"); ui.toast("Profile updated"); } catch (error) { ui.toast(authError(error), "error"); } });
  ui.els.editProfile.addEventListener("click", () => { ui.els.modalInput.value = currentUser?.displayName || ""; ui.els.modal.classList.remove("hidden"); });
  ui.els.closeModal.addEventListener("click", () => ui.els.modal.classList.add("hidden"));
  ui.els.deleteConversation.addEventListener("click", deleteConversation);
  ui.els.composer.addEventListener("submit", sendMessage);
  ui.els.messageInput.addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ui.els.composer.requestSubmit(); } });
  ui.els.messageInput.addEventListener("input", () => { ui.els.messageInput.style.height = "auto"; ui.els.messageInput.style.height = `${Math.min(ui.els.messageInput.scrollHeight, 140)}px`; if (activeConversationId) { sendTypingSignal(activeConversationId, currentUser.uid, true); clearTimeout(typingTimer); typingTimer = setTimeout(() => sendTypingSignal(activeConversationId, currentUser.uid, false), 1100); } });
  ui.els.emojiButton.addEventListener("click", () => ui.els.emojiPicker.classList.toggle("hidden"));
  ui.els.emojiPicker.replaceChildren(...emojis.map(emoji => { const button = document.createElement("button"); button.type = "button"; button.textContent = emoji; button.addEventListener("click", () => { ui.els.messageInput.value += emoji; ui.els.messageInput.focus(); }); return button; }));
  ui.els.backButton.addEventListener("click", () => document.body.classList.remove("chat-open"));
  ui.els.menuButton?.addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
}

function beginSession(user) {
  currentUser = user;
  ui.showAuth(false);
  ui.els.currentName.replaceChildren(ui.nameMarkup(user.displayName || "Nexus user"));
  ui.els.currentEmail.textContent = user.email || "";
  ui.avatar(user.displayName, ui.els.currentAvatar);
  setPresence(user).catch(error => ui.toast(authError(error), "error"));
  loadUsers().then(watchConversations).catch(error => ui.toast(authError(error), "error"));
  initPubNub(user, { onMessage: handleIncomingMessage, onTyping: handleTyping });
}

onAuthStateChanged(auth, user => { if (user) beginSession(user); else { currentUser = null; ui.showAuth(true); } });
bindEvents();

// Lightweight ambient particle field, independent from the app data flow.
const canvas = document.querySelector("#particles");
const context = canvas.getContext("2d");
const particles = Array.from({ length: 42 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + .4, vx: (Math.random() - .5) * .00025, vy: (Math.random() - .5) * .00025 }));
function drawParticles() { canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio; context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); context.clearRect(0, 0, innerWidth, innerHeight); context.fillStyle = "rgba(168,85,247,.42)"; particles.forEach(particle => { particle.x = (particle.x + particle.vx + 1) % 1; particle.y = (particle.y + particle.vy + 1) % 1; context.beginPath(); context.arc(particle.x * innerWidth, particle.y * innerHeight, particle.r, 0, Math.PI * 2); context.fill(); }); requestAnimationFrame(drawParticles); }
addEventListener("resize", drawParticles);
drawParticles();
