from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query, Header
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import uuid
import socket
from dotenv import load_dotenv
from pydantic import BaseModel
from typing import Dict, Optional
from livekit import api

# Firebase Admin SDK
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth, firestore

load_dotenv()

# ─── Firebase init ────────────────────────────────────────────────────────────
SERVICE_ACCOUNT_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
firebase_admin.initialize_app(cred)
db = firestore.client()

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="Next-Gen Meet AI Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LIVEKIT_API_KEY    = os.getenv("LIVEKIT_API_KEY", "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "secret")

# In-memory: host WebSocket connections (these don't need persistence)
host_connections: Dict[str, WebSocket] = {}

# In-memory: Companion WebRTC Signaling
companion_connections: Dict[str, list[WebSocket]] = {}


# ─── Auth helper ─────────────────────────────────────────────────────────────
def verify_firebase_token(authorization: Optional[str]) -> dict:
    """Verify Firebase ID token from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")
    id_token = authorization.split(" ")[1]
    try:
        decoded = firebase_auth.verify_id_token(id_token)
        return decoded
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session. Please sign in again.")


# ─── Pydantic models ──────────────────────────────────────────────────────────
class TokenRequest(BaseModel):
    room_name: str
    participant_name: str
    is_host: bool = False

class RoomLockRequest(BaseModel):
    room_name: str


# ─── LiveKit token endpoint ───────────────────────────────────────────────────
@app.post("/token")
async def generate_token(
    request: TokenRequest,
    authorization: Optional[str] = Header(None),
):
    # Verify Firebase auth
    verify_firebase_token(authorization)

    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        raise HTTPException(status_code=500, detail="LiveKit credentials not configured")

    # Check if room is locked in Firestore
    room_doc = db.collection("rooms").document(request.room_name).get()
    if room_doc.exists and room_doc.to_dict().get("locked") and not request.is_host:
        raise HTTPException(
            status_code=423,
            detail="Room is locked. Send a join request to the host."
        )

    token = api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    token.with_identity(request.participant_name)
    token.with_name(request.participant_name)
    if request.is_host:
        token.with_metadata(json.dumps({"isHost": True}))
    token.with_grants(api.VideoGrants(room_join=True, room=request.room_name))
    return {"token": token.to_jwt()}


# ─── Room lock / unlock ───────────────────────────────────────────────────────
@app.post("/room/lock")
async def lock_room(
    request: RoomLockRequest,
    authorization: Optional[str] = Header(None),
):
    verify_firebase_token(authorization)
    db.collection("rooms").document(request.room_name).set(
        {"locked": True}, merge=True
    )
    return {"status": "locked", "room": request.room_name}

@app.post("/room/unlock")
async def unlock_room(
    request: RoomLockRequest,
    authorization: Optional[str] = Header(None),
):
    verify_firebase_token(authorization)
    db.collection("rooms").document(request.room_name).set(
        {"locked": False}, merge=True
    )
    return {"status": "unlocked", "room": request.room_name}

@app.get("/room/status/{room_name}")
async def room_status(room_name: str):
    doc = db.collection("rooms").document(room_name).get()
    locked = doc.to_dict().get("locked", False) if doc.exists else False
    return {"room": room_name, "locked": locked}


# ─── Host WebSocket ───────────────────────────────────────────────────────────
@app.websocket("/ws/host/{room_name}")
async def host_ws(websocket: WebSocket, room_name: str):
    await websocket.accept()
    host_connections[room_name] = websocket

    # Send any already-pending requests from Firestore
    pending = db.collection("joinRequests") \
        .where("room", "==", room_name) \
        .where("status", "==", "pending") \
        .stream()
    for doc in pending:
        d = doc.to_dict()
        await websocket.send_json({
            "type": "join_request",
            "request_id": doc.id,
            "participant": d["participantName"],
        })

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "accept":
                rid = data.get("request_id")
                doc_ref = db.collection("joinRequests").document(rid)
                doc = doc_ref.get()
                if doc.exists and doc.to_dict().get("status") == "pending":
                    req = doc.to_dict()
                    # Generate LiveKit token
                    tok = api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
                    tok.with_identity(req["participantName"]).with_name(req["participantName"])
                    tok.with_grants(api.VideoGrants(room_join=True, room=room_name))
                    lk_token = tok.to_jwt()
                    # Update Firestore
                    doc_ref.update({"status": "accepted", "token": lk_token})

            elif data.get("type") == "reject":
                rid = data.get("request_id")
                db.collection("joinRequests").document(rid).update({"status": "rejected"})

    except WebSocketDisconnect:
        if host_connections.get(room_name) == websocket:
            del host_connections[room_name]


# ─── Participant join-request WebSocket ───────────────────────────────────────
@app.websocket("/ws/join-request/{room_name}")
async def join_request_ws(
    websocket: WebSocket,
    room_name: str,
    name: str = Query(...),
):
    await websocket.accept()

    # Write join request to Firestore
    rid = str(uuid.uuid4())
    doc_ref = db.collection("joinRequests").document(rid)
    doc_ref.set({
        "room": room_name,
        "participantName": name,
        "status": "pending",
    })

    # Notify host if online
    host_ws_conn = host_connections.get(room_name)
    if host_ws_conn:
        try:
            await host_ws_conn.send_json({
                "type": "join_request",
                "request_id": rid,
                "participant": name,
            })
        except Exception:
            pass

    await websocket.send_json({"type": "waiting"})

    try:
        while True:
            # Poll Firestore for status change
            msg = await websocket.receive_json()
            if msg.get("type") == "poll":
                doc = doc_ref.get()
                if doc.exists:
                    status = doc.to_dict().get("status")
                    if status == "accepted":
                        token = doc.to_dict().get("token", "")
                        await websocket.send_json({"type": "accepted", "token": token})
                        doc_ref.delete()
                        break
                    elif status == "rejected":
                        await websocket.send_json({"type": "rejected"})
                        doc_ref.delete()
                        break
            elif msg.get("type") == "cancel":
                doc_ref.delete()
                break
    except WebSocketDisconnect:
        pass
    finally:
        # Clean up if still pending
        try:
            d = doc_ref.get()
            if d.exists and d.to_dict().get("status") == "pending":
                doc_ref.delete()
        except Exception:
            pass


# ─── Companion WebRTC Signaling ───────────────────────────────────────────────
@app.websocket("/ws/companion/{session_id}")
async def companion_ws(websocket: WebSocket, session_id: str):
    await websocket.accept()
    if session_id not in companion_connections:
        companion_connections[session_id] = []
    companion_connections[session_id].append(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
            # Broadcast to everyone else in this session
            for conn in companion_connections[session_id]:
                if conn != websocket:
                    await conn.send_text(data)
    except WebSocketDisconnect:
        if websocket in companion_connections[session_id]:
            companion_connections[session_id].remove(websocket)
        if not companion_connections[session_id]:
            del companion_connections[session_id]

# ─── Health & Utilities ───────────────────────────────────────────────────────
@app.get("/local-ip")
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return {"ip": ip}

@app.get("/")
def read_root():
    return {"message": "Next-Gen Meet AI Backend (Firebase) is running"}

