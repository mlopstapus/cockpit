"""WebSocket connection manager for streaming Claude output."""
import asyncio
import logging
from datetime import datetime
from fastapi import WebSocket
from models import WSMessage, WSMessageType

logger = logging.getLogger(__name__)


class WebSocketHub:
    """Manages WebSocket connections and broadcasts session output."""

    def __init__(self):
        # session_id -> list of connected websockets
        self.connections: dict[str, list[WebSocket]] = {}
        # Track active streaming tasks
        self._stream_tasks: dict[str, asyncio.Task] = {}

    async def connect(self, session_id: str, websocket: WebSocket) -> None:
        """Accept a new WebSocket connection for a session."""
        await websocket.accept()
        self.connections.setdefault(session_id, []).append(websocket)
        logger.info(
            f"WebSocket connected for session {session_id} "
            f"(total: {len(self.connections[session_id])})"
        )

    def disconnect(self, session_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        if session_id in self.connections:
            self.connections[session_id] = [
                ws for ws in self.connections[session_id] if ws != websocket
            ]
            if not self.connections[session_id]:
                del self.connections[session_id]

    async def broadcast(self, session_id: str, message: WSMessage) -> None:
        """Send a message to all connected clients for a session."""
        if session_id not in self.connections:
            return

        dead_connections = []
        for ws in self.connections[session_id]:
            try:
                await ws.send_json(message.model_dump(mode="json"))
            except Exception:
                dead_connections.append(ws)

        # Clean up dead connections
        for ws in dead_connections:
            self.disconnect(session_id, ws)

    async def stream_output(self, session_id: str, output_queue: asyncio.Queue) -> None:
        """Stream output from a Claude process queue to all connected WebSockets."""
        try:
            while True:
                chunk = await output_queue.get()

                if chunk is None:
                    # Process ended
                    await self.broadcast(
                        session_id,
                        WSMessage(
                            type=WSMessageType.STATUS,
                            session_id=session_id,
                            data={"status": "stopped"},
                        ),
                    )
                    break

                await self.broadcast(
                    session_id,
                    WSMessage(
                        type=WSMessageType.OUTPUT,
                        session_id=session_id,
                        data={"content": chunk},
                    ),
                )
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Stream error for session {session_id}: {e}")

    def start_streaming(self, session_id: str, output_queue: asyncio.Queue) -> None:
        """Start a background task to stream output for a session."""
        # Cancel existing stream task if any
        if session_id in self._stream_tasks:
            self._stream_tasks[session_id].cancel()

        task = asyncio.create_task(self.stream_output(session_id, output_queue))
        self._stream_tasks[session_id] = task

    def stop_streaming(self, session_id: str) -> None:
        """Stop streaming for a session."""
        if session_id in self._stream_tasks:
            self._stream_tasks[session_id].cancel()
            del self._stream_tasks[session_id]

    async def notify_account_switch(
        self, session_id: str, old_account: str, new_account: str
    ) -> None:
        """Notify clients of an account switch."""
        await self.broadcast(
            session_id,
            WSMessage(
                type=WSMessageType.ACCOUNT_SWITCH,
                session_id=session_id,
                data={
                    "old_account": old_account,
                    "new_account": new_account,
                    "reason": "rate_limit",
                },
            ),
        )

    async def notify_task_complete(self, session_id: str, summary: str) -> None:
        """Notify clients that a Claude task completed."""
        await self.broadcast(
            session_id,
            WSMessage(
                type=WSMessageType.TASK_COMPLETE,
                session_id=session_id,
                data={"summary": summary},
            ),
        )
