# PrivaMed Client (UI)

This folder contains the React UI for the PrivaMed lab demo.

Run locally (requires Node.js >= 16):

```powershell
cd client
npm install
npm start
```

The UI will try to call a backend at `http://localhost:3333` by default. If no backend is available the app will simulate record storage locally for the demo.

Set `REACT_APP_BACKEND_URL` to point to a running backend if you have one.
