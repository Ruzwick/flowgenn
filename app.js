// GlassTask - Firebase Task Manager
// Features: Google Auth, Firestore realtime sync, offline persistence, responsive UI

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  enableIndexedDbPersistence,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

// ---- Firebase Config (provided by user) ----
const firebaseConfig = {
  apiKey: "AIzaSyAYYq3uWBzUfuVX5H6dzadmRzqRrvNk-3o",
  authDomain: "glasstask-f4a65.firebaseapp.com",
  projectId: "glasstask-f4a65",
  storageBucket: "glasstask-f4a65.firebasestorage.app",
  messagingSenderId: "512175308976",
  appId: "1:512175308976:web:0d1710528a983cd4133b75",
  measurementId: "G-EB1T4LSXG4",
};

// ---- Initialization ----
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Enable offline persistence (gracefully fallback on multi-tab)
enableIndexedDbPersistence(db).catch(() => {
  // ignore; Firestore will still work online
});

// ---- DOM Elements ----
const authButton = document.getElementById("authButton");
const userInfo = document.getElementById("userInfo");
const userNameEl = document.getElementById("userName");
const userPhotoEl = document.getElementById("userPhoto");
const heroSignIn = document.getElementById("heroSignIn");
const signedOutHero = document.getElementById("signedOutHero");
const appSection = document.getElementById("appSection");

const addTaskForm = document.getElementById("addTaskForm");
const taskInput = document.getElementById("taskInput");
const dueInput = document.getElementById("dueInput");
const taskList = document.getElementById("taskList");
const taskMeta = document.getElementById("taskMeta");
const clearCompletedBtn = document.getElementById("clearCompleted");
const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));

// ---- State ----
let currentUser = null;
let unsubscribeTasks = null;
let currentFilter = "all"; // all | active | completed

// ---- Auth ----
// TODO: Replace with your Firebase Web Client ID from Firebase Console:
// Authentication → Sign-in method → Google → Web SDK configuration → Web client ID
// This ensures Google Auth works with your Firebase project
const WEB_CLIENT_ID = "512175308976-n0f58scesvcfnfcbb8jbta2lo0en4947.apps.googleusercontent.com";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  client_id: WEB_CLIENT_ID
});

async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    alert(`Sign-in failed: ${err.message}`);
  }
}

async function signOutUser() {
  try {
    await signOut(auth);
  } catch (err) {
    alert(`Sign-out failed: ${err.message}`);
  }
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateAuthUI(user);
  if (user) {
    startTasksListener(user.uid);
  } else {
    stopTasksListener();
    renderTasks([]);
  }
});

function updateAuthUI(user) {
  const isSignedIn = Boolean(user);
  signedOutHero.hidden = isSignedIn;
  appSection.hidden = !isSignedIn;

  if (isSignedIn) {
    userInfo.hidden = false;
    userNameEl.textContent = user.displayName || user.email || "User";
    if (user.photoURL) {
      userPhotoEl.src = user.photoURL;
    } else {
      userPhotoEl.removeAttribute("src");
    }
    authButton.textContent = "Sign out";
    authButton.onclick = signOutUser;
  } else {
    userInfo.hidden = true;
    authButton.textContent = "Sign in with Google";
    authButton.onclick = signInWithGoogle;
  }
}

authButton.addEventListener("click", () => {
  if (currentUser) signOutUser(); else signInWithGoogle();
});
heroSignIn.addEventListener("click", signInWithGoogle);

// ---- Firestore: Tasks ----
function tasksCollectionRef(uid) {
  return collection(db, "users", uid, "tasks");
}

function startTasksListener(uid) {
  stopTasksListener();
  const q = query(tasksCollectionRef(uid), orderBy("createdAt", "desc"));
  unsubscribeTasks = onSnapshot(q, (snapshot) => {
    const tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTasks(tasks);
  });
}

function stopTasksListener() {
  if (unsubscribeTasks) {
    unsubscribeTasks();
    unsubscribeTasks = null;
  }
}

async function addTask(title, dueDate) {
  if (!currentUser) return;
  const trimmed = title.trim();
  if (!trimmed) return;
  await addDoc(tasksCollectionRef(currentUser.uid), {
    title: trimmed,
    completed: false,
    dueDate: dueDate || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

async function toggleTask(taskId, completed) {
  if (!currentUser) return;
  const ref = doc(tasksCollectionRef(currentUser.uid), taskId);
  await updateDoc(ref, { completed, updatedAt: serverTimestamp() });
}

async function updateTaskTitle(taskId, newTitle) {
  if (!currentUser) return;
  const trimmed = newTitle.trim();
  if (!trimmed) return;
  const ref = doc(tasksCollectionRef(currentUser.uid), taskId);
  await updateDoc(ref, { title: trimmed, updatedAt: serverTimestamp() });
}

async function deleteTask(taskId) {
  if (!currentUser) return;
  const ref = doc(tasksCollectionRef(currentUser.uid), taskId);
  await deleteDoc(ref);
}

async function clearCompletedTasks(taskArray) {
  if (!currentUser) return;
  const batch = writeBatch(db);
  for (const task of taskArray) {
    if (task.completed) {
      const ref = doc(tasksCollectionRef(currentUser.uid), task.id);
      batch.delete(ref);
    }
  }
  await batch.commit();
}

// ---- UI Rendering ----
let lastTasks = [];

function renderTasks(tasks) {
  lastTasks = tasks;
  const filtered = tasks.filter((t) => {
    if (currentFilter === "active") return !t.completed;
    if (currentFilter === "completed") return t.completed;
    return true;
  });

  taskList.innerHTML = "";

  for (const task of filtered) {
    const li = document.createElement("li");
    li.className = `task-item${task.completed ? " completed" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(task.completed);
    checkbox.addEventListener("change", () => toggleTask(task.id, checkbox.checked));

    const main = document.createElement("div");
    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = task.title;

    const details = document.createElement("div");
    details.className = "task-details";
    if (task.dueDate) {
      const due = new Date(task.dueDate);
      const dueStr = due.toLocaleDateString();
      const dueEl = document.createElement("span");
      dueEl.textContent = `Due ${dueStr}`;
      details.appendChild(dueEl);
    }

    main.appendChild(title);
    main.appendChild(details);

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn edit";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openEditPrompt(task));

    const delBtn = document.createElement("button");
    delBtn.className = "icon-btn delete";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", () => deleteTask(task.id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(checkbox);
    li.appendChild(main);
    li.appendChild(actions);
    taskList.appendChild(li);
  }

  const total = tasks.length;
  const active = tasks.filter(t => !t.completed).length;
  const completed = total - active;
  taskMeta.textContent = `${active} active • ${completed} completed • ${total} total`;
}

function openEditPrompt(task) {
  const newTitle = prompt("Edit task", task.title);
  if (newTitle != null) {
    updateTaskTitle(task.id, newTitle);
  }
}

// ---- Events ----
addTaskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = taskInput.value;
  const due = dueInput.value || null;
  await addTask(title, due);
  taskInput.value = "";
  // do not clear due date to allow rapid entry
});

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    currentFilter = btn.dataset.filter;
    renderTasks(lastTasks);
  });
});

clearCompletedBtn.addEventListener("click", () => clearCompletedTasks(lastTasks));

// ---- PWA Hints (optional future work) ----
// You can add a manifest and service worker for installability if desired.


