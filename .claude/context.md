# Budžet App Context

## Stack
- Flask + SQLite + Vanilla JS
- GitHub: https://github.com/djordje2311/ETA
- Replit: https://eta--djordjeristicwo.replit.app

## Current Status
- ✅ Desktop verzija radi savršeno
- ✅ Mobile CSS implementiran i radi na pravom iPhone-u
- ✅ Deployment na Replit radi (gunicorn, port 5000)

## Key Features
- Štednja (Savings) modul sa progress bars
- Interni transfer između osoba (Đorđe ↔ Milica)
- Intesa i Raiffeisen PDF parseri
- Category learning system
- Dashboard sa filterima (datum, osoba)
- Calendar sa 2 kolone (Đorđe/Milica)

## Database
- `budzet.db` — SQLite (lokalno, nije u git)
- Tabele: transactions, savings, description_categories, pozajmice, budgets

## Key Files
- `app.py` — Flask (900+ linija, API endpoints)
- `templates/index.html` — HTML sa mobile topbar (#sidebarOverlay, #sidebar, .mobile-topbar)
- `static/js/app.js` — JS sa initMobileNav() funkcijom
- `static/css/style.css` — CSS sa @media (max-width: 599px) i svi mobile stilovi

## Persons & Banks
- Persons: Đorđe, Milica
- Banks: Raiffeisen RSD (raiffeisen_rsd), Intesa (intesa)

## Mobile Implementation (DONE)
- .mobile-topbar sa hamburger-btn, brand logo, month input
- .sidebar.mobile-open — slide sidebar iz leva
- .sidebar-overlay — dark backdrop
- initMobileNav() — otvara/zatvara sidebar
- CSS media query @media (max-width: 599px) za sve mobile elemente
- viewport-fit=cover za notched iPhone (X+)
- -webkit-backdrop-filter prefix za modal blur
- -webkit-appearance:none na inputs/selects
- font-size 16px na mobile inputs (sprečava iOS auto-zoom)
- -webkit-tap-highlight-color:transparent na buttons

## Deployment (Replit)
- Dev server: `python app.py` (port 5000)
- Production: `gunicorn app:app --bind 0.0.0.0:5000`
- Config: `.replit` fajl sa `[deployment]` sekcijom, `Procfile`
- requirements.txt: flask, pdfplumber, gunicorn
- Replit ne auto-deployuje — treba kliknuti Deploy nakon promena

## Savings Namespacing
- Savings goal categories imaju `savings:` prefix u bazi (npr. `savings:Putovanje`)
- `_maybe_update_savings()` u app.py pali samo na `savings:` prefix
- `dispCat()` JS helper uklanja prefix za display
- Sprečava koliziju: obična expense kategorija "Putovanje" ≠ savings goal "Putovanje"

## Summary Person Filter Fix
- `/api/summary` sada uključuje 'Oboje' transakcije pri filtriranju po osobi
- SQL: `AND (person = ? OR person = 'Oboje')` — isti pattern kao u `/api/transactions`
