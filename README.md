# Campus Buzz - The Campus Coordination Platform

Campus Buzz is a verified, students-first social layer built for college life. It is a real-time coordination platform where students can split cabs/food, clubs can post official updates, and anonymous concerns can be raised. 

## 🏗️ Architecture & Engineering Decisions

To ensure a lightweight, fast, and dependency-free backend for this MVP, the following architectural choices were made:

* **Native Node.js Backend:** The server is built entirely using Node.js core modules (`http`, `fs`, `path`, `crypto`). We bypassed heavy frameworks like Express to demonstrate a fundamental understanding of routing, stream handling, and request/response lifecycles.
* **Server-Sent Events (SSE) for Real-Time State:** Instead of polling the server or implementing heavy WebSockets, we utilized SSE (`text/event-stream`) for the Live Room chats and feed updates. This provides a fast, unidirectional data flow that instantly syncs client states when the server broadcasts an update.
* **Server-Side Role Gating:** All actions are strictly gated at the API level via custom middleware (`needUser()`). Even if the client-side UI is manipulated, the server validates the user's role (Student, Club, or Admin) before allowing database mutations.
* **Background Job for Expiry:** Split/Share posts require auto-deletion. A background `setInterval` worker constantly checks and updates expired posts independently of incoming HTTP requests, ensuring accurate state management.
* **JSON File-System Database:** For this MVP, data is persisted locally in `data/db.json` with a seeder script that auto-generates the required mock profiles and initial posts upon the first launch.


  Acess to the project directly through rander link https://buildverse-ng0j.onrender.com
  
