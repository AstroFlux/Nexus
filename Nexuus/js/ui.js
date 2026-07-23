const $ = (selector) => document.querySelector(selector);

export const els = {
  authScreen: $("#auth-screen"),
  appScreen: $("#app-screen"),
  authForm: $("#auth-form"),
  authTitle: $("#auth-title"),
  nameField: $("#name-field"),
  nameInput: $("#display-name"),
  emailInput: $("#email"),
  passwordInput: $("#password"),
  authSubmit: $("#auth-submit"),
  authSwitch: $("#auth-switch"),
  authError: $("#auth-error"),
  currentAvatar: $("#current-avatar"),
  currentName: $("#current-name"),
  currentEmail: $("#current-email"),
  conversations: $("#conversations"),
  searchInput: $("#search-input"),
  searchResults: $("#search-results"),
  emptyChat: $("#empty-chat"),
  chatView: $("#chat-view"),
  chatAvatar: $("#chat-avatar"),
  chatName: $("#chat-name"),
  chatStatus: $("#chat-status"),
  messages: $("#messages"),
  composer: $("#composer"),
  messageInput: $("#message-input"),
  sendButton: $("#send-button"),
  emojiButton: $("#emoji-button"),
  emojiPicker: $("#emoji-picker"),
  typing: $("#typing"),
  menuButton: $("#menu-button"),
  backButton: $("#back-button"),
  deleteConversation: $("#delete-conversation"),
  logoutButton: $("#logout-button"),
  editProfile: $("#edit-profile"),
  toast: $("#toast"),
  modal: $("#profile-modal"),
  modalForm: $("#profile-form"),
  modalInput: $("#profile-name"),
  closeModal: $("#close-modal")
};

export function showAuth(show) {
  els.authScreen.classList.toggle("hidden", !show);
  els.appScreen.classList.toggle("hidden", show);
}

export function setAuthMode(signUp) {
  els.authTitle.textContent = signUp ? "Create your account" : "Welcome back";
  els.authSubmit.textContent = signUp ? "Create account" : "Sign in";
  els.nameField.classList.toggle("hidden", !signUp);
  els.authSwitch.innerHTML = signUp ? "Already a member? <button type=\"button\">Sign in</button>" : "New to Nexus? <button type=\"button\">Create an account</button>";
  els.authError.textContent = "";
}

export function avatar(name, element) {
  const label = (name || "?").trim().slice(0, 1).toUpperCase();
  element.textContent = label;
  element.setAttribute("aria-label", `${name || "User"} avatar`);
}

export function isDev(name) {
  return String(name || "").trim() === "ASTRO";
}

export function nameMarkup(name) {
  const wrapper = document.createElement("span");
  wrapper.textContent = name || "Unknown user";
  if (isDev(name)) {
    const badge = document.createElement("b");
    badge.className = "dev-badge";
    badge.textContent = "DEV";
    wrapper.append(" ", badge);
  }
  return wrapper;
}

export function renderConversations(items, activeId) {
  els.conversations.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "list-empty";
    empty.textContent = "No conversations yet";
    els.conversations.append(empty);
    return;
  }
  items.forEach(item => {
    const button = document.createElement("button");
    button.className = `conversation ${item.id === activeId ? "active" : ""}`;
    button.dataset.conversationId = item.id;
    const avatarEl = document.createElement("span");
    avatarEl.className = "avatar small";
    avatar(item.user.displayName, avatarEl);
    const text = document.createElement("span");
    text.className = "conversation-copy";
    const title = document.createElement("strong");
    title.append(nameMarkup(item.user.displayName));
    const preview = document.createElement("small");
    preview.textContent = item.lastMessage?.text || "Start a conversation";
    text.append(title, preview);
    button.append(avatarEl, text);
    els.conversations.append(button);
  });
}

export function renderSearchResults(users) {
  els.searchResults.replaceChildren();
  users.forEach(user => {
    const button = document.createElement("button");
    button.className = "search-result";
    button.dataset.uid = user.uid;
    const avatarEl = document.createElement("span");
    avatarEl.className = "avatar tiny";
    avatar(user.displayName, avatarEl);
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.append(nameMarkup(user.displayName));
    const email = document.createElement("small");
    email.textContent = user.email || "";
    copy.append(name, email);
    button.append(avatarEl, copy);
    els.searchResults.append(button);
  });
}

export function setChatUser(user) {
  els.chatName.replaceChildren(nameMarkup(user.displayName));
  avatar(user.displayName, els.chatAvatar);
}

export function addDateSeparator(label) {
  const separator = document.createElement("div");
  separator.className = "date-separator";
  separator.textContent = label;
  els.messages.append(separator);
}

export function addMessage(message, own, onDelete) {
  const row = document.createElement("article");
  row.className = `message-row ${own ? "own" : "other"}`;
  row.dataset.messageKey = message.key;
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  const text = document.createElement("p");
  text.textContent = message.text;
  const meta = document.createElement("footer");
  meta.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  bubble.append(text, meta);
  if (own) {
    const deleteButton = document.createElement("button");
    deleteButton.className = "message-delete";
    deleteButton.type = "button";
    deleteButton.title = "Delete message";
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => onDelete(message.key, row));
    bubble.append(deleteButton);
  }
  row.append(bubble);
  els.messages.append(row);
}

export function scrollMessages() {
  els.messages.scrollTop = els.messages.scrollHeight;
}

let toastTimer;
export function toast(message, kind = "success") {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast visible ${kind}`;
  toastTimer = setTimeout(() => els.toast.className = "toast", 3200);
}
