"""Provider secrets stay out of SQLite and web responses.

OpenRouter keys live in OS keyring (when available) or an environment variable.
No plaintext fallback to files or DB.
"""
from __future__ import annotations

import os

SERVICE = "noble-ai"
NAME = "openrouter-api-key"


class Secrets:
    def read(self) -> str:
        value = os.getenv("NOBLE_OPENROUTER_API_KEY", "").strip()
        if value:
            return value
        try:
            import keyring
            return (keyring.get_password(SERVICE, NAME) or "").strip()
        except Exception:
            return ""

    def status(self) -> dict:
        return {"provider": "openrouter", "configured": bool(self.read()),
                "storage": "environment" if os.getenv("NOBLE_OPENROUTER_API_KEY") else "os_keyring"}

    def set(self, value: str) -> dict:
        if os.getenv("NOBLE_OPENROUTER_API_KEY"):
            raise ValueError("Credential is managed by NOBLE_OPENROUTER_API_KEY")
        value = value.strip()
        if len(value) < 12 or len(value) > 4096:
            raise ValueError("Key must contain 12–4,096 characters")
        try:
            import keyring
            keyring.set_password(SERVICE, NAME, value)
        except Exception as exc:
            raise ValueError("No system credential store is available; configure NOBLE_OPENROUTER_API_KEY") from exc
        return self.status()

    def delete(self) -> dict:
        if os.getenv("NOBLE_OPENROUTER_API_KEY"):
            raise ValueError("Credential is managed by an environment variable")
        try:
            import keyring
            keyring.delete_password(SERVICE, NAME)
        except Exception:
            pass
        return self.status()
