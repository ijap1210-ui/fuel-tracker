# Fuel Tracker

A small web app for logging fill-ups on your iPhone. It shows your fuel consumption, cost per km or mile,
monthly spending and a history of every fill-up. You install it with Safari's **Add to Home Screen**, so you
don't need a Mac, the App Store or an Apple developer account.

## Two ways to use it

### 1. The Claude link (nothing to set up)

Use the private claude.ai link from the chat where this app was made.

1. On your iPhone, open the link in **Safari** and sign in to Claude.
2. Tap **Share**, then **Add to Home Screen**.

Your log is saved in your Claude account, so you see the same data on your phone and your computer, and you
can ask Claude about it later. It needs an internet connection and a Claude sign-in. The link is private
until you share it from its Share menu.

### 2. Your own copy (works offline, no sign-in)

Put the files on any free static host, then add that address to your Home Screen. With this option your log
is kept **on the phone only**, so use **Settings → Save a backup** now and then.

Upload these files and keep the folder layout:

```
index.html  app.css  calc.js  store.js  charts.js  app.js  forms.js
manifest.webmanifest  sw.js  icons/icon-180.png  icons/icon-192.png  icons/icon-512.png
```

`artifact.html` is only used for the Claude link; you can leave it out.

**GitHub Pages (free):**
1. Create a GitHub account if you don't have one, then make a new **public** repository, for example `fuel-tracker`.
2. Click **Add file → Upload files** and drag in the files above (including the `icons` folder). Commit.
3. Open **Settings → Pages**, set **Source** to *Deploy from a branch*, branch `main`, folder `/ (root)`, and save.
4. After a minute the app is at `https://<your-username>.github.io/fuel-tracker/`.

**Netlify Drop (alternative):** go to https://app.netlify.com/drop, drag the `fuel-tracker` folder onto the
page and sign up for a free account so the site stays online.

Then on the iPhone: open the address in **Safari → Share → Add to Home Screen**. It opens full screen with its
own icon and keeps working without signal.

When you change any file later, also change `VERSION` in `sw.js` (for example to `fuel-tracker-v2`), upload
again, and open the app twice on the phone to pick up the new copy.

## How consumption is measured

Full-tank method: fill to the top and log it. At the next full tank, the app divides all the fuel you added
since the previous full tank, partial top-ups included, by the distance driven. Your first fill-up is the
starting point, so the first figure appears after your second full tank. If you forget to log a fill-up, turn on
**Missed logging a fill-up** on the next one and that stretch is skipped instead of counted wrong.

## Try it on your computer

From this folder, run:

```
python -m http.server 8765 --bind 127.0.0.1
```

Then open http://localhost:8765 in a browser.

## Files

| File | What it does |
|---|---|
| `calc.js` | Units, number parsing, consumption math, CSV export, sample data |
| `store.js` | Saving: Claude's database inside the Claude link, browser storage everywhere else |
| `charts.js` | The two charts |
| `app.js` | App shell, Overview and History screens |
| `forms.js` | Add/Edit fill-up and Settings screens |
| `index.html`, `manifest.webmanifest`, `sw.js`, `icons/` | Home-screen app wrapper and offline support |
| `artifact.html` | Page used for the Claude link |

## Why not a regular App Store app?

Building a native iPhone app needs Xcode, which only runs on a Mac. Keeping your own app installed on your
phone also needs the Apple Developer Program (US$99 a year); with a free Apple account the app stops opening
after 7 days until you reinstall it from the Mac. A Home Screen web app avoids all of that.
