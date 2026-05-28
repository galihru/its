#!/usr/bin/env python3
"""
WebRTC camera publisher for the ITS Raspberry Pi.

Firebase RTDB is used only for signaling. Media flows peer-to-peer over WebRTC.
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

try:
    from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription
    from aiortc.contrib.media import MediaPlayer, MediaRelay
    from aiortc.sdp import candidate_from_sdp
except Exception as exc:  # pragma: no cover - startup guidance
    print(
        "aiortc belum terpasang. Jalankan: python3 -m pip install -r requirements-webrtc.txt",
        file=sys.stderr,
    )
    raise exc


def env(name: str, fallback: str) -> str:
    value = os.environ.get(name)
    return value.strip() if value and value.strip() else fallback


def env_int(name: str, fallback: int) -> int:
    try:
        return int(env(name, str(fallback)))
    except ValueError:
        return fallback


def now_ms() -> int:
    return int(time.time() * 1000)


DEVICE_ID = env("ITS_DEVICE_ID", "raspberry-its")
DEVICE_LABEL = env("ITS_DEVICE_LABEL", "Raspberry Pi 5 Controller")
FIREBASE_BASE_URL = env(
    "ITS_FIREBASE_BASE_URL",
    "https://itstelkom-default-rtdb.asia-southeast1.firebasedatabase.app/devices",
)
FIREBASE_AUTH = env("ITS_FIREBASE_AUTH", "")
SIGNAL_PATH = env("ITS_WEBRTC_SIGNAL_PATH", f"webrtc/devices/{DEVICE_ID}").strip("/")

CAMERA_INPUT = env("ITS_WEBRTC_CAMERA_DEVICE", env("ITS_CAMERA_DEVICE", "/dev/video0"))
CAMERA_FORMAT = env("ITS_WEBRTC_CAMERA_FORMAT", "v4l2")
WIDTH = env_int("ITS_WEBRTC_WIDTH", env_int("ITS_CAMERA_STREAM_WIDTH", 640))
HEIGHT = env_int("ITS_WEBRTC_HEIGHT", env_int("ITS_CAMERA_STREAM_HEIGHT", 480))
FPS = env_int("ITS_WEBRTC_FPS", env_int("ITS_CAMERA_STREAM_FPS", 15))
POLL_SECONDS = max(0.5, env_int("ITS_WEBRTC_POLL_MS", 750) / 1000)
SESSION_TTL_SECONDS = max(30, env_int("ITS_WEBRTC_SESSION_TTL_SECONDS", 120))


def firebase_root() -> str:
    base = FIREBASE_BASE_URL.rstrip("/")
    if base.endswith("/devices.json"):
        return base[: -len("/devices.json")]
    if base.endswith("/devices"):
        return base[: -len("/devices")]
    return base


FIREBASE_ROOT_URL = env("ITS_FIREBASE_ROOT_URL", firebase_root()).rstrip("/")


def firebase_url(path: str) -> str:
    parts = [urllib.parse.quote(part, safe="") for part in path.strip("/").split("/") if part]
    url = f"{FIREBASE_ROOT_URL}/{'/'.join(parts)}.json"
    if FIREBASE_AUTH:
        url += "?" + urllib.parse.urlencode({"auth": FIREBASE_AUTH})
    return url


def firebase_request(method: str, path: str, payload: Any | None = None) -> Any | None:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        firebase_url(path),
        data=data,
        headers=headers,
        method=method,
    )

    with urllib.request.urlopen(request, timeout=12) as response:
        body = response.read().decode("utf-8")
        if not body or body == "null":
            return None
        return json.loads(body)


async def fb_get(path: str) -> Any | None:
    return await asyncio.to_thread(firebase_request, "GET", path, None)


async def fb_put(path: str, payload: Any) -> Any | None:
    return await asyncio.to_thread(firebase_request, "PUT", path, payload)


async def fb_patch(path: str, payload: dict[str, Any]) -> Any | None:
    return await asyncio.to_thread(firebase_request, "PATCH", path, payload)


async def fb_delete(path: str) -> Any | None:
    return await asyncio.to_thread(firebase_request, "DELETE", path, None)


def ice_configuration() -> RTCConfiguration:
    stun_urls = [
        item.strip()
        for item in env("ITS_WEBRTC_STUN_URLS", "stun:stun.l.google.com:19302").split(",")
        if item.strip()
    ]
    servers: list[RTCIceServer] = []
    if stun_urls:
        servers.append(RTCIceServer(urls=stun_urls))

    turn_urls = [
        item.strip()
        for item in env("ITS_WEBRTC_TURN_URLS", "").split(",")
        if item.strip()
    ]
    if turn_urls:
        servers.append(
            RTCIceServer(
                urls=turn_urls,
                username=env("ITS_WEBRTC_TURN_USERNAME", ""),
                credential=env("ITS_WEBRTC_TURN_CREDENTIAL", ""),
            )
        )
    return RTCConfiguration(iceServers=servers)


class CameraSource:
    def __init__(self) -> None:
        self.player: MediaPlayer | None = None
        self.relay: MediaRelay | None = None

    def track(self):
        if self.player is None:
            options = {"video_size": f"{WIDTH}x{HEIGHT}", "framerate": str(FPS)}
            media_format = CAMERA_FORMAT or None
            self.player = MediaPlayer(CAMERA_INPUT, format=media_format, options=options)
            self.relay = MediaRelay()
            if self.player.video is None:
                raise RuntimeError(f"Tidak ada video track dari {CAMERA_INPUT}")
        assert self.relay is not None
        assert self.player.video is not None
        return self.relay.subscribe(self.player.video)

    def stop(self) -> None:
        if self.player:
            if self.player.video:
                self.player.video.stop()
            if self.player.audio:
                self.player.audio.stop()
        self.player = None
        self.relay = None


camera_source = CameraSource()
active_tasks: dict[str, asyncio.Task[None]] = {}
active_peers: dict[str, RTCPeerConnection] = {}


async def publish_status(status: str, message: str = "") -> None:
    payload = {
        "deviceId": DEVICE_ID,
        "label": DEVICE_LABEL,
        "status": status,
        "cameraReady": status == "online",
        "mode": "webrtc",
        "input": CAMERA_INPUT,
        "format": CAMERA_FORMAT,
        "width": WIDTH,
        "height": HEIGHT,
        "fps": FPS,
        "updatedAt": now_ms(),
    }
    if message:
        payload["message"] = message
    await fb_put(f"{SIGNAL_PATH}/status", payload)

    try:
        await fb_patch(
            f"devices/{DEVICE_ID}",
            {
                "cameraEnabled": True,
                "cameraMode": "webrtc",
                "webrtcEnabled": True,
                "webrtcPath": SIGNAL_PATH,
                "cameraReady": status == "online",
            },
        )
    except Exception as exc:
        print(f"[webrtc] device metadata patch skipped: {exc}")


def parse_browser_candidate(raw: dict[str, Any]):
    candidate_text = str(raw.get("candidate", "")).strip()
    if not candidate_text:
        return None
    if candidate_text.startswith("candidate:"):
        candidate_text = candidate_text.split(":", 1)[1]
    candidate = candidate_from_sdp(candidate_text)
    candidate.sdpMid = raw.get("sdpMid")
    candidate.sdpMLineIndex = raw.get("sdpMLineIndex")
    return candidate


async def add_viewer_candidates(
    pc: RTCPeerConnection,
    session_path: str,
    seen: set[str],
) -> None:
    data = await fb_get(f"{session_path}/viewerCandidates")
    if not isinstance(data, dict):
        return
    for key, raw in data.items():
        if key in seen or not isinstance(raw, dict):
            continue
        seen.add(key)
        try:
            candidate = parse_browser_candidate(raw)
            if candidate is not None:
                await pc.addIceCandidate(candidate)
        except Exception as exc:
            print(f"[webrtc] candidate {key} ignored: {exc}")


async def handle_session(session_id: str, session: dict[str, Any]) -> None:
    session_path = f"{SIGNAL_PATH}/sessions/{session_id}"
    pc = RTCPeerConnection(configuration=ice_configuration())
    active_peers[session_id] = pc
    seen_candidates: set[str] = set()
    started_at = now_ms()

    @pc.on("connectionstatechange")
    async def on_connectionstatechange() -> None:
        await fb_patch(
            session_path,
            {
                "streamerConnectionState": pc.connectionState,
                "updatedAt": now_ms(),
            },
        )

    try:
        offer = session.get("offer")
        if not isinstance(offer, dict) or not offer.get("sdp"):
            raise RuntimeError("session tidak memiliki offer WebRTC")

        pc.addTrack(camera_source.track())
        await pc.setRemoteDescription(
            RTCSessionDescription(sdp=str(offer["sdp"]), type=str(offer.get("type", "offer")))
        )
        await add_viewer_candidates(pc, session_path, seen_candidates)

        answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        await fb_patch(
            session_path,
            {
                "answer": {
                    "type": pc.localDescription.type,
                    "sdp": pc.localDescription.sdp,
                },
                "streamerStatus": "answer-sent",
                "streamerConnectionState": pc.connectionState,
                "updatedAt": now_ms(),
            },
        )
        print(f"[webrtc] answered session {session_id}")

        while now_ms() - started_at < SESSION_TTL_SECONDS * 1000:
            latest = await fb_get(session_path)
            if not isinstance(latest, dict) or latest.get("viewerStatus") == "closed":
                break
            await add_viewer_candidates(pc, session_path, seen_candidates)
            await fb_patch(
                session_path,
                {
                    "streamerConnectionState": pc.connectionState,
                    "updatedAt": now_ms(),
                },
            )
            if pc.connectionState in {"closed", "failed"}:
                break
            await asyncio.sleep(POLL_SECONDS)
    except Exception as exc:
        print(f"[webrtc] session {session_id} failed: {exc}")
        try:
            await fb_patch(
                session_path,
                {
                    "streamerStatus": "failed",
                    "streamerError": str(exc),
                    "updatedAt": now_ms(),
                },
            )
        except Exception:
            pass
    finally:
        await pc.close()
        active_peers.pop(session_id, None)
        print(f"[webrtc] closed session {session_id}")


async def cleanup_stale_sessions(sessions: dict[str, Any]) -> None:
    cutoff = now_ms() - SESSION_TTL_SECONDS * 1000
    for session_id, session in sessions.items():
        if session_id in active_tasks:
            continue
        if not isinstance(session, dict):
            continue
        updated_at = int(session.get("updatedAt") or session.get("createdAt") or 0)
        if updated_at and updated_at < cutoff:
            await fb_delete(f"{SIGNAL_PATH}/sessions/{session_id}")


async def watch_sessions(stop_event: asyncio.Event) -> None:
    await publish_status("online")
    print(
        f"[webrtc] ready device={DEVICE_ID} input={CAMERA_INPUT} "
        f"size={WIDTH}x{HEIGHT}@{FPS} signal={SIGNAL_PATH}"
    )

    last_status_at = 0
    while not stop_event.is_set():
        try:
            sessions = await fb_get(f"{SIGNAL_PATH}/sessions")
            if not isinstance(sessions, dict):
                sessions = {}

            for session_id, task in list(active_tasks.items()):
                if task.done():
                    active_tasks.pop(session_id, None)

            await cleanup_stale_sessions(sessions)

            for session_id, session in sessions.items():
                if session_id in active_tasks or not isinstance(session, dict):
                    continue
                if session.get("answer") or session.get("viewerStatus") == "closed":
                    continue
                offer = session.get("offer")
                if isinstance(offer, dict) and offer.get("sdp"):
                    active_tasks[session_id] = asyncio.create_task(handle_session(session_id, session))

            if time.time() - last_status_at > 8:
                await publish_status("online")
                last_status_at = time.time()
        except urllib.error.HTTPError as exc:
            print(f"[webrtc] Firebase HTTP {exc.code}: {exc.read().decode('utf-8', 'ignore')[:180]}")
            await asyncio.sleep(3)
        except Exception as exc:
            print(f"[webrtc] watch error: {exc}")
            try:
                await publish_status("degraded", str(exc))
            except Exception:
                pass
            await asyncio.sleep(3)

        await asyncio.sleep(POLL_SECONDS)


async def main() -> None:
    stop_event = asyncio.Event()

    def request_stop() -> None:
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, request_stop)
        except NotImplementedError:
            signal.signal(sig, lambda *_: request_stop())

    try:
        await watch_sessions(stop_event)
    finally:
        await publish_status("offline")
        for task in active_tasks.values():
            task.cancel()
        for pc in list(active_peers.values()):
            await pc.close()
        camera_source.stop()


if __name__ == "__main__":
    asyncio.run(main())
