"""
Frelancia Live Hub - Hugging Face Space
Real-time Mostaql Scraper and SignalR/WebSocket Hub in Python
Runs 24/7 on Hugging Face CPU Basic (Free)
"""

import asyncio
import re
import time
import uuid
from datetime import datetime
from typing import Set, Dict, Any, List

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import gradio as gr

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RECORD_SEPARATOR = chr(0x1E)

# Global State
class HubState:
    def __init__(self):
        self.active_sockets: Set[WebSocket] = set()
        self.seen_job_ids: Set[str] = set()
        self.recent_jobs: List[Dict[str, Any]] = []
        self.is_first_scrape = True
        self.total_scrapes = 0
        self.total_new_jobs = 0
        self.last_scrape_time = None
        self.start_time = datetime.utcnow().isoformat()

state = HubState()

def parse_mostaql_html(html: str) -> List[Dict[str, Any]]:
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

async def broadcast_new_jobs(new_jobs: List[Dict[str, Any]]):
    if not new_jobs or not state.active_sockets:
        return
        
    payload = {"jobs": new_jobs}
    signalr_msg = {
        "type": 1,
        "target": "NewJobsDetected",
        "arguments": [payload]
    }
    
    import json
    frame = json.dumps(signalr_msg, ensure_ascii=False) + RECORD_SEPARATOR
    
    dead_sockets = set()
    for ws in list(state.active_sockets):
        try:
            await ws.send_text(frame)
        except Exception:
            dead_sockets.add(ws)
            
    state.active_sockets.difference_update(dead_sockets)
    print(f"[BROADCAST] Sent {len(new_jobs)} new job(s) to active extensions.")

async def scrape_loop():
    headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
    
    print("[SCRAPER] Started Mostaql live monitoring loop...")
    async with httpx.AsyncClient(timeout=15.0, headers=headers) as client:
        while True:
            try:
                state.total_scrapes += 1
                state.last_scrape_time = datetime.utcnow().isoformat()
                
                resp = await client.get(f"https://mostaql.com/projects?sort=latest&_t={int(time.time()*1000)}")
                if resp.status_code == 200:
                    jobs = parse_mostaql_html(resp.text)
                    
                    if state.is_first_scrape:
                        state.is_first_scrape = False
                        for j in jobs:
                            state.seen_job_ids.add(j["id"])
                        state.recent_jobs = jobs[:50]
                        print(f"[BOOTSTRAP] Seeded {len(jobs)} existing projects.")
                    else:
                        new_jobs = [j for j in jobs if j["id"] not in state.seen_job_ids]
                        if new_jobs:
                            for j in new_jobs:
                                state.seen_job_ids.add(j["id"])
                            state.total_new_jobs += len(new_jobs)
                            state.recent_jobs = (new_jobs + state.recent_jobs)[:50]
                            print(f"[NEW JOBS] Detected {len(new_jobs)} new project(s)!")
                            await broadcast_new_jobs(new_jobs)
                else:
                    print(f"[SCRAPER] HTTP Error: {resp.status_code}")
            except Exception as e:
                print(f"[SCRAPER] Error: {e}")
                
            await asyncio.sleep(15)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(scrape_loop())

@app.post("/jobNotificationHub/negotiate")
@app.post("/negotiate")
async def negotiate():
    return {
        "negotiateVersion": 1,
        "connectionId": uuid.uuid4().hex,
        "connectionToken": uuid.uuid4().hex,
        "availableTransports": [
            {"transport": "WebSockets", "transferFormats": ["Text"]}
        ]
    }

@app.websocket("/jobNotificationHub")
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    state.active_sockets.add(websocket)
    print(f"[WS] Client connected. Total: {len(state.active_sockets)}")
    
    is_handshake_done = False
    
    try:
        while True:
            data = await websocket.receive_text()
            if not is_handshake_done and "protocol" in data and "json" in data:
                is_handshake_done = True
                await websocket.send_text(f"{{}}{RECORD_SEPARATOR}")
                
                import json
                connected_msg = json.dumps({
                    "type": 1,
                    "target": "Connected",
                    "arguments": [{"status": "connected", "server": "Frelancia HF Hub"}]
                })
                await websocket.send_text(connected_msg + RECORD_SEPARATOR)
            elif data.startswith('{"type":6}') or 'Ping' in data:
                await websocket.send_text(f'{{"type":6}}{RECORD_SEPARATOR}')
    except WebSocketDisconnect:
        pass
    finally:
        state.active_sockets.discard(websocket)
        print(f"[WS] Client disconnected. Total: {len(state.active_sockets)}")

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "active_clients": len(state.active_sockets),
        "total_new_jobs": state.total_new_jobs,
        "last_scrape": state.last_scrape_time
    }

# Mount Gradio for Hugging Face UI
def create_gradio_dashboard():
    with gr.Blocks(title="Frelancia Live Hub") as demo:
        gr.Markdown(
            """
            # 🔔 Frelancia Live Hub (سيرفر التنبيهات المباشرة)
            ### يعمل على مدار الساعة 24/7 لمراقبة موقع مستقل وإرسال إشعارات فورية للإضافة.
            ---
            """
        )
        with gr.Row():
            status_box = gr.Textbox(label="حالة السيرفر", value="🟢 نشط ويعمل 24/7", interactive=False)
            clients_box = gr.Number(label="عدد الإضافات المتصلة الآن", value=lambda: len(state.active_sockets), every=5)
            jobs_count_box = gr.Number(label="إجمالي المشاريع المرصودة", value=lambda: state.total_new_jobs, every=5)
            
        gr.Markdown(
            """
            ### 📡 رابط الاتصال الخاص بإضافتك:
            انسخ رابط هذا الـ Space المباشر وضعه في إعدادات الإضافة متبوعاً بـ `/jobNotificationHub`:
            ```text
            https://ziadhassanein21-frelancia-hub.hf.space/jobNotificationHub
            ```
            """
        )
        
        recent_table = gr.Dataframe(
            headers=["المعرف", "عنوان المشروع", "الوقت", "الناشر", "الرابط"],
            value=lambda: [
                [j.get("id"), j.get("title"), j.get("time"), j.get("poster"), j.get("url")]
                for j in state.recent_jobs[:10]
            ],
            every=10,
            label="آخر 10 مشاريع رُصدت من مستقل"
        )
    return demo

demo = create_gradio_dashboard()
app = gr.mount_gradio_app(app, demo, path="/")
