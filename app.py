from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3, os, re
from datetime import datetime, date
from io import BytesIO, StringIO
import csv, calendar
from contextlib import contextmanager
import pdfplumber

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-only')
DB = os.path.join(os.path.dirname(__file__), 'budzet.db')

APP_PASSWORD = os.environ.get('APP_PASSWORD')

@app.before_request
def require_login():
    if request.endpoint in ('login', 'logout', 'static'):
        return
    if not session.get('logged_in'):
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Unauthorized'}), 401
        return redirect(url_for('login'))
    if request.path.startswith('/api/admin/') and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden'}), 403

@app.route('/login', methods=['GET', 'POST'])
def login():
    with get_db() as conn:
        users_exist = conn.execute("SELECT 1 FROM users WHERE active=1 LIMIT 1").fetchone() is not None
    error = None
    if request.method == 'POST':
        if users_exist:
            username = request.form.get('username', '').strip()
            password = request.form.get('password', '')
            with get_db() as conn:
                user = conn.execute(
                    "SELECT * FROM users WHERE username=? AND active=1", (username,)
                ).fetchone()
            if user and check_password_hash(user['password_hash'], password):
                session['logged_in']   = True
                session['user_id']     = user['id']
                session['username']    = user['username']
                session['role']        = user['role']
                session['person_name'] = user['person_name']
                return redirect(url_for('index'))
            error = 'Pogrešno korisničko ime ili lozinka.'
        else:
            password = request.form.get('password', '')
            if APP_PASSWORD and password == APP_PASSWORD:
                session['logged_in']   = True
                session['user_id']     = None
                session['username']    = 'admin'
                session['role']        = 'admin'
                session['person_name'] = None
                return redirect(url_for('index'))
            error = 'Pogrešna lozinka.'
    return render_template('login.html', error=error, users_exist=users_exist)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

EXPENSE_CATEGORIES = [
    'Kirija', 'Krediti', 'Računi', 'Hrana', 'Gorivo',
    'Cigarete', 'Telefon', 'Pretplate', 'Druženje',
    'Dostava', 'Poklon', 'Dugovi', 'Putovanje', 'Ostalo'
]

INCOME_CATEGORIES = [
    'Plata', 'Bonus', 'Poklon', 'Pozajmica', 'Drugo'
]

@contextmanager
def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

