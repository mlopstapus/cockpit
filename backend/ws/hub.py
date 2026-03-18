"""WebSocket connection hub — broadcasts job PTY output to connected clients."""
import asyncio
import logging
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketHub:
    """Fan-out broadcaster keyed by job_id."""

    def __init__(self):
        # job_id -> list[WebSocket]
        self.connections: dict[str, list[WebSocket]] = {}

    async def connect(self, job_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.setdefault(job_id, []).append(websocket)
        logger.info(
            f"WS connected for job {job_id} "
            f"(total: {len(self.connections[job_id])})"
        )

    def disconnect(self, job_id: str, websocket: WebSocket) -> None:
        if job_id in self.connections:
            self.connections[job_id] = [
                ws for ws in self.connections[job_id] if ws != websocket
            ]
            if not self.connections[job_id]:
                del self.connections[job_id]

    async def broadcast_raw(self, job_id: str, text: str) -> None:
        """Broadcast a raw text chunk to all clients for a job."""
        conns = self.connections.get(job_id)
        if not conns:
            return
        dead = []
        for ws in conns:
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(job_id, ws)

    async def broadcast_annotation(self, job_id: str, annotation: str) -> None:
        """Broadcast a prefixed annotation line (e.g. '[STAGE] plan')."""
        await self.broadcast_raw(job_id, annotation + "\n")

    def subscriber_count(self, job_id: str) -> int:
        return len(self.connections.get(job_id, []))
