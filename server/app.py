"""
Frelancia Live Hub - Hugging Face Space
Real-time Mostaql Scraper & SignalR WebSocket Hub
Runs 24/7 on Hugging Face CPU Basic (Free)
"""

import asyncio
import re
import time
import uuid
from datetime import datetime

import httpx
import gradio as gr
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

RECORD_SEPARATOR = chr(0x1E)

# Global State
class HubState:
    def __init__(self):
        self.active_sockets = set()
        self.seen_job_ids = set()
        self.recent_jobs = []
        self.is_first_scrape = True
        self.total_scrapes = 0
        self.total_new_jobs = 0
        self.last_scrape_time = "لم يبدأ بعد"

state = HubState()

def parse_mostaql_html(html: str):
    jobs = []
    seen = set()
    row_pattern = re.compile(r'<tr[^>]*class="[^"]*project-row[^"]*"[^>]*>(.*?)</tr>', re.DOTALL | re.IGNORECASE)
    
    for row in row_pattern.finditer(html):
        row_html = row.group(1)
        link_match = (
            re.search(r'<h2[^>]*>.*?<a\s+href="([^"]*\/project\/(\d+)[^"]*)"[^>]*>(.*?)</a>', row_html, re.DOTALL | re.IGNORECASE) or
            re.search(r'<a\s+href="([^"]*\/project\/(\d+)[^"]*)"[^>]*>(.*?)</a>', row_html, re.DOTALL | re.IGNORECASE)
        )
        if not link_match:
            continue
            
        raw_url = link_match.group(1)
        job_id = link_match.group(2)
        if job_id in seen:
            continue
        seen.add(job_id)
        
        url = raw_url if raw_url.startswith('http') else 'https://mostaql.com' + raw_url
        title = re.sub(r'<[^>]*>', '', link_match.group(3)).strip()
        
        poster_match = (
            re.search(r'<i class="fa fa-user"></i>.*?<bdi>(.*?)</bdi>', row_html, re.DOTALL | re.IGNORECASE) or
            re.search(r'<bdi>(.*?)</bdi>', row_html, re.DOTALL | re.IGNORECASE) or
            re.search(r'<i class="fa fa-user"></i>(.*?)</li>', row_html, re.DOTALL | re.IGNORECASE)
        )
        poster = re.sub(r'<[^>]*>', '', poster_match.group(1)).strip() if poster_match else ''
        
        time_match = re.search(r'<time\s+datetime="([^"]*)"[^>]*>(.*?)</time>', row_html, re.DOTALL | re.IGNORECASE)
        posted_at = time_match.group(1).strip() if time_match else ''
        time_text = re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', '', time_match.group(2))).strip() if time_match else ''
        
        bids_match = (
            re.search(r'<span class="hsoub-file-signature-icon"></span>(.*?)</li>', row_html, re.DOTALL | re.IGNORECASE) or
            re.search(r'<i class="fa fa-ticket"></i>(.*?)</li>', row_html, re.DOTALL | re.IGNORECASE)
        )
        bids_text = re.sub(r'<[^>]*>', '', bids_match.group(1)).strip() if bids_match else ''
        
        brief_match = re.search(r'<p[^>]*class="[^"]*project__brief[^"]*"[^>]*>(.*?)</p>', row_html, re.DOTALL | re.IGNORECASE)
        description = re.sub(r'\s+', ' ', re.sub(r'<[^>]*>', '', brief_match.group(1))).strip() if brief_match else ''
        
        jobs.append({
            "id": job_id,
            "title": title,
            "url": url,
            "poster": poster,
            "time": time_text,
            "postedAt": posted_at,
            "bidsText": bids_text,
            "description": description,
            "budget": "غير محدد"
        })
    return jobs

