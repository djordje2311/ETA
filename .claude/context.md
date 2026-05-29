# Budžet App Context

## Stack
- Flask + SQLite + Vanilla JS
- GitHub: https://github.com/djordje2311/ETA
- Replit: https://eta--djordjeristicwo.replit.app

## Current Status
- ✅ Desktop verzija radi savršeno
- ✅ Mobile CSS je implementiran (@media 599px breakpoint)
- ❌ iPhone Safari ne primenjuje media query (DEBUGGING TOMORROW)

## Key Features
- Štednja (Savings) modul sa progress bars
- Interni transfer između osoba (Đorđe ↔ Milica)
- Intesa i Raiffeisen PDF parseri
- Category learning system
- Dashboard sa filterima (datum, osoba)
- Calendar sa 2 kolone (Đorđe/Milica)

## Database
- `budzet.db` — SQLite (lokalno)
- Tabele: transactions, savings, description_categories, pozajmice, budgets

## Key Files
- `app.py` — Flask (900 linija, API endpoints)
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
- CSS media query za sve mobile elemente

## iPhone Issue (PENDING)
- DevTools responsive mode RADI
- Pravi iPhone NE RADI
- Mogući razlozi: viewport ne menja width, Safari ne primenjuje media query, landscape mode
- Solution: Debug console na iPhone-u

## Next Steps
- Debug iPhone viewport issue (F12 → Console)
- Test CSS media query na stvarnom mobilnom
- Push izmene na GitHub nakon verifikacije