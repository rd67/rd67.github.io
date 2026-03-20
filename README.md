# Rohit Dalal — portfolio (production)

Static site optimized for **job search**: clear narrative, **light/dark** theme (persisted), **Open Graph / Twitter** metadata, **JSON-LD**, `robots.txt`, and `sitemap.xml`.

## Configure the site

**Primary source of truth is [`config.json`](config.json)** (loaded by `app.js`):

| What to change | Where in `config.json` |
|----------------|------------------------|
| Hero, about, jobs, projects, skills, education, contact | Top-level keys: `hero`, `about`, `experience`, `projects`, `skills`, `education`, `contact` |
| Name, email, social links, photo path | `person` |
| Résumé (Google Drive) | `resumeUrl` |
| Page title, description, OG defaults (also updated at runtime) | `site` |
| Footer “All rights reserved” (per language) | `ui.rightsReserved` |

- **Bold** in text fields: wrap phrases in `**double asterisks**` (rendered as `<strong>`).
- **Résumé:** set `resumeUrl` to `https://drive.google.com/file/d/<FILE_ID>/view?usp=sharing`. While the value still contains `REPLACE`, résumé buttons stay `#`.

**Crawlers and `file://`:** Open Graph tags in `index.html` are a **fallback** for link-preview bots; `app.js` syncs title/description/OG from `config` when JS runs. Use **`python3 -m http.server`** (or any static host)—browsers block loading `config.json` from `file://`.

### Languages (EN, DE, FR, NL)

- **Default & list:** `config.json` → `i18n.defaultLocale` and `i18n.supported` (`id`, `label`, `htmlLang`, `ogLocale` per row).
- **English** copy lives in **`config.json`** (canonical).
- **Deutsch, Français, Nederlands:** same-shaped JSON in **`locales/de.json`**, **`locales/fr.json`**, **`locales/nl.json`**. Those files **override** the base when the visitor picks a language; missing keys fall back to English.
- **Persistence:** choice is stored in `localStorage` under `portfolio-locale`; first visit uses the browser language if it matches a supported `id` (e.g. `de-CH` → `de`).
- **UI:** The header language `<select>` labels come from `supported[].label`. Nav, hero CTAs, section headings, footer “All rights reserved”, and theme/menu/scroll strings come from each bundle’s **`ui`** object (`config.json` for English, locale files for others).
- **SEO:** `document.documentElement.lang`, `meta property="og:locale"`, and `og:locale:alternate` are updated when the locale changes (same URL for all languages).

To add **Spanish** (or another language): append an entry to `i18n.supported`, add **`locales/es.json`** mirroring the structure of `locales/de.json`, and deploy the new file with the site.

## Before you deploy (required once)

1. **Keep the public URL in sync**  
   Production is **`https://rd67.github.io`**. The same value must appear in:
   - `config.json` → `site.url` (runtime meta / JSON-LD via `app.js`)
   - `index.html` (canonical, `og:url`, `og:image`, `twitter:image`, JSON-LD `url` / `image`) — important for crawlers that don’t run JS
   - `robots.txt` (`Sitemap:`)
   - `sitemap.xml` (`<loc>`)

   If you add a **custom domain** later, update all of the above to match.

2. **Verify social preview**  
   After hosting with HTTPS, test:
   - [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/)
   - [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/)
   - [Twitter/X Card Validator](https://cards-dev.twitter.com/validator) (when available)

   Crawlers need an **absolute** `og:image` URL over HTTPS.

3. **Assets** (under `assets/images/` unless you change paths in config)
   - **`profile.png`** — headshot (`person.photo.src`, typically `assets/images/profile.png`)  
   - **`og.png`** — 1200×630 share image (`site.ogImage`; regenerate with Pillow if you change branding)  
   - Résumé — **`config.json` → `resumeUrl`** (Google Drive, “anyone with the link can view”)

## Run locally

```bash
cd portfolio
python3 -m http.server 8080
```

Open http://localhost:8080

## Deploy (GitHub Pages — `rd67.github.io`)

This repo is the **user site**: `git@github.com:rd67/rd67.github.io.git`. Site files live at the **repository root** (`index.html`, `config.json`, `assets/`, …).

```bash
cd portfolio   # or your clone root if this repo is only the site
git remote add origin git@github.com:rd67/rd67.github.io.git   # skip if already added
git add -A && git commit -m "Deploy portfolio" && git push -u origin main
```

On GitHub: **Settings → Pages → Build and deployment → Source:** *Deploy from branch*, **Branch:** `main`, **folder:** `/ (root)`. Enable **Enforce HTTPS** when available.

Live URL: **https://rd67.github.io**

If the site were ever served from a **project** path (`/repo/`), set `site.url`, canonical, and `og:url` to that path instead.

## Regenerate `og.png` from `profile.png`

Create a local venv if needed (`python3 -m venv .venv && .venv/bin/pip install pillow`). The `.venv` folder is gitignored.

```bash
cd portfolio
.venv/bin/python -c "
from PIL import Image, ImageDraw
from pathlib import Path
W,H=1200,630
im=Image.open('assets/images/profile.png').convert('RGBA')
s=min(im.size); im=im.crop(((im.width-s)//2,(im.height-s)//2,(im.width+s)//2,(im.height+s)//2))
bg=Image.new('RGB',(W,H),'#0f172a')
ph=im.resize((420,420),Image.Resampling.LANCZOS)
# paste + save — see repo history for full script
"
```

Or reuse the generation snippet from the last change that wrote `assets/images/og.png`.

## Popular patterns included

- Sticky header + **mobile nav**
- **Hero** with headline, proof, primary/secondary CTAs, socials, photo
- **Experience** as scannable cards (reverse chronology)
- **Projects** with tags
- **Skills** grouped by hiring-manager scan order
- **Education** + interests
- Strong **contact** block + résumé download
- **Print** stylesheet hints (hide chrome when printing)
