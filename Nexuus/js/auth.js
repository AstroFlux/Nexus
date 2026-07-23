import {
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "./firebase.js";

export async function register(email, password, displayName) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, { displayName });
  return result.user;
}

export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password).then(result => result.user);
}

export function logout() {
  return signOut(auth);
}

export async function changeDisplayName(user, displayName) {
  await updateProfile(user, { displayName });
  return user;
}

export function authError(error) {
  const messages = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use": "That email is already registered.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Try again shortly."
  };
  return messages[error.code] || error.message || "Something went wrong.";
}
