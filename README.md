# Tripsy

Dream up trips together: places to see, food, stays and things to do, with
photos and notes. Friends join a trip with an invite link or code. Each person
picks their own look (colors + font), and a trip can share a look of its own.

Plain HTML/JS + Firebase (Google sign-in + Firestore). No build step: the
files in this folder are the whole site (GitHub Pages).

## Files
- `index.html`, `styles.css`: the page and its looks
- `themes.js`: palettes, fonts, custom colors
- `app.js`: all the screens
- `store.js`: the database (Firebase)
- `demo.js`: sample mode, used while `firebase-config.js` still says PASTE
- `firestore.rules`: who can see and change what (deploy with `firebase deploy --only firestore:rules`)
- `sw.js`, `manifest.json`, icons: Home Screen app

## Phases
1. Sign-in, trips, ideas, Someday list, looks, invites (this version)
2. Map with custom pins, itinerary by day
3. Reminders/to-dos, shared costs (in USD), hearts
4. Link autofill, scrapbook
