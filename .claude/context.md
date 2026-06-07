# Budžet App Context

## Stack
- Flask + SQLite + Vanilla JS
- GitHub: https://github.com/djordje2311/ETA
- Replit: https://eta--djordjeristicwo.replit.app

## Current Status
- ✅ Desktop verzija radi savršeno
- ✅ Mobile CSS implementiran i radi na pravom iPhone-u
- ✅ Produkcija: PythonAnywhere (besplatno, trajno)
- ✅ Login stranica sa zaštitom lozinkom

## Hosting
- **PythonAnywhere**: https://djordje2311.pythonanywhere.com (produkcija)
- **Replit**: https://eta--djordjeristicwo.replit.app (staro, više se ne koristi)
- Database: `budzet.db` je manuelno uploadovan na PythonAnywhere, nije u git
- Za update koda: `git pull` na PythonAnywhere + Reload na Web tabu

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

## Authentication
- Flask session-based auth sa per-user nalozima (username + hashed password)
- `SECRET_KEY` i `APP_PASSWORD` — env varijable u PythonAnywhere WSGI fajlu
- **Fallback**: ako `users` tabela prazna → koristi `APP_PASSWORD` (legacy)
- Kad postoje user nalozi → login traži username + password (werkzeug hash)
- Session čuva: `user_id`, `username`, `role`, `person_name`
- `@app.before_request` štiti sve rute; `/api/admin/*` zahteva role='admin'
- API rute vraćaju 401 JSON (bez sesije) ili 403 JSON (bez admin role)
- `api()` u app.js redirectuje na `/login` na 401
- Login: `templates/login.html` — prikazuje username polje ako postoje nalozi
- Logout link u dnu sidebara

## Admin Tab (samo admin role)
- Pristup: samo korisnici sa `role='admin'` vide Admin tab u sidebaru
- **Kategorije**: add/remove expense i income kategorije (iz DB, ne hardcoded)
- **Korisnici**: add/remove login naloge, assign roles, link person_name
- Admin je Đorđe (prvi nalog sa role='admin')

## Multi-User Design
- Svi korisnici vide sve podatke (household app, nema izolacije)
- `person_name` na user nalogu → default "Ko?" u transaction formi
- `users` tabela odvojena od `person` labela na transakcijama
- Spreman za buduće: dodati `household_id` u sve tabele za multi-household

## Deployment
- **Dev (lokalno)**: `python app.py` (port 5000)
- **Produkcija**: PythonAnywhere — `gunicorn app:app --bind 0.0.0.0:5000`
- requirements.txt: flask, pdfplumber, gunicorn
- WSGI fajl: `/var/www/djordje2311_pythonanywhere_com_wsgi.py`

## Savings Namespacing
- Savings goal categories imaju `savings:` prefix u bazi (npr. `savings:Putovanje`)
- `_maybe_update_savings()` u app.py pali samo na `savings:` prefix
- `dispCat()` JS helper uklanja prefix za display
- Sprečava koliziju: obična expense kategorija "Putovanje" ≠ savings goal "Putovanje"

## Summary Person Filter Fix
- `/api/summary` sada uključuje 'Oboje' transakcije pri filtriranju po osobi
- SQL: `AND (person = ? OR person = 'Oboje')` — isti pattern kao u `/api/transactions`

## Oboje Balance Fix
- Per-person current balance sada uključuje 50% 'Oboje' transakcija
- Popravljeno na 2 mesta: `_cur_bal` (get_summary) i `_bal` (get_calendar)
- Pre toga: Đorđe balance + Milica balance ≠ total (Oboje je bio izostavljen)
- Pravilo: 'Oboje' = zajednički, svako dobija 50% u agregatima/balansima
- Lista transakcija i dalje prikazuje 'Oboje' u punom iznosu (stvarni zapis)

## AI Analiza
- Tab "AI Analiza" — dugme "Analiziraj" šalje finansije LLM-u, vraća uvide
- Provider-agnostic: `call_llm()` podržava Anthropic i OpenAI preko REST-a
- Env varijable: `AI_PROVIDER` (anthropic/openai), `AI_API_KEY`, `AI_MODEL`
- Default modeli: Anthropic `claude-haiku-4-5-20251001`, OpenAI `gpt-4o-mini`
- `gather_ai_context(month, person)` — skuplja pregled, kategorije, 12m trend, štednju, dugove, budžete
- Endpoint: `POST /api/ai/analyze` — preskače demo korisnike (bez troška), gracefully handluje nedostatak ključa
- Poziva se samo na klik dugmeta (kontrola troška), ne na otvaranje taba
- Zavisnost: `requests` (dodato u requirements.txt)
- **Hosting**: zahteva PythonAnywhere Hacker plan ($5/mo) za outbound pristup
- **Trošak**: API je pay-as-you-go (Claude Pro NE pokriva API), ~<1 cent po analizi sa Haiku
