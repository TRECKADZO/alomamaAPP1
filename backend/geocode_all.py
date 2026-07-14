#!/usr/bin/env python3
"""
Batch géocodage - Géocode tous les établissements non encore géocodés via Nominatim.
Respect rate limit : 1 requête/seconde.
"""
import asyncio, os, sys
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
import httpx
from urllib.parse import quote
from datetime import datetime

async def geocode_one(client, e):
    parts = [e.get("adresse"), e.get("commune"), e.get("region"), "Côte d'Ivoire"]
    query = ", ".join([p for p in parts if p])
    if not query.strip(","): return None
    try:
        url = f"https://nominatim.openstreetmap.org/search?q={quote(query)}&format=json&limit=1&countrycodes=ci"
        r = await client.get(url, headers={"User-Agent": "AloMaman/1.0", "Accept": "application/json"}, timeout=15.0)
        data = r.json() if r.status_code == 200 else []
        if not data:
            q2 = ", ".join([p for p in [e.get("commune"), e.get("region"), "Côte d'Ivoire"] if p])
            if q2.strip(","):
                r2 = await client.get(f"https://nominatim.openstreetmap.org/search?q={quote(q2)}&format=json&limit=1&countrycodes=ci",
                                       headers={"User-Agent": "AloMaman/1.0", "Accept": "application/json"}, timeout=15.0)
                data = r2.json() if r2.status_code == 200 else []
        if data:
            return {"lat": float(data[0]["lat"]), "lon": float(data[0]["lon"]),
                    "geocoded_display": data[0].get("display_name", ""), "geocoded_at": datetime.utcnow().isoformat()}
    except Exception as ex:
        print(f"    ⚠ {e['id']} error: {str(ex)[:60]}", file=sys.stderr)
    return None

async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client["alomaman"]
    todo = await db.etablissements_officiels.find({"lat": {"$exists": False}}, {"_id": 0}).to_list(None)
    total = len(todo)
    print(f"📍 {total} établissements à géocoder...")
    ok, fail = 0, 0
    async with httpx.AsyncClient() as http:
        for i, e in enumerate(todo, 1):
            geo = await geocode_one(http, e)
            if geo:
                await db.etablissements_officiels.update_one({"id": e["id"]}, {"$set": geo})
                ok += 1
            else:
                fail += 1
            if i % 20 == 0:
                print(f"  {i}/{total} · OK={ok} · KO={fail}")
            await asyncio.sleep(1.1)  # respect rate limit Nominatim (1 req/s)
    print(f"✅ Terminé : {ok}/{total} géocodés · {fail} échecs")

asyncio.run(main())
