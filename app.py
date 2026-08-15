"""Small, chat-only bridge between 01 Mobile and Ollama Cloud."""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque

import requests
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

OLLAMA_URL = "https://ollama.com/api/chat"
MAX_MESSAGE_CHARS = 8_000
WINDOW_SECONDS = 60
MAX_REQUESTS_PER_WINDOW = 20
SYSTEM_MESSAGE = (
    "You are 01 Mobile, a friendly, capable chat assistant. This is a chat-only mobile app. "
    "You cannot control computers, open apps, click, type, run commands, access files, or claim that you did."
)


class Message(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    messages: list[Message] = Field(min_length=1, max_length=20)
    client: str = Field(pattern="^01-mobile$")
    provider: str = Field(pattern="^ollama_cloud$")


app = FastAPI(title="01 Mobile Cloud", docs_url=None, redoc_url=None)
allowed_origins = [value.strip() for value in os.getenv("CORS_ORIGINS", "").split(",") if value.strip()]
if allowed_origins:
    app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_methods=["POST"], allow_headers=["Content-Type", "X-01-Access-Key"])

requests_by_ip: dict[str, deque[float]] = defaultdict(deque)


def require_config() -> tuple[str, str, str]:
    api_key = os.getenv("OLLAMA_API_KEY", "")
    access_key = os.getenv("MOBILE_ACCESS_KEY", "")
    model = os.getenv("MOBILE_OLLAMA_MODEL", "glm-5.1:cloud")
    if not api_key or not access_key:
        raise HTTPException(503, "01 Mobile is not configured yet.")
    return api_key, access_key, model


def rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    times = requests_by_ip[ip]
    while times and now - times[0] > WINDOW_SECONDS:
        times.popleft()
    if len(times) >= MAX_REQUESTS_PER_WINDOW:
        raise HTTPException(429, "Please wait a minute before sending more messages.")
    times.append(now)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/chat")
def chat(payload: ChatRequest, request: Request, x_01_access_key: str = Header(default="")) -> dict[str, str]:
    api_key, access_key, model = require_config()
    if not x_01_access_key or x_01_access_key != access_key:
        raise HTTPException(401, "01 Mobile access key is required.")
    rate_limit(request)
    messages = [{"role": "system", "content": SYSTEM_MESSAGE}]
    messages.extend(message.model_dump() for message in payload.messages)
    try:
        response = requests.post(
            OLLAMA_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "messages": messages, "stream": False},
            timeout=90,
        )
        response.raise_for_status()
        content = response.json().get("message", {}).get("content", "").strip()
    except requests.RequestException:
        raise HTTPException(503, "Ollama Cloud is unavailable right now.") from None
    if not content:
        raise HTTPException(502, "Ollama Cloud returned an empty response.")
    return {"message": content}
