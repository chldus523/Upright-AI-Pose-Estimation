import logging
import os
import base64
import time

os.environ.setdefault("MPLCONFIGDIR", ".cache/matplotlib")

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from posture import analyze_posture, reset_metric_smoothing

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("upright.api")

app = FastAPI(title="Upright Posture API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    payload = await file.read()
    frame = decode_image_bytes(payload)
    result = analyze_posture(frame)
    logger.info("REST /analyze: has_pose=%s score=%s", result.get("has_pose"), result.get("total_score"))
    return result


@app.websocket("/ws/analyze")
async def analyze_websocket(websocket: WebSocket):
    await websocket.accept()
    reset_metric_smoothing()
    client = websocket.client
    logger.info("WS 연결됨: %s", client)
    frame_count = 0

    try:
        while True:
            message = await websocket.receive_json()
            image_data = message.get("image")
            if not image_data:
                await websocket.send_json({"error": "empty_image_payload"})
                continue

            try:
                t0 = time.perf_counter()
                frame = decode_base64_image(image_data)
                result = analyze_posture(frame)
                elapsed_ms = int((time.perf_counter() - t0) * 1000)
                frame_count += 1
                if frame_count % 20 == 1:
                    logger.info(
                        "WS 프레임 #%d: has_pose=%s score=%s (%dms)",
                        frame_count, result.get("has_pose"), result.get("total_score"), elapsed_ms,
                    )
                await websocket.send_json(result)
            except ValueError as exc:
                logger.warning("WS 프레임 디코드 실패: %s", exc)
                await websocket.send_json({"error": str(exc)})
    except WebSocketDisconnect:
        logger.info("WS 연결 종료: %s (총 %d 프레임)", client, frame_count)
        reset_metric_smoothing()


def decode_image_bytes(payload: bytes):
    if not payload:
        raise HTTPException(status_code=400, detail="Empty image payload.")

    array = np.frombuffer(payload, dtype=np.uint8)
    frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Unsupported or invalid image data.")
    return frame


def decode_base64_image(image_data: str):
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]

    try:
        payload = base64.b64decode(image_data)
    except Exception as exc:
        raise ValueError("invalid_base64_image") from exc

    array = np.frombuffer(payload, dtype=np.uint8)
    frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if frame is None:
        raise ValueError("invalid_image_data")
    return frame