async def broadcast_new_jobs(new_jobs):
    if not new_jobs or not state.active_sockets:
        return
    import json
    payload = {"jobs": new_jobs}
    signalr_msg = json.dumps({"type": 1, "target": "NewJobsDetected", "arguments": [payload]}, ensure_ascii=False)
    frame = signalr_msg + RECORD_SEPARATOR
    
    dead = set()
    for ws in list(state.active_sockets):
        try:
            await ws.send_text(frame)
        except Exception:
            dead.add(ws)
    state.active_sockets.difference_update(dead)

async def scrape_loop():
    headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
    
    async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
        while True:
            try:
                state.total_scrapes += 1
                state.last_scrape_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                resp = await client.get(f"https://mostaql.com/projects?sort=latest&_t={int(time.time()*1000)}")
                if resp.status_code == 200:
                    jobs = parse_mostaql_html(resp.text)
                    if state.is_first_scrape:
                        state.is_first_scrape = False
                        for j in jobs:
                            state.seen_job_ids.add(j["id"])
                        state.recent_jobs = jobs[:30]
                    else:
                        new_jobs = [j for j in jobs if j["id"] not in state.seen_job_ids]
                        if new_jobs:
                            for j in new_jobs:
                                state.seen_job_ids.add(j["id"])
                            state.total_new_jobs += len(new_jobs)
                            state.recent_jobs = (new_jobs + state.recent_jobs)[:30]
                            await broadcast_new_jobs(new_jobs)
            except Exception as e:
                pass
            await asyncio.sleep(15)

# Fast API setup
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def on_start():
    asyncio.create_task(scrape_loop())

@app.post("/jobNotificationHub/negotiate")
@app.post("/negotiate")
def negotiate():
    return {
        "negotiateVersion": 1,
        "connectionId": uuid.uuid4().hex,
        "connectionToken": uuid.uuid4().hex,
        "availableTransports": [{"transport": "WebSockets", "transferFormats": ["Text"]}]
    }

@app.websocket("/jobNotificationHub")
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    state.active_sockets.add(websocket)
    is_done = False
    try:
        while True:
            data = await websocket.receive_text()
            if not is_done and "protocol" in data:
                is_done = True
                await websocket.send_text(f"{{}}{RECORD_SEPARATOR}")
                import json
                await websocket.send_text(json.dumps({"type": 1, "target": "Connected", "arguments": [{"status": "connected"}]}) + RECORD_SEPARATOR)
            elif 'Ping' in data or '{"type":6}' in data:
                await websocket.send_text(f'{{"type":6}}{RECORD_SEPARATOR}')
    except WebSocketDisconnect:
        pass
    finally:
        state.active_sockets.discard(websocket)

@app.get("/health")
def health():
    return {
        "status": "ok",
        "active_clients": len(state.active_sockets),
        "total_new_jobs": state.total_new_jobs,
        "last_scrape": state.last_scrape_time
    }

# Gradio Interface
def get_stats():
    return (
        "🟢 نشط ويعمل 24/7",
        len(state.active_sockets),
        state.total_new_jobs,
        state.last_scrape_time
    )

def get_jobs():
    return [
        [j.get("id"), j.get("title"), j.get("time"), j.get("poster"), j.get("url")]
        for j in state.recent_jobs[:10]
    ]

with gr.Blocks(title="Frelancia Live Hub") as demo:
    gr.Markdown("# 🔔 Frelancia Live Hub - سيرفر التنبيهات المباشرة 24/7")
    with gr.Row():
        status_txt = gr.Textbox(label="الحالة", value="🟢 نشط ويعمل 24/7")
        clients_num = gr.Number(label="الإضافات المتصلة الآن", value=0)
        jobs_num = gr.Number(label="مشاريع رُصدت وبُثت", value=0)
        last_scrape = gr.Textbox(label="آخر فحص", value="الآن")
    
    gr.Markdown("### 📡 رابط السيرفر لإضافتك:\n`https://ziadhassanein21-frelancia-hub.hf.space/jobNotificationHub`")
    
    table = gr.Dataframe(headers=["المعرف", "العنوان", "الوقت", "الناشر", "الرابط"], value=[])

# Mount Gradio to FastAPI
app = gr.mount_gradio_app(app, demo, path="/")
