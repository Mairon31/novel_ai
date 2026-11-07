"""Opt-in character LoRA selection and validation for local ComfyUI.

The model is never fetched or executed by this module. Only ComfyUI's own
installed model names may enter a workflow. A scene plan's visual UUIDs are
authoritative; free prompts use exact case-insensitive character names.
"""
from __future__ import annotations

import json
import re

MAX_SCENE_LORAS = 3
LORA_FILENAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,146}\.safetensors")


def validate_lora_inventory(payload: object) -> list[str]:
    if not isinstance(payload, list) or len(payload) > 20000:
        raise ValueError("Invalid LoRA inventory")
    if not all(isinstance(value, str) and 1 <= len(value) <= 240
               for value in payload):
        raise ValueError("ComfyUI returned an invalid LoRA inventory")
    return payload


def selected_character_loras(visual, story_id: str, prompt: str) -> list[dict]:
    """Resolve the saved character identity before contacting ComfyUI.

    Reject duplicate LoRAs and ambiguous identities rather than applying
    different weights to the same model or mixing unknown character identities.
    The node chain applies globally, not spatially to an individual character.
    """
    planner = getattr(visual, "planner", None)
    plan = planner.read(story_id) if planner is not None else None
    selected = set(plan["visible_character_ids"]) if plan and plan["revision"] else None
    with visual.store._conn() as conn:
        rows = [json.loads(row["config_json"]) for row in conn.execute(
            "SELECT config_json FROM creator_characters WHERE story_id=? "
            "ORDER BY created_at,id", (story_id,))]
    selected_names = [
        item.get("name", "").casefold() for item in rows
        if isinstance(item.get("name"), str)
    ]
    ambiguous = {name for name in selected_names if selected_names.count(name) > 1}
    stack, used = [], set()
    for row in rows:
        name = row.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        if selected is None:
            active = bool(re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)",
                                    prompt, re.IGNORECASE))
        else:
            active = row.get("visual_character_id") in selected
        if not active:
            continue
        if name.casefold() in ambiguous:
            raise ValueError("Nombre de NPC ambiguo: " + name)
        dna = row.get("visual_dna") or {}
        if not isinstance(dna, dict):
            continue
        filename = dna.get("lora_name")
        if not filename:
            continue
        if not isinstance(filename, str) or not LORA_FILENAME.fullmatch(filename):
            raise ValueError("Invalid visual LoRA name")
        weight = dna.get("lora_strength", 0.8)
        if (not isinstance(weight, (int, float)) or isinstance(weight, bool)
                or not 0 < weight <= 2):
            raise ValueError("LoRA weight must be greater than 0 and at most 2")
        if filename in used:
            raise ValueError("The same LoRA is assigned to multiple present NPCs")
        used.add(filename)
        stack.append({"character_name": name, "lora_name": filename,
                      "strength": float(weight)})
        if len(stack) > MAX_SCENE_LORAS:
            raise ValueError("At most three LoRAs are allowed per illustration")
    return stack