def init_db():
    with get_db() as conn:
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('income','expense')),
                amount REAL NOT NULL,
                category TEXT NOT NULL,
                description TEXT,
                person TEXT NOT NULL CHECK(person IN ('Milica','Đorđe','Oboje')),
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS debts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                amount REAL NOT NULL,
                paid REAL DEFAULT 0,
                note TEXT,
                direction TEXT DEFAULT 'owe' CHECK(direction IN ('owe','owed')),
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                month TEXT NOT NULL,
                limit_amount REAL NOT NULL,
                UNIQUE(category, month)
            );
            CREATE TABLE IF NOT EXISTS description_categories (
                description_prefix TEXT PRIMARY KEY,
                category TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS planned (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL CHECK(type IN ('income','expense')),
                amount REAL NOT NULL,
                category TEXT NOT NULL,
                description TEXT,
                person TEXT NOT NULL CHECK(person IN ('Milica','Đorđe','Oboje')),
                recurring INTEGER DEFAULT 0,
                day_of_month INTEGER,
                specific_date TEXT,
                active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS savings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                target_amount REAL NOT NULL,
                current_amount REAL DEFAULT 0,
                target_date TEXT,
                person TEXT NOT NULL CHECK(person IN ('Milica','Đorđe','Oboje')),
                created_at TEXT DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO savings (id, name, target_amount, current_amount, target_date, person)
            VALUES
                (1, 'Letovanje', 150000, 45000, '2026-08-15', 'Oboje'),
                (2, 'Auto',      500000, 75000, '2027-06-01', 'Đorđe'),
                (3, 'Kuća',     2000000, 200000, '2030-01-01', 'Oboje');
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                person_name TEXT,
                role TEXT DEFAULT 'user' CHECK(role IN ('admin','user')),
                active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('expense','income')),
                active INTEGER DEFAULT 1,
                UNIQUE(name, type)
            );
            INSERT OR IGNORE INTO categories (name, type) VALUES
                ('Kirija','expense'),('Krediti','expense'),('Računi','expense'),
                ('Hrana','expense'),('Gorivo','expense'),('Cigarete','expense'),
                ('Telefon','expense'),('Pretplate','expense'),('Druženje','expense'),
                ('Dostava','expense'),('Poklon','expense'),('Dugovi','expense'),
                ('Putovanje','expense'),('Ostalo','expense'),
                ('Plata','income'),('Bonus','income'),('Poklon','income'),
                ('Pozajmica','income'),('Drugo','income');
        ''')

init_db()

def _get_learned_category(description):
    with get_db() as conn:
        row = conn.execute(
            "SELECT category FROM description_categories WHERE description_prefix = ?",
            (description[:50],)
        ).fetchone()
    return row['category'] if row else None

def _maybe_update_savings(conn, category, amount, tx_type):
    if tx_type != 'expense' or not category.startswith('savings:'):
        return
    name = category[len('savings:'):]
    row = conn.execute("SELECT id FROM savings WHERE name = ?", (name,)).fetchone()
    if row:
        conn.execute(
            "UPDATE savings SET current_amount = current_amount + ? WHERE id = ?",
            (amount, row['id'])
        )

@app.route('/')
def index():
    with get_db() as conn:
        cats = conn.execute(
            "SELECT name, type FROM categories WHERE active=1 ORDER BY name"
        ).fetchall()
    expense_categories = [r['name'] for r in cats if r['type'] == 'expense'] or EXPENSE_CATEGORIES
    income_categories  = [r['name'] for r in cats if r['type'] == 'income']  or INCOME_CATEGORIES
    return render_template('index.html',
                           expense_categories=expense_categories,
                           income_categories=income_categories,
                           is_admin=session.get('role') == 'admin',
                           current_user=session.get('username', ''),
                           person_name=session.get('person_name') or '')

# ── Transactions ───────────────────────────────────────────────────────────────

@app.route('/api/transactions', methods=['GET'])
def get_transactions():
    month = request.args.get('month', datetime.now().strftime('%Y-%m'))
    person = request.args.get('person', 'all')
    with get_db() as conn:
        query = "SELECT * FROM transactions WHERE strftime('%Y-%m', date) = ? "
        params = [month]
        if person != 'all':
            query += "AND (person = ? OR person = 'Oboje') "
            params.append(person)
        query += "ORDER BY date DESC, id DESC"
        rows = conn.execute(query, params).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/transactions', methods=['POST'])
def add_transaction():
    d = request.json
    with get_db() as conn:
        conn.execute(
            "INSERT INTO transactions (date,type,amount,category,description,person) VALUES (?,?,?,?,?,?)",
            (d['date'], d['type'], float(d['amount']), d['category'], d.get('description',''), d['person'])
        )
        # If income category is Pozajmica, auto-create a debt entry (they owe us back)
        if d['category'] == 'Pozajmica' and d['type'] == 'income':
            lender = d.get('lender', '').strip() or 'Nepoznato'
            conn.execute(
                "INSERT INTO debts (name, amount, paid, note, direction) VALUES (?,?,0,?,?)",
                (lender, float(d['amount']), d.get('description', ''), 'owe')
            )
        _maybe_update_savings(conn, d['category'], float(d['amount']), d['type'])
    return jsonify({'ok': True})

@app.route('/api/transactions/<int:tid>', methods=['PATCH'])
def update_transaction(tid):
    d = request.json
    with get_db() as conn:
        conn.execute(
            "UPDATE transactions SET date=?,type=?,amount=?,category=?,description=?,person=? WHERE id=?",
            (d['date'], d['type'], float(d['amount']), d['category'], d.get('description',''), d['person'], tid)
        )
    return jsonify({'ok': True})

@app.route('/api/transactions/<int:tid>', methods=['DELETE'])
def delete_transaction(tid):
    with get_db() as conn:
        conn.execute("DELETE FROM transactions WHERE id=?", (tid,))
    return jsonify({'ok': True})

# ── Summary ────────────────────────────────────────────────────────────────────

@app.route('/api/summary', methods=['GET'])
def get_summary():
    month     = request.args.get('month', datetime.now().strftime('%Y-%m'))
    date_from = request.args.get('date_from', f"{month}-01")
    date_to   = request.args.get('date_to',   date.today().isoformat())
    person    = request.args.get('person', 'all')
    today_str = date.today().isoformat()

    with get_db() as conn:
        sql  = "SELECT * FROM transactions WHERE date >= ? AND date <= ?"
        args = [date_from, date_to]
        if person != 'all':
            sql += " AND (person = ? OR person = 'Oboje')"
            args.append(person)
        rows = conn.execute(sql, args).fetchall()

        def _cur_bal(p=None):
            s = ("SELECT SUM(CASE WHEN type='income' THEN amount ELSE -amount END) "
                 "FROM transactions WHERE date <= ?")
            a = [today_str]
            if p:
                s += " AND person = ?"
                a.append(p)
            return round(conn.execute(s, a).fetchone()[0] or 0)

        current_balances = {
            'Đorđe': _cur_bal('Đorđe'),
            'Milica': _cur_bal('Milica'),
            'total':  _cur_bal(),
        }

    summary = {
        'Milica': {'income': 0, 'expense': 0},
        'Đorđe':  {'income': 0, 'expense': 0},
        'total':  {'income': 0, 'expense': 0}
    }
    by_category = {}

    for r in rows:
        amt = r['amount']
        p   = r['person']
        t   = r['type']
        if p == 'Oboje':
            half = amt / 2
            summary['Milica'][t] += half
            summary['Đorđe'][t]  += half
        else:
            if p in summary:
                summary[p][t] += amt
        summary['total'][t] += amt
        if t == 'expense':
            by_category[r['category']] = by_category.get(r['category'], 0) + amt

    for p in ['Milica', 'Đorđe', 'total']:
        summary[p]['balance'] = summary[p]['income'] - summary[p]['expense']

    return jsonify({'summary': summary, 'by_category': by_category,
                    'current_balances': current_balances})

@app.route('/api/monthly_trend', methods=['GET'])
def monthly_trend():
    person = request.args.get('person', 'all')
    where  = "" if person == 'all' else "WHERE person = ?"
    args   = [] if person == 'all' else [person]
    with get_db() as conn:
        rows = conn.execute(f"""
            SELECT strftime('%Y-%m', date) as month,
                   SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
                   SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense
            FROM transactions {where}
            GROUP BY month ORDER BY month DESC LIMIT 12
        """, args).fetchall()
    return jsonify([dict(r) for r in rows][::-1])

# ── Debts ──────────────────────────────────────────────────────────────────────

@app.route('/api/debts', methods=['GET'])
def get_debts():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM debts ORDER BY created_at DESC").fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/debts', methods=['POST'])
def add_debt():
    d = request.json
    with get_db() as conn:
        conn.execute(
            "INSERT INTO debts (name,amount,paid,note,direction) VALUES (?,?,?,?,?)",
            (d['name'], float(d['amount']), float(d.get('paid', 0)), d.get('note', ''), d.get('direction', 'owe'))
        )
    return jsonify({'ok': True})

@app.route('/api/debts/<int:did>', methods=['PATCH'])
def update_debt(did):
    d = request.json
    with get_db() as conn:
        conn.execute("UPDATE debts SET paid=? WHERE id=?", (float(d['paid']), did))
    return jsonify({'ok': True})

@app.route('/api/debts/<int:did>', methods=['PUT'])
def update_debt_full(did):
    d = request.json
    with get_db() as conn:
        conn.execute(
            "UPDATE debts SET name=?,amount=?,paid=?,note=?,direction=? WHERE id=?",
            (d['name'], float(d['amount']), float(d.get('paid', 0)), d.get('note', ''), d.get('direction', 'owe'), did)
        )
    return jsonify({'ok': True})

@app.route('/api/debts/<int:did>', methods=['DELETE'])
def delete_debt(did):
    with get_db() as conn:
        conn.execute("DELETE FROM debts WHERE id=?", (did,))
    return jsonify({'ok': True})

# ── Budgets ────────────────────────────────────────────────────────────────────

@app.route('/api/budgets', methods=['GET'])
def get_budgets():
    month = request.args.get('month', datetime.now().strftime('%Y-%m'))
    with get_db() as conn:
        budgets = conn.execute("SELECT * FROM budgets WHERE month=?", (month,)).fetchall()
        spent   = conn.execute("""
            SELECT category, SUM(amount) as spent FROM transactions
            WHERE strftime('%Y-%m', date)=? AND type='expense'
            GROUP BY category
        """, (month,)).fetchall()
    spent_map = {r['category']: r['spent'] for r in spent}
    return jsonify([{**dict(b), 'spent': spent_map.get(b['category'], 0)} for b in budgets])

@app.route('/api/budgets', methods=['POST'])
def set_budget():
    d = request.json
    with get_db() as conn:
        conn.execute(
            "INSERT INTO budgets (category,month,limit_amount) VALUES (?,?,?) "
            "ON CONFLICT(category,month) DO UPDATE SET limit_amount=?",
            (d['category'], d['month'], float(d['limit_amount']), float(d['limit_amount']))
        )
    return jsonify({'ok': True})

# ── Planned ────────────────────────────────────────────────────────────────────

@app.route('/api/planned', methods=['GET'])
def get_planned():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM planned WHERE active=1 ORDER BY recurring DESC, day_of_month ASC"
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/planned', methods=['POST'])
def add_planned():
    d = request.json
    with get_db() as conn:
        conn.execute(
            "INSERT INTO planned (type,amount,category,description,person,recurring,day_of_month,specific_date) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (d['type'], float(d['amount']), d['category'], d.get('description', ''),
             d['person'], int(d.get('recurring', 0)),
             d.get('day_of_month'), d.get('specific_date'))
        )
    return jsonify({'ok': True})

@app.route('/api/planned/<int:pid>', methods=['PATCH'])
def update_planned(pid):
    d = request.json
    with get_db() as conn:
        conn.execute(
            "UPDATE planned SET type=?,amount=?,category=?,description=?,person=?,recurring=?,day_of_month=?,specific_date=? WHERE id=?",
            (d['type'], float(d['amount']), d['category'], d.get('description',''), d['person'],
             int(d.get('recurring', 0)), d.get('day_of_month'), d.get('specific_date'), pid)
        )
    return jsonify({'ok': True})

@app.route('/api/planned/<int:pid>', methods=['DELETE'])
def delete_planned(pid):
    with get_db() as conn:
        conn.execute("UPDATE planned SET active=0 WHERE id=?", (pid,))
    return jsonify({'ok': True})

# ── Calendar ───────────────────────────────────────────────────────────────────

@app.route('/api/calendar', methods=['GET'])
def get_calendar():
    month = request.args.get('month', datetime.now().strftime('%Y-%m'))
    year, mon = int(month.split('-')[0]), int(month.split('-')[1])
    days_in_month = calendar.monthrange(year, mon)[1]

    with get_db() as conn:
        real_rows    = conn.execute(
            "SELECT * FROM transactions WHERE strftime('%Y-%m', date)=? ORDER BY date", (month,)
        ).fetchall()
        planned_rows = conn.execute("SELECT * FROM planned WHERE active=1").fetchall()
        prior = conn.execute(
            "SELECT SUM(CASE WHEN type='income' THEN amount ELSE -amount END) "
            "FROM transactions WHERE date < ?",
            (f"{year}-{mon:02d}-01",)
        ).fetchone()[0] or 0

    days = {}
    for d in range(1, days_in_month + 1):
        ds = f"{year}-{mon:02d}-{d:02d}"
        days[ds] = {'date': ds, 'day': d, 'real': [], 'planned': [],
                    'real_balance_delta': 0, 'planned_balance_delta': 0}

    for r in real_rows:
        ds = r['date']
        if ds in days:
            sign = 1 if r['type'] == 'income' else -1
            days[ds]['real'].append(dict(r))
            days[ds]['real_balance_delta'] += sign * r['amount']

    for p in planned_rows:
        p = dict(p)
        if p['recurring'] and p['day_of_month']:
            actual_day = min(p['day_of_month'], days_in_month)
            ds = f"{year}-{mon:02d}-{actual_day:02d}"
            if ds in days:
                sign = 1 if p['type'] == 'income' else -1
                days[ds]['planned'].append(p)
                days[ds]['planned_balance_delta'] += sign * p['amount']
        elif p['specific_date'] and p['specific_date'].startswith(month):
            ds = p['specific_date']
            if ds in days:
                sign = 1 if p['type'] == 'income' else -1
                days[ds]['planned'].append(p)
                days[ds]['planned_balance_delta'] += sign * p['amount']

    running_real = prior
    today_str    = date.today().isoformat()
    result = []
    for d in range(1, days_in_month + 1):
        ds  = f"{year}-{mon:02d}-{d:02d}"
        day = days[ds]
        running_real += day['real_balance_delta']
        day['running_real'] = round(running_real)

        if day['planned'] and not day['real'] and ds <= today_str:
            day['status'] = 'pending'
        elif day['planned'] and not day['real']:
            day['status'] = 'upcoming'
        elif day['real']:
            day['status'] = 'realized'
        else:
            day['status'] = 'empty'

        result.append(day)

    with get_db() as conn:
        def _bal(person=None):
            sql = ("SELECT SUM(CASE WHEN type='income' THEN amount ELSE -amount END) "
                   "FROM transactions WHERE date <= ?")
            args = [today_str]
            if person:
                sql += " AND person = ?"
                args.append(person)
            return round(conn.execute(sql, args).fetchone()[0] or 0)
        cb_djordje = _bal('Đorđe')
        cb_milica  = _bal('Milica')

    return jsonify({
        'days':       result,
        'cb_djordje': cb_djordje,
        'cb_milica':  cb_milica,
    })

# ── Savings ────────────────────────────────────────────────────────────────────

@app.route('/api/savings', methods=['GET'])
def get_savings():
    today_iso = date.today().isoformat()
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM savings ORDER BY created_at").fetchall()
    result = []
    for r in rows:
        r = dict(r)
        pct = round(r['current_amount'] / r['target_amount'] * 100, 1) if r['target_amount'] > 0 else 0
        days_left = None
        if r['target_date']:
            delta = date.fromisoformat(r['target_date']) - date.fromisoformat(today_iso)
            days_left = delta.days
        r['progress_percent'] = min(pct, 100.0)
        r['days_left'] = days_left
        result.append(r)
    return jsonify(result)

@app.route('/api/savings', methods=['POST'])
def add_savings():
    d = request.json
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO savings (name, target_amount, target_date, person) VALUES (?,?,?,?)",
            (d['name'].strip(), float(d['target_amount']), d.get('target_date') or None, d['person'])
        )
        new_id = cur.lastrowid
    return jsonify({'ok': True, 'id': new_id})

@app.route('/api/savings/<int:sid>', methods=['PATCH'])
def update_savings(sid):
    d = request.json
    with get_db() as conn:
        conn.execute(
            "UPDATE savings SET name=?, target_amount=?, target_date=? WHERE id=?",
            (d['name'].strip(), float(d['target_amount']), d.get('target_date') or None, sid)
        )
    return jsonify({'ok': True})

@app.route('/api/savings/<int:sid>', methods=['DELETE'])
def delete_savings(sid):
    with get_db() as conn:
        conn.execute("DELETE FROM savings WHERE id=?", (sid,))
    return jsonify({'ok': True})

@app.route('/api/savings/<int:sid>/add', methods=['POST'])
def add_to_savings(sid):
    amount = float((request.json or {}).get('amount', 0))
    if amount <= 0:
        return jsonify({'error': 'Iznos mora biti veći od 0'}), 400
    with get_db() as conn:
        conn.execute(
            "UPDATE savings SET current_amount = current_amount + ? WHERE id=?",
            (amount, sid)
        )
    return jsonify({'ok': True})

# ── Internal transfer ──────────────────────────────────────────────────────────

@app.route('/api/transfer', methods=['POST'])
def internal_transfer():
    d = request.json or {}
    from_person = d.get('from_person', '').strip()
    to_person   = d.get('to_person', '').strip()
    amount      = float(d.get('amount', 0))
    valid_persons = {'Milica', 'Đorđe'}
    if from_person not in valid_persons or to_person not in valid_persons:
        return jsonify({'error': 'Nepoznata osoba'}), 400
    if from_person == to_person:
        return jsonify({'error': 'Pošiljalac i primalac ne mogu biti ista osoba'}), 400
    if amount <= 0:
        return jsonify({'error': 'Iznos mora biti veći od 0'}), 400
    today_str = date.today().isoformat()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO transactions (date,type,amount,category,description,person) VALUES (?,?,?,?,?,?)",
            (today_str, 'expense', amount, 'Ostalo',
             f'Interni transfer → {to_person}', from_person)
        )
        conn.execute(
            "INSERT INTO transactions (date,type,amount,category,description,person) VALUES (?,?,?,?,?,?)",
            (today_str, 'income', amount, 'Drugo',
             f'Interni transfer ← {from_person}', to_person)
        )
    return jsonify({'ok': True})

# ── Import ─────────────────────────────────────────────────────────────────────

_AMOUNT_RE = re.compile(r'\d{1,3}(?:\.\d{3})*,\d{2}')
_DATE_RE   = re.compile(r'\d{2}\.\d{2}\.\d{4}')

def _sr_amount(s):
    if not s:
        return 0.0
    s = str(s).strip().replace('\xa0', '').replace(' ', '')
    m = re.search(r'(\d{1,3}(?:\.\d{3})*),(\d{2})', s)
    if m:
        return float(m.group(1).replace('.', '') + '.' + m.group(2))
    try:
        return float(s.replace(',', '.'))
    except ValueError:
        return 0.0

def _sr_date(s):
    m = re.search(r'(\d{2})\.(\d{2})\.(\d{4})', str(s or ''))
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None

def _categorize(opis, tx_type):
    up = opis.upper()
    if 'ZARADA ZA MESEC' in up:
        return 'Plata'
    if any(k in up for k in ('LUKOIL', 'MOL SERBIA', 'KNEZ PETROL', 'PETROL', 'GORIVO')):
        return 'Gorivo'
    if any(k in up for k in ('LIDL', 'MAXI', 'AMAN DOO', 'SANI STR', 'UNIVEREXPORT', 'QVATTRO', 'DM FILIJALA')):
        return 'Hrana'
    if 'WOLT' in up:
        return 'Dostava'
    if any(k in up for k in ('MTS', 'PLACANJE MTS')):
        return 'Telefon'
    if any(k in up for k in ('YOUTUBE', 'GOOGLE', 'SBB', 'PAYSPOT')):
        return 'Pretplate'
    if any(k in up for k in ('EPS', 'INFOSTAN', 'OBJEDINJENA NAPLATA')):
        return 'Računi'
    if any(k in up for k in ('AIR SERBIA', 'BOOKING', 'RYANAIR')):
        return 'Putovanje'
    if tx_type == 'expense' and any(k in up for k in ('MILICA', 'MILICA DŽAVRIĆ', 'MILICA DZAVRIC')):
        return 'Poklon'
    if tx_type == 'income' and 'MILICA' in up:
        return 'Drugo'
    if tx_type == 'income' and any(k in up for k in ('SLAVICA RISTIC', 'DRAGANA DŽAVRIĆ', 'DRAGANA DZAVRIC')):
        return 'Pozajmica'
    if tx_type == 'expense' and any(k in up for k in ('BANKOMAT', 'MOBILNI KEŠ', 'MOBILNI KES', 'SMART ATM')):
        return 'Ostalo'
    return 'Ostalo'

def _parse_raiffeisen_pdf(file_bytes):
    """Extract transactions from a Raiffeisen RSD PDF statement using word positions."""
    DATE_RE  = re.compile(r'^\d{2}\.\d{2}\.\d{4}$')
    AMT_RE   = re.compile(r'^\d{1,3}(?:\.\d{3})*,\d{2}$')
    # Keywords that identify header/footer lines — skip those desc lines individually
    SKIP_HDR = ('Datum', 'Krajnje', 'Prethodno', 'PROMET', 'Korisnik',
                'Partija', 'VALUTA', 'Isplate', 'Uplate', 'Opis', 'Strana', 'JMBG')

    # ── 1. Extract all words across all pages (doctop = doc-relative y) ──
    all_words = []
    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            for w in page.extract_words(keep_blank_chars=False,
                                        x_tolerance=3, y_tolerance=3):
                all_words.append((w['doctop'], w['x0'], w['text']))
    all_words.sort(key=lambda w: (w[0], w[1]))

    # ── 2. Group words into lines (same doctop ± 2 px) ───────────────────
    lines = []
    for w in all_words:
        if lines and abs(w[0] - lines[-1][0][0]) <= 2.0:
            lines[-1].append(w)
        else:
            lines.append([w])

    # ── 3. Identify transaction key lines ─────────────────────────────────
    # A key line has a DD.MM.YYYY word at x0 < 60 (leftmost "Datum valute" col)
    key_line_idx = [
        i for i, line in enumerate(lines)
        if any(w[1] < 60 and DATE_RE.match(w[2]) for w in line)
    ]

    # ── 4. Parse each transaction ─────────────────────────────────────────
    results = []
    for ti, ki in enumerate(key_line_idx):
        line = lines[ki]

        date_w = next((w for w in line if w[1] < 60 and DATE_RE.match(w[2])), None)
        if not date_w:
            continue
        date_str = _sr_date(date_w[2])
        if not date_str:
            continue

        # Amounts on key line (x0 < 391), sorted left → right:
        #   x0 < 250  → Isplate column
        #   250–330   → Uplate column
        #   > 330     → Stanje — skip
        amt_ws = sorted(
            [w for w in line if AMT_RE.match(w[2]) and w[1] < 391.0],
            key=lambda w: w[1]
        )
        isp = upl = 0.0
        for aw in amt_ws:
            if aw[1] < 250:
                isp = _sr_amount(aw[2])
            elif aw[1] < 330:
                upl = _sr_amount(aw[2])

        if isp == 0.0 and upl == 0.0:
            continue

        # Description: collect x0 ≥ 391 lines in the range between
        # the midpoints of the surrounding key lines
        key_top  = lines[ki][0][0]
        prev_top = lines[key_line_idx[ti - 1]][0][0] if ti > 0 else 0.0
        next_top = (lines[key_line_idx[ti + 1]][0][0]
                    if ti < len(key_line_idx) - 1 else float('inf'))
        desc_min = (prev_top + key_top) / 2
        desc_max = (key_top + next_top) / 2

        desc_parts = []
        for line_j in lines:
            ldt = line_j[0][0]
            if ldt < desc_min or ldt > desc_max:
                continue
            dws = [w[2] for w in line_j if w[1] >= 391.0]
            if not dws:
                continue
            line_text = ' '.join(dws)
            if any(kw in line_text for kw in SKIP_HDR):
                continue
            desc_parts.append(line_text)

        opis = re.sub(r'\s+', ' ', ' '.join(desc_parts)).strip()
        if not opis:
            continue

        tx_type  = 'income' if upl > 0.0 else 'expense'
        amount   = upl if upl > 0.0 else isp
        learned  = _get_learned_category(opis)
        category = learned if learned else _categorize(opis, tx_type)

        results.append({
            'date': date_str, 'type': tx_type, 'amount': round(amount, 2),
            'category': category, 'description': opis,
            'person': 'Đorđe', 'suggested': True,
        })

    results.sort(key=lambda t: t['date'])
    return results


def _parse_intesa_pdf(file_bytes):
    """Extract transactions from an Intesa bank RSD PDF statement using word positions."""
    DATE_RE   = re.compile(r'^\d{2}\.\d{2}\.\d{4}$')
    AMT_RE    = re.compile(r'^\d{1,3}(?:\.\d{3})*,\d{2}$')
    SKIP_LINE = {'OPIS'}

    # ── 1. Extract all words across all pages ─────────────────────────────
    all_words = []
    with pdfplumber.open(BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            for w in page.extract_words(keep_blank_chars=False,
                                        x_tolerance=3, y_tolerance=3):
                all_words.append((w['doctop'], w['x0'], w['text']))
    all_words.sort(key=lambda w: (w[0], w[1]))

    # ── 2. Group words into lines (same doctop ± 2 px) ───────────────────
    lines = []
    for w in all_words:
        if lines and abs(w[0] - lines[-1][0][0]) <= 2.0:
            lines[-1].append(w)
        else:
            lines.append([w])

    # ── 3. Key lines: date at x0 < 30 ─────────────────────────────────────
    key_line_idx = [
        i for i, line in enumerate(lines)
        if any(w[1] < 30 and DATE_RE.match(w[2]) for w in line)
    ]

    # ── 4. Parse each transaction ─────────────────────────────────────────
    results = []
    for ti, ki in enumerate(key_line_idx):
        line = lines[ki]

        date_w = next((w for w in line if w[1] < 30 and DATE_RE.match(w[2])), None)
        if not date_w:
            continue
        date_str = _sr_date(date_w[2])
        if not date_str:
            continue

        # Sign + amount: words at x0 > 500 (excluding 'RSD')
        amt_ws = [w for w in line if w[1] > 500 and w[2] != 'RSD']
        sign   = next((w[2] for w in amt_ws if w[2] in ('+', '-')), None)
        amount = next((_sr_amount(w[2]) for w in amt_ws if AMT_RE.match(w[2])), 0.0)

        if amount == 0.0 or sign is None:
            continue

        tx_type = 'income' if sign == '+' else 'expense'

        # Description: words at 209 ≤ x0 < 500 between midpoints of adjacent keys
        key_top  = lines[ki][0][0]
        prev_top = lines[key_line_idx[ti - 1]][0][0] if ti > 0 else key_top - 30
        next_top = (lines[key_line_idx[ti + 1]][0][0]
                    if ti < len(key_line_idx) - 1 else float('inf'))
        desc_min = (prev_top + key_top) / 2
        desc_max = (key_top + next_top) / 2

        desc_parts = []
        for line_j in lines:
            ldt = line_j[0][0]
            if ldt < desc_min or ldt > desc_max:
                continue
            dws = [w[2] for w in line_j if 209 <= w[1] < 500]
            if not dws:
                continue
            # Skip column-header lines (e.g. "OPIS")
            if any(kw == tok for kw in SKIP_LINE for tok in dws):
                continue
            desc_parts.append(' '.join(dws))

        opis = re.sub(r'\s+', ' ', ' '.join(desc_parts)).strip()

        learned  = _get_learned_category(opis)
        category = learned if learned else _categorize(opis, tx_type)

        results.append({
            'date': date_str, 'type': tx_type, 'amount': round(amount, 2),
            'category': category, 'description': opis,
            'person': 'Đorđe', 'suggested': True,
        })

    results.sort(key=lambda t: t['date'])
    return results


def _parse_raiffeisen_csv(file_bytes):
    DATE2_RE = re.compile(r'(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})')
    SKIP_KW  = ('Datum', 'Krajnje', 'Prethodno', 'PROMET', 'Korisnik', 'Partija', 'VALUTA')
    results  = []

    reader = csv.reader(StringIO(file_bytes.decode('utf-8-sig')), delimiter=';')
    for row in reader:
        # Use col[0] if non-empty, otherwise try col[1]
        cell = ''
        if len(row) > 0 and row[0].strip():
            cell = row[0]
        elif len(row) > 1 and row[1].strip():
            cell = row[1]
        if not cell.strip():
            continue
        if any(kw in cell for kw in SKIP_KW):
            continue

        lines = cell.split('\n')

        # Find the line with two consecutive dates — the transaction header line.
        date_line = date_m = None
        date_line_idx = -1
        for i, ln in enumerate(lines):
            m = DATE2_RE.search(ln)
            if m:
                date_line, date_m, date_line_idx = ln, m, i
                break

        if date_line is None:
            continue

        date_str = _sr_date(date_m.group(1))
        if not date_str:
            continue

        # Extract amounts by order on the date line:
        #   1st match → isplata (expense)
        #   2nd match → uplata  (income)
        #   3rd match → stanje  (running balance — ignore)
        matches = list(_AMOUNT_RE.finditer(date_line))
        isp = upl = 0.0
        if len(matches) >= 1:
            isp = _sr_amount(matches[0].group())
        if len(matches) >= 2:
            upl = _sr_amount(matches[1].group())
        last_end = matches[-1].end() if matches else 0

        if isp == 0.0 and upl == 0.0:
            continue

        # Description: text after the last number on the date line + continuation lines.
        desc_parts = []
        after = date_line[last_end:].strip()
        if after:
            desc_parts.append(after)
        for ln in lines[date_line_idx + 1:]:
            s = ln.strip()
            if s:
                desc_parts.append(s)
        opis = re.sub(r'^[\s()]+|[\s()]+$', '', ' '.join(desc_parts)).strip()

        tx_type  = 'income' if upl > 0.0 else 'expense'
        amount   = upl if upl > 0.0 else isp
        learned  = _get_learned_category(opis)
        category = learned if learned else _categorize(opis, tx_type)

        results.append({
            'date': date_str, 'type': tx_type, 'amount': round(amount, 2),
            'category': category, 'description': opis,
            'person': 'Đorđe', 'suggested': True,
        })

    seen, unique = set(), []
    for parse_index, t in enumerate(results):
        key = (t['date'], t['amount'], t['description'][:40], parse_index)
        if key not in seen:
            seen.add(key)
            unique.append(t)
    unique.sort(key=lambda t: t['date'])
    return unique

@app.route('/api/import/parse', methods=['POST'])
def import_parse():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    try:
        file_bytes = request.files['file'].read()
        bank = request.form.get('bank', 'raiffeisen_rsd')
        person = request.form.get('person', 'Đorđe')
        filename = request.files['file'].filename.lower()
        if bank == 'raiffeisen_rsd':
            if filename.endswith('.pdf'):
                txs = _parse_raiffeisen_pdf(file_bytes)
            else:
                txs = _parse_raiffeisen_csv(file_bytes)
        elif bank == 'intesa':
            txs = _parse_intesa_pdf(file_bytes)
        else:
            return jsonify({'error': 'Ova banka još nije podržana'}), 400
        for t in txs:
            t['person'] = person
        return jsonify(txs)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/import/save', methods=['POST'])
def import_save():
    txs = request.json or []
    with get_db() as conn:
        for t in txs:
            conn.execute(
                "INSERT INTO transactions (date,type,amount,category,description,person) VALUES (?,?,?,?,?,?)",
                (t['date'], t['type'], float(t['amount']), t['category'],
                 t.get('description', ''), t.get('person', 'Đorđe'))
            )
            if t.get('description') and t.get('category'):
                conn.execute(
                    "INSERT OR REPLACE INTO description_categories (description_prefix, category) VALUES (?,?)",
                    (t['description'][:50], t['category'])
                )
            if t.get('category') == 'Pozajmica' and t.get('type') == 'income':
                name = (t.get('description') or 'Nepoznato')[:50]
                conn.execute(
                    "INSERT INTO debts (name,amount,paid,note,direction) VALUES (?,?,0,?,?)",
                    (name, float(t['amount']), 'Uvezeno iz izvoda', 'owe')
                )
            _maybe_update_savings(conn, t['category'], float(t['amount']), t['type'])
    return jsonify({'ok': True, 'count': len(txs)})

# ── Admin ───────────────────────────────────────────────────────────────────────

@app.route('/api/admin/categories', methods=['GET'])
def admin_get_categories():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM categories WHERE active=1 ORDER BY type, name"
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/admin/categories', methods=['POST'])
def admin_add_category():
    d = request.json
    name = (d.get('name') or '').strip()
    cat_type = d.get('type')
    if not name or cat_type not in ('expense', 'income'):
        return jsonify({'error': 'Naziv i tip su obavezni'}), 400
    with get_db() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO categories (name, type) VALUES (?,?)", (name, cat_type)
            )
            return jsonify({'ok': True, 'id': cur.lastrowid})
        except sqlite3.IntegrityError:
            return jsonify({'error': 'Kategorija već postoji'}), 409

@app.route('/api/admin/categories/<int:cid>', methods=['DELETE'])
def admin_delete_category(cid):
    with get_db() as conn:
        conn.execute("UPDATE categories SET active=0 WHERE id=?", (cid,))
    return jsonify({'ok': True})

@app.route('/api/admin/users', methods=['GET'])
def admin_get_users():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, username, person_name, role, active, created_at FROM users ORDER BY created_at"
        ).fetchall()
    return jsonify([dict(r) for r in rows])

@app.route('/api/admin/users', methods=['POST'])
def admin_add_user():
    d = request.json
    username = (d.get('username') or '').strip()
    password = d.get('password', '')
    person_name = (d.get('person_name') or '').strip() or None
    role = d.get('role', 'user')
    if not username or not password:
        return jsonify({'error': 'Korisničko ime i lozinka su obavezni'}), 400
    if role not in ('admin', 'user'):
        role = 'user'
    with get_db() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, person_name, role) VALUES (?,?,?,?)",
                (username, generate_password_hash(password), person_name, role)
            )
            return jsonify({'ok': True, 'id': cur.lastrowid})
        except sqlite3.IntegrityError:
            return jsonify({'error': 'Korisničko ime već postoji'}), 409

@app.route('/api/admin/users/<int:uid>', methods=['PATCH'])
def admin_update_user(uid):
    d = request.json
    with get_db() as conn:
        if d.get('password'):
            conn.execute("UPDATE users SET password_hash=? WHERE id=?",
                         (generate_password_hash(d['password']), uid))
        if 'role' in d:
            conn.execute("UPDATE users SET role=? WHERE id=?", (d['role'], uid))
        if 'person_name' in d:
            conn.execute("UPDATE users SET person_name=? WHERE id=?",
                         ((d['person_name'] or '').strip() or None, uid))
    return jsonify({'ok': True})

@app.route('/api/admin/users/<int:uid>', methods=['DELETE'])
def admin_delete_user(uid):
    if uid == session.get('user_id'):
        return jsonify({'error': 'Ne možeš obrisati sopstveni nalog'}), 400
    with get_db() as conn:
        conn.execute("UPDATE users SET active=0 WHERE id=?", (uid,))
    return jsonify({'ok': True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
