// Nexus by AstroFlux — PubNub real-time delivery + typing signals
import { PUBNUB_PUBLISH_KEY, PUBNUB_SUBSCRIBE_KEY } from "./config.js";

// PubNub SDK is loaded globally via CDN <script> in index.html (window.PubNub).
let pn = null;
let listenerAdded = false;

// Module-level state used by the message listener.
let currentUser = null;
let activeConversationId = null;
let onMessageArrived = null;   // callback(messageObj)
let onTypingArrived = null;    // callback({fromUid, isTyping})

export function initPubNub(user, handlers) {
  currentUser = user;
  onMessageArrived = handlers.onMessage;
  onTypingArrived = handlers.onTyping;

  if (!pn) {
    pn = new PubNub({
      publishKey: PUBNUB_PUBLISH_KEY,
      subscribeKey: PUBNUB_SUBSCRIBE_KEY,
      uuid: user.uid,
      heartbeatInterval: 30
    });
  }

  // Listener added ONCE — never re-added anywhere else.
  if (!listenerAdded) {
    pn.addListener({
      message: (ev) => {
        const msg = ev.message;
        if (!msg) return;
        // Filter: ignore our own messages (already shown on sender screen).
        if (msg.uid === currentUser.uid) return;
        if (onMessageArrived) onMessageArrived(msg);
      },
      signal: (ev) => {
        const sig = ev.message;
        if (!sig) return;
        if (sig.type === "typing" && sig.fromUid !== currentUser.uid) {
          if (onTypingArrived) onTypingArrived(sig);
        }
      }
    });
    listenerAdded = true;
  }
}

export function subscribeToConversation(conversationId) {
  activeConversationId = conversationId;
  if (!pn) return;
  pn.subscribe({ channels: [conversationId] });
}

export function unsubscribeFromConversation(conversationId) {
  if (!pn || !conversationId) return;
  pn.unsubscribe({ channels: [conversationId] });
  if (activeConversationId === conversationId) activeConversationId = null;
}

export function publishMessage(conversationId, messageObj) {
  if (!pn) return;
  pn.publish({
    channel: conversationId,
    message: messageObj
  });
}

export function sendTypingSignal(conversationId, fromUid, isTyping) {
  if (!pn) return;
  pn.signal({
    channel: conversationId,
    message: { type: "typing", fromUid, isTyping }
  });
}
