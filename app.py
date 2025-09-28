import os, json, random, smtplib, io, datetime, time
from email.message import EmailMessage
from flask import Flask, render_template, request, jsonify, send_file
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

load_dotenv()

APP_SECRET = os.getenv("SECRET_KEY", "dev-secret")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8080"))

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
MASTER_PATH = os.path.join(DATA_DIR, "master_questions.json")
ACTIVE_PATH = os.path.join(DATA_DIR, "active_pool.json")
META_PATH = os.path.join(DATA_DIR, "meta.json")

POOL_DAYS_DEFAULT = 5
CHURN_MIN_DEFAULT = 10
CHURN_MAX_DEFAULT = 15

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = APP_SECRET

def load_json(path, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)

def ensure_active_pool():
    """Refresh active pool every N days with ~10–15% churn per level."""
    master = load_json(MASTER_PATH, {"questions": []})
    meta = load_json(META_PATH, {})
    active = load_json(ACTIVE_PATH, {"lastRefresh": None, "questions": []})

    pool_days = int(meta.get("poolDays", POOL_DAYS_DEFAULT))
    churn_min = int(meta.get("churnPercentMin", CHURN_MIN_DEFAULT))
    churn_max = int(meta.get("churnPercentMax", CHURN_MAX_DEFAULT))

    now = datetime.datetime.utcnow()
    last = active.get("lastRefresh")
    needs_refresh = True
    if last:
        last_dt = datetime.datetime.fromisoformat(last.replace("Z",""))
        needs_refresh = (now - last_dt).days >= pool_days

    if not needs_refresh and active["questions"]:
        return active  # good

    # Build pool per level: keep as many from previous, replace 10–15% at random
    all_by_level = {"U10": [], "11-15": [], "16+": []}
    for q in master["questions"]:
        lvl = q.get("level")
        if lvl in all_by_level:
            all_by_level[lvl].append(q)

    # If first time (no active), just copy master
    if not active["questions"]:
        new_pool = master["questions"]
    else:
        old_by_level = {"U10": [], "11-15": [], "16+": []}
        for q in active["questions"]:
            lvl = q.get("level")
            if lvl in old_by_level:
                old_by_level[lvl].append(q)

        new_pool = []
        for lvl in ["U10", "11-15", "16+"]:
            old = old_by_level[lvl]
            allq = all_by_level[lvl]
            if not allq:
                continue
            churn_pct = random.randint(churn_min, churn_max)
            churn_count = max(1, (len(old) * churn_pct) // 100) if old else max(1, len(allq)//10)
            # Keep survivors
            survivors = []
            if old:
                survivors = old.copy()
                random.shuffle(survivors)
                survivors = survivors[:-churn_count] if len(survivors) > churn_count else []
            # Pick replacements from master that are not already in survivors by id
            survivor_ids = {q["id"] for q in survivors}
            candidates = [q for q in allq if q["id"] not in survivor_ids]
            random.shuffle(candidates)
            replacements = candidates[:churn_count]
            new_pool.extend(survivors + replacements)

    active = {
        "lastRefresh": now.isoformat() + "Z",
        "questions": new_pool
    }
    save_json(ACTIVE_PATH, active)
    return active

def pick_questions(level: str, n: int = 20, mode: str = "quiz"):
    active = ensure_active_pool()
    candidates = [q for q in active["questions"] if q.get("level") == level]
    if len(candidates) < n:
        # fallback: if pool is small, pull from master
        master = load_json(MASTER_PATH, {"questions": []})
        candidates = [q for q in master["questions"] if q.get("level") == level]
    random.shuffle(candidates)
    out = candidates[:n]
    # strip heavy text for quiz if needed
    if mode == "quiz":
        # keep lesson fields (not used), okay
        pass
    return out


@app.context_processor
def inject_asset_ver():
    return {'ASSET_VER': int(time.time())}


@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/questions")
def api_questions():
    mode = request.args.get("mode", "quiz")
    level = request.args.get("level", "U10")
    if level not in ["U10", "11-15", "16+"]:
        level = "U10"
    return jsonify(pick_questions(level, 20, mode))

@app.route("/api/certificate", methods=["POST"])
def api_certificate():
    data = request.get_json(force=True)
    name = data.get("name", "Dog Fan")
    level = data.get("level", "U10")
    mode = data.get("mode", "quiz")
    score = int(data.get("score", 0))
    total = int(data.get("total", 80))
    email = data.get("email", "").strip()

    # Generate PDF
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    c.setFont("Helvetica-Bold", 24)
    c.drawCentredString(w/2, h-100, "Dog Knowledge Certificate")
    c.setFont("Helvetica", 14)
    c.drawCentredString(w/2, h-140, f"Awarded to {name}")
    c.drawCentredString(w/2, h-165, f"Level: {level}   Mode: {mode}")
    percent = round((score/total)*100) if total else 0
    c.drawCentredString(w/2, h-190, f"Score: {score} / {total}  ({percent}%)")
    c.drawCentredString(w/2, h-220, datetime.datetime.now().strftime("Date: %Y-%m-%d %H:%M"))
    c.line(100, h-230, w-100, h-230)
    c.setFont("Helvetica-Oblique", 12)
    c.drawCentredString(w/2, h-260, "Great job learning about dogs! 🐾")
    c.showPage()
    c.save()
    pdf_bytes = buf.getvalue()
    buf.close()

    if not email:
        # Let user download if no email provided
        return send_file(io.BytesIO(pdf_bytes), mimetype="application/pdf",
                         as_attachment=True, download_name=f"dog-certificate-{name}.pdf")

    # Email if SMTP configured
    host = os.getenv("SMTP_HOST")
    user = os.getenv("SMTP_USERNAME")
    pwd  = os.getenv("SMTP_PASSWORD")
    port = int(os.getenv("SMTP_PORT", "587"))
    use_tls = str(os.getenv("SMTP_USE_TLS", "true")).lower() == "true"
    from_addr = os.getenv("FROM_EMAIL", "quiz@localhost")

    if not host or not user or not pwd:
        return jsonify({"ok": False, "error": "SMTP not configured on server."}), 200

    msg = EmailMessage()
    msg["Subject"] = "Your Dog Quiz Certificate"
    msg["From"] = from_addr
    msg["To"] = email
    msg.set_content(f"Hi {name},\n\nAttached is your Dog Quiz certificate. Great job!\n\n🐶")
    msg.add_attachment(pdf_bytes, maintype="application", subtype="pdf",
                       filename=f"dog-certificate-{name}.pdf")

    try:
        with smtplib.SMTP(host, port, timeout=15) as s:
            if use_tls: s.starttls()
            s.login(user, pwd)
            s.send_message(msg)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 200

# --- scheduler to auto-refresh pool daily (checks 5-day rule) ---
sched = BackgroundScheduler(daemon=True)
@sched.scheduled_job("interval", hours=24)
def _refresh_job():
    try:
        ensure_active_pool()
    except Exception:
        pass
sched.start()

if __name__ == "__main__":
    # Ensure pool exists at startup
    ensure_active_pool()
    app.run(host=HOST, port=PORT, debug=False)
