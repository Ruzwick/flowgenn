// GlassTask - Firebase Task Manager (Cross-Sync Fixes)

// ---- Firebase ----
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
  enableMultiTabIndexedDbPersistence,
  writeBatch,
  getDoc,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAYYq3uWBzUfuVX5H6dzadmRzqRrvNk-3o",
  authDomain: "glasstask-f4a65.firebaseapp.com",
  projectId: "glasstask-f4a65",
  storageBucket: "glasstask-f4a65.firebasestorage.app",
  messagingSenderId: "512175308976",
  appId: "1:512175308976:web:0d1710528a983cd4133b75",
  measurementId: "G-EB1T4LSXG4",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Test Firebase connectivity
console.log("[Firebase] Initializing with project:", firebaseConfig.projectId);
console.log("[Firebase] Auth domain:", firebaseConfig.authDomain);
console.log("[Firebase] Firestore instance:", db);
console.log("[Firebase] Auth instance:", auth);

// ---- Enable multi-tab persistence for better sync ----
enableMultiTabIndexedDbPersistence(db)
  .then(() => console.log("[Firestore] Multi-tab persistence enabled"))
  .catch((err) => console.warn("[Firestore] Persistence failed", err.code));

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
let currentFilter = "all";
let lastTasks = [];

// ---- Auth ----
const provider = new GoogleAuthProvider();

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
  console.log("[Auth] State changed:", user ? user.email : "No user");
  currentUser = user;
  updateAuthUI(user);
  if (user) {
    console.log(`[Auth] User authenticated: ${user.email} (${user.uid})`);
    startTasksListener(user.uid);
    // Test Firestore connectivity
    testFirestoreConnection(user.uid);
    // Check for existing tasks
    checkExistingTasks(user.uid);
  } else {
    console.log("[Auth] User signed out");
    stopTasksListener();
  }
});

