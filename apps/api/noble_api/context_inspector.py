"""Read-only inspector of the exact chat messages prepared for the narrator.

Token counts are explicitly heuristic: no model tokenizer or KV-cache metrics
are inferred. This route is author-facing, alongside Creator's private inputs.
"""
from __future__ import annotations

from math import ceil
import re
from typing import Literal
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field


class ContextPreviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    input_text: str = Field(default="", max_length=3000)
    mode: Literal["say", "do", "story", "continue"] = "do"


def _label_system(part: str, index: int) -> str:
    if index == 0:
        return "Instructions, premise, and canon"
    if part.startswith(("Private story context", "Narration guidelines",
                        "Narrator-controlled NPCs", "Persistent creator reminder")):
        return "Creator and characters"
    if part.startswith("Lorebook activated"):
        return "Lorebook"
    if part.startswith(("Confirmed structured state", "Location:", "Time:",
                        "Weather:", "Present characters:", "Confirmed inventory:",
                        "Confirmed flags:")):
        return "World state"
    return "System and context"


def _approx_tokens(text: str) -> int:
    return ceil(len(text) / 4)


def preview_context(narrative, story_id: str, text: str, mode: str) -> dict:
    story = narrative.get_story(story_id)
    if story is None:
        raise ValueError("Story not found")
    if mode not in {"say", "do", "story", "continue"}:
        raise ValueError("Invalid interaction mode")
    if mode != "continue" and not text.strip():
        raise ValueError("Enter a message to inspect the context")
    messages = narrative.messages(story, text.strip(), mode)
    config = narrative.config()
    sections: list[dict] = []

    def add(name: str, content: str) -> None:
        sections.append({"name": name, "characters": len(content),
                         "approx_tokens": _approx_tokens(content)})

    first = messages[0]["content"]
    for i, part in enumerate(first.split("\n\n")):
        prefix = "\n\n" if i else ""
        # Story freedom and agency policies can introduce further system
        # paragraphs before the premise. Find structural anchors in *each*
        # paragraph, not just the first. Preserve every byte and message.
        fragments = re.split(
            r"(?=\nPremise: |\nConfirmed persistent story canon: )", part)
        for index, fragment in enumerate(fragments):
            if not fragment:
                continue
            if fragment.startswith("\nPremise:"):
                name = "Premise and protagonist"
            elif fragment.startswith("\nConfirmed persistent story canon:"):
                name = "Fixed canon"
            elif part.startswith("Narrative agency and causal contract"):
                name = "Narrator agency and preferences"
            elif i == 0:
                name = "System and preferences"
            else:
                name = _label_system(part, i)
            add(name, prefix + fragment if index == 0 else fragment)
    for idx, message in enumerate(messages[1:], 1):
        content = message["content"]
        if idx == len(messages) - 1:
            name = "Current message"
        elif content.startswith("[Memory of a past player message"):
            name = "Retrieved episodes"
        else:
            name = "Recent history"
        add(name, content)

    # Add small message-boundary overhead, not a model-specific guarantee.
    prompt_estimate = sum(_approx_tokens(m["content"]) + 4 for m in messages)
    reserved = int(config["max_tokens"])
    window = int(config["num_ctx"])
    return {
        "story_id": story_id, "messages": messages,
        "sections": sections,
        "total_characters": sum(len(m["content"]) for m in messages),
        "estimated_prompt_tokens": prompt_estimate,
        "reserved_output_tokens": reserved, "context_window_tokens": window,
        "estimated_total_tokens": prompt_estimate + reserved,
        "estimated_overflow": prompt_estimate + reserved > window,
        "token_counts_exact": False,
        "token_estimate_method": "ceil(characters/4) + 4 per message; not a model tokenizer",
        "runtime_kv_cache_measured": False,
    }


def mount_context_inspector_routes(app, narrative) -> None:
    @app.post("/api/v1/stories/{story_id}/context/preview")
    def context_preview(story_id: uuid.UUID, body: ContextPreviewInput):
        try:
            return preview_context(narrative, str(story_id),
                                   body.input_text, body.mode)
        except ValueError as exc:
            status = 404 if "Story not found" in str(exc) else 422
            raise HTTPException(status, str(exc)) from exc
