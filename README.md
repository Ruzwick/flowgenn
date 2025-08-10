### GlassTask — Firebase Task Manager

A responsive, glassmorphism-styled task manager with Google sign-in and Firestore realtime sync. Works on desktop, tablets, and phones. Includes offline persistence.

#### Features
- Google Authentication (Firebase Auth)
- Realtime task sync via Firestore
- Per-user task storage (`users/{uid}/tasks`)
- Add, edit, complete, delete tasks; filter and clear completed
- Offline-ready with IndexedDB persistence
- Responsive glass UI

#### Getting Started
1. Serve locally (to use ES module imports from Firebase CDN, open with a local server):
```bash
python -m http.server 5173
# or
npx serve . -l 5173
```
Visit `http://localhost:5173`.

2. Enable Google provider in Firebase Console → Authentication → Sign-in method.

3. Firestore security rules (recommended minimal):
```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/tasks/{taskId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

#### Project Structure
- `index.html` — markup
- `styles.css` — styles
- `app.js` — Firebase logic

#### Deploy
Push to GitHub Pages or any static host. No build step required.