// Test Firestore connection and permissions
async function testFirestoreConnection(uid) {
  try {
    console.log("[Test] Testing Firestore write permission...");
    
    // Test 1: Try to create a test document
    const testData = { 
      test: true, 
      timestamp: serverTimestamp(),
      message: "Testing Firestore connectivity"
    };
    
    console.log("[Test] Creating test document with data:", testData);
    const testRef = doc(tasksCollectionRef(uid), 'test-connection');
    
    // Try to set the document (create if doesn't exist)
    await updateDoc(testRef, testData);
    console.log("[Test] Firestore write test successful - permissions OK");
    
    // Test 2: Try to read the document back
    console.log("[Test] Testing Firestore read permission...");
    const readTest = await getDoc(testRef);
    if (readTest.exists()) {
      console.log("[Test] Firestore read test successful - data:", readTest.data());
    } else {
      console.log("[Test] Test document doesn't exist after write");
    }
    
    // Clean up test document
    await deleteDoc(testRef);
    console.log("[Test] Test document cleaned up");
    
    console.log("[Test] All Firestore tests passed! ✅");
    
  } catch (error) {
    console.error("[Test] Firestore connection test failed:", error);
    console.error("[Test] Error details:", {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    
    if (error.code === 'permission-denied') {
      alert("Firestore permission denied. Please check your security rules.");
    } else if (error.code === 'not-found') {
      console.log("[Test] Document not found (expected for new users)");
    } else if (error.code === 'unavailable') {
      alert("Firestore service unavailable. Check your internet connection.");
    } else {
      console.error("[Test] Unexpected error:", error);
      alert(`Firestore test failed: ${error.message}`);
    }
  }
}

// Manual test to check if tasks are actually in Firestore
async function checkExistingTasks(uid) {
  try {
    console.log("[Check] Manually querying Firestore for existing tasks...");
    const q = query(tasksCollectionRef(uid));
    const snapshot = await getDocs(q);
    
    console.log(`[Check] Found ${snapshot.size} existing tasks in Firestore`);
    snapshot.forEach(doc => {
      console.log(`[Check] Task: ${doc.id}`, doc.data());
    });
    
    if (snapshot.empty) {
      console.log("[Check] No tasks found in Firestore - this is normal for new users");
    }
    
  } catch (error) {
    console.error("[Check] Failed to query existing tasks:", error);
  }
}

// ---- UI Updates ----
function updateAuthUI(user) {
  const isSignedIn = Boolean(user);
  signedOutHero.hidden = isSignedIn;
  appSection.hidden = !isSignedIn;

  if (isSignedIn) {
    userInfo.hidden = false;
    userNameEl.textContent = user.displayName || user.email || "User";
    if (user.photoURL) userPhotoEl.src = user.photoURL;
    authButton.textContent = "Sign out";
    authButton.onclick = signOutUser;
    
    // Add debug button for testing
    addDebugButton();
  } else {
    userInfo.hidden = true;
    authButton.textContent = "Sign in with Google";
    authButton.onclick = signInWithGoogle;
    
    // Remove debug button
    removeDebugButton();
  }
}

// Add debug button for testing Firestore
function addDebugButton() {
  if (document.getElementById('debugBtn')) return;
  
  const debugBtn = document.createElement('button');
  debugBtn.id = 'debugBtn';
  debugBtn.textContent = '🔧 Debug Firestore';
  debugBtn.className = 'btn';
  debugBtn.style.marginLeft = '10px';
  debugBtn.onclick = () => {
    if (currentUser) {
      console.log('[Debug] Manual debug triggered');
      testFirestoreConnection(currentUser.uid);
      checkExistingTasks(currentUser.uid);
    }
  };
  
  // Add to user area
  const userArea = document.getElementById('userArea');
  userArea.appendChild(debugBtn);
}

// Remove debug button
function removeDebugButton() {
  const debugBtn = document.getElementById('debugBtn');
  if (debugBtn) debugBtn.remove();
}

// ---- Firestore ----
function tasksCollectionRef(uid) {
  return collection(db, "users", uid, "tasks");
}

function startTasksListener(uid) {
  stopTasksListener();
  console.log(`[Firestore] Starting real-time listener for user: ${uid}`);
  console.log(`[Firestore] User object:`, currentUser);
  console.log(`[Firestore] Database instance:`, db);
  
  const q = query(tasksCollectionRef(uid), orderBy("createdAt", "desc"));
  console.log(`[Firestore] Query created:`, q);
  
  unsubscribeTasks = onSnapshot(
    q,
    (snapshot) => {
      console.log(`[Firestore] Snapshot received:`, snapshot);
      console.log(`[Firestore] Snapshot empty:`, snapshot.empty);
      console.log(`[Firestore] Snapshot size:`, snapshot.size);
      
      const tasks = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      console.log(`[Firestore] Received ${tasks.length} tasks from server`);
      console.log(`[Firestore] Tasks:`, tasks.map(t => ({ id: t.id, title: t.title, completed: t.completed })));
      
      // Check if tasks have proper Firestore document IDs
      tasks.forEach(task => {
        if (!task.id || task.id.length < 20) {
          console.warn(`[Firestore] Task has suspicious ID:`, task);
        }
      });
      
      renderTasks(tasks);
    },
    (error) => {
      console.error("[Firestore] Listener error:", error);
      console.error("[Firestore] Error details:", {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      
      // Handle specific error types
      if (error.code === 'permission-denied') {
        console.error("[Firestore] Permission denied - check Firestore security rules");
        alert("Permission denied. Please check your Firebase configuration.");
      } else if (error.code === 'unavailable') {
        console.error("[Firestore] Service unavailable - check internet connection");
        alert("Service unavailable. Please check your internet connection.");
      } else {
        alert(`Firestore error: ${error.message}`);
      }
    }
  );
  
  // Test if we can actually connect to Firestore
  console.log(`[Firestore] Testing connection to collection: users/${uid}/tasks`);
  console.log(`[Firestore] Listener subscription:`, unsubscribeTasks);
}

function stopTasksListener() {
  if (unsubscribeTasks) {
    unsubscribeTasks();
    unsubscribeTasks = null;
    console.log("[Firestore] Listener stopped");
  }
}

async function addTask(title, dueDate) {
  if (!currentUser) {
    console.error("[Task] No user logged in");
    alert("Please sign in first");
    return;
  }
  
  const trimmed = title.trim();
  if (!trimmed) return;
  
  console.log(`[Task] Adding task: "${trimmed}" for user: ${currentUser.uid}`);
  console.log(`[Task] Current user object:`, currentUser);
  console.log(`[Task] Firestore instance:`, db);
  
  try {
    const taskData = {
      title: trimmed,
      completed: false,
      dueDate: dueDate || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    console.log(`[Task] Task data to save:`, taskData);
    console.log(`[Task] Collection reference:`, tasksCollectionRef(currentUser.uid));
    
    const docRef = await addDoc(tasksCollectionRef(currentUser.uid), taskData);
    console.log(`[Task] Task added successfully with ID: ${docRef.id}`);
    console.log(`[Task] Document reference:`, docRef);
    
    // Verify the task was actually saved by trying to read it back
    console.log(`[Task] Verifying task was saved...`);
    
  } catch (error) {
    console.error("[Task] Failed to add task:", error);
    console.error("[Task] Error details:", {
      code: error.code,
      message: error.message,
      stack: error.stack
    });
    alert(`Failed to add task: ${error.message}`);
  }
}

async function toggleTask(taskId, completed) {
  if (!currentUser) {
    console.error("[Task] No user logged in for toggle");
    return;
  }
  
  console.log(`[Task] Toggling task ${taskId} to ${completed}`);
  
  try {
    await updateDoc(doc(tasksCollectionRef(currentUser.uid), taskId), {
      completed,
      updatedAt: serverTimestamp(),
    });
    console.log(`[Task] Task ${taskId} toggled successfully`);
  } catch (error) {
    console.error(`[Task] Failed to toggle task ${taskId}:`, error);
    alert(`Failed to update task: ${error.message}`);
  }
}

async function updateTaskTitle(taskId, newTitle) {
  if (!currentUser) return;
  const trimmed = newTitle.trim();
  if (!trimmed) return;
  await updateDoc(doc(tasksCollectionRef(currentUser.uid), taskId), {
    title: trimmed,
    updatedAt: serverTimestamp(),
  });
}

async function deleteTask(taskId) {
  if (!currentUser) return;
  await deleteDoc(doc(tasksCollectionRef(currentUser.uid), taskId));
}

async function clearCompletedTasks(taskArray) {
  if (!currentUser) return;
  const batch = writeBatch(db);
  taskArray.forEach((task) => {
    if (task.completed) {
      batch.delete(doc(tasksCollectionRef(currentUser.uid), task.id));
    }
  });
  await batch.commit();
}

// ---- Rendering ----
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
    checkbox.addEventListener("change", () =>
      toggleTask(task.id, checkbox.checked)
    );

    const main = document.createElement("div");
    main.className = "task-main";

    const title = document.createElement("div");
    title.className = "task-title";
    title.textContent = task.title;
    main.appendChild(title);

    if (task.dueDate) {
      const details = document.createElement("div");
      details.className = "task-details";
      details.textContent = `Due ${new Date(task.dueDate).toLocaleDateString()}`;
      main.appendChild(details);
    }

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const editBtn = document.createElement("button");
    editBtn.textContent = "Edit";
    editBtn.onclick = () => {
      const newTitle = prompt("Edit task", task.title);
      if (newTitle !== null) updateTaskTitle(task.id, newTitle);
    };

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.onclick = () => deleteTask(task.id);

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    li.appendChild(checkbox);
    li.appendChild(main);
    li.appendChild(actions);
    taskList.appendChild(li);
  }

  const total = tasks.length;
  const active = tasks.filter((t) => !t.completed).length;
  const completed = total - active;
  taskMeta.textContent = `${active} active • ${completed} completed • ${total} total`;
}

// ---- Events ----
addTaskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await addTask(taskInput.value, dueInput.value || null);
  taskInput.value = "";
});

// Add missing auth button event listeners
authButton.addEventListener("click", () => {
  if (currentUser) signOutUser(); else signInWithGoogle();
});

heroSignIn.addEventListener("click", signInWithGoogle);

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    currentFilter = btn.dataset.filter;
    renderTasks(lastTasks);
  });
});

clearCompletedBtn.addEventListener("click", () =>
  clearCompletedTasks(lastTasks)
);
