# LMK — Let Me Know

Canvas tells you what's due. **LMK tells you what to do today.**

A student assignment planner that reads your Canvas, sizes each assignment,
and gives you one short daily list with an honest time budget. It measures how
long your work actually takes and gets more accurate every week.

- **Homepage** — `index.html`
- **App** — `app/index.html` (single file, no build step, no framework)
- **Privacy policy** — `privacy.html`
- **Browser extension** — see the `lmk-extension` folder in the sibling repo/folder

## Running locally

```sh
python3 -m http.server 8899
# then open http://localhost:8899/
```

## Cross-device sync (optional)

The app works fully offline, saving to the browser on each device. To let a
student sync a phone and a laptop, create a Google OAuth client and paste its
id into `LMK_CONFIG.googleClientId` near the top of the script in
`app/index.html`:

1. console.cloud.google.com → new project → **APIs & Services**
2. Enable the **Google Drive API**
3. **OAuth consent screen** → External → add the `drive.file` scope (non-sensitive:
   no Google verification, no warning screen, no 100-user cap)
4. **Credentials** → Create OAuth client ID → *Web application*
5. Add the site origin under **Authorized JavaScript origins**
6. Copy the client id into `LMK_CONFIG.googleClientId`

Data is written as `LMK-data.json` in the student's own Drive. The `drive.file`
scope means LMK can only ever see the file it created, never the rest of their
Drive — which is why it needs no Google review to publish.

## Deploying

Any static host works. GitHub Pages:

```sh
git push -u origin main
gh repo edit --enable-pages --pages-branch main
```
