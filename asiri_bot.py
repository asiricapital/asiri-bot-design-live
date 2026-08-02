# -*- coding: utf-8 -*-
"""Asiri Capital - بوت تقارير المحفظة (Yahoo Chart API)"""

import os, sys, json, urllib.request
from datetime import datetime, timezone, timedelta

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# المحفظة: (الرمز, الكمية, التكلفة, الوقف)
PORTFOLIO = [
    ("AMPL", 56.59, 8.80, 8.80),
    ("RKLB", 3.0, 83.94, 74.50),
    ("ADMA", 32.0, 9.15, 8.75),
]

RULES = []
STOP_WARN_PCT = 3.0
UA = {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"}


def fetch_one(sym):
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
           "?interval=1d&range=1d")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=15) as r:
        d = json.loads(r.read().decode())
    meta = d["chart"]["result"][0]["meta"]
    price = meta.get("regularMarketPrice")
    prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    chg = ((price - prev) / prev * 100) if (price and prev) else 0.0
    return {"price": price, "chg": chg}


def fetch_quotes(symbols):
    out = {}
    for s in symbols:
        try:
            out[s] = fetch_one(s)
        except Exception:
            pass
    return out


def build_report(quotes):
    riyadh = timezone(timedelta(hours=3))
    now = datetime.now(riyadh).strftime("%H:%M")
    lines = [f"🌿 <b>Asiri Capital</b> | {now} بتوقيت الرياض", ""]
    total, alerts = 0.0, []
    for sym, qty, cost, stop in PORTFOLIO:
        q = quotes.get(sym)
        if not q or not q["price"]:
            lines.append(f"• {sym}: تعذر جلب السعر")
            continue
        p = q["price"]
        pl = (p - cost) * qty
        total += pl
        e = "🟢" if pl >= 0 else "🔴"
        lines.append(f"{e} <b>{sym}</b>: {p:.2f}$ ({q['chg']:+.1f}% اليوم)"
                     f" | مركزك {pl:+.0f}$")
        dist = (p - stop) / p * 100
        if 0 < dist <= STOP_WARN_PCT:
            alerts.append(f"⚠️ {sym} على بعد {dist:.1f}% من وقفه ({stop}$)")
        elif p <= stop:
            alerts.append(f"🛑 {sym} عند/تحت الوقف ({stop}$) - تحقق من عوائد")
    for sym, trig, msg in RULES:
        q = quotes.get(sym)
        if q and q["price"] and q["price"] >= trig:
            alerts.append("⚑ " + msg)
    lines += ["", f"💼 <b>صافي المحفظة: {total:+.0f}$</b>"]
    if alerts:
        lines += [""] + alerts
    lines += ["", "<i>Yahoo Chart - التنفيذ والوقف في عوائد</i>"]
    return "\n".join(lines)


def send(text):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = json.dumps({"chat_id": CHAT_ID, "text": text,
                       "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def main():
    if not BOT_TOKEN or not CHAT_ID:
        sys.exit("متغيرات البيئة مفقودة")
    quotes = fetch_quotes([p[0] for p in PORTFOLIO])
    if not quotes:
        send("🌿 Asiri Capital: كل مصادر الأسعار رفضت الطلب هذه الدورة")
        sys.exit(0)
    print("ok:", send(build_report(quotes)).get("ok"))


if __name__ == "__main__":
    main()
