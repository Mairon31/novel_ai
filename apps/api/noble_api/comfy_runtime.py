"""Shared ComfyUI /prompt -> /history -> /view contract for manual renders.

All URLs remain under Noble's validated loopback ComfyUI base. Returned output
filenames are never used as filesystem paths.
"""
from __future__ import annotations

import asyncio
import re
import uuid

import httpx
from fastapi import HTTPException


async def render_outputs(client: httpx.AsyncClient, base_url: str, nodes: dict,
                         slots: tuple[str, ...] = ("7",)) -> dict[str, bytes]:
    """Return validated SaveImage outputs from one and the same ComfyUI job.

    The multiple-output mode is used for the generated image and neural mask;
    never mix outputs from different prompt IDs or silently use an absent mask.
    """
    if not 1 <= len(slots) <= 3 or any(
            not re.fullmatch(r"[0-9]{1,3}", slot) for slot in slots
    ) or len(set(slots)) != len(slots):
        raise ValueError("Invalid ComfyUI node list")
    response = await client.post(base_url + "/prompt", json={
        "prompt": nodes, "client_id": str(uuid.uuid4())}, follow_redirects=False)
    response.raise_for_status()
    result = response.json()
    ident = result.get("prompt_id") if isinstance(result, dict) else None
    if not isinstance(ident, str) or not re.fullmatch(
            r"[A-Za-z0-9_-]{1,100}", ident):
        raise HTTPException(502, "ComfyUI returned no generation ID")
    refs: dict[str, dict] = {}
    for _ in range(180):
        history = await client.get(base_url + "/history/" + ident,
                                   follow_redirects=False)
        history.raise_for_status()
        data = history.json()
        record = data.get(ident) if isinstance(data, dict) else None
        if isinstance(record, dict):
            if (record.get("status") or {}).get("status_str") == "error":
                raise HTTPException(502, "ComfyUI failed to execute the workflow")
            outputs = record.get("outputs")
            for slot_id in slots:
                node = outputs.get(slot_id) if isinstance(outputs, dict) else None
                images = node.get("images") if isinstance(node, dict) else None
                if isinstance(images, list) and images:
                    refs[slot_id] = images[0]
            if len(refs) == len(slots):
                break
            # A finished job that omitted the mask cannot recover by polling.
            if (record.get("status") or {}).get("status_str") == "success":
                raise HTTPException(
                    502, "ComfyUI finished without all image and mask outputs")
        await asyncio.sleep(1)
    if len(refs) != len(slots):
        raise HTTPException(504, "ComfyUI did not finish within the 180-second limit")
    downloaded = {}
    for slot_id, image_ref in refs.items():
        if not isinstance(image_ref, dict):
            raise HTTPException(502, "Invalid ComfyUI output")
        name, subfolder, kind = (
            image_ref.get("filename"), image_ref.get("subfolder", ""),
            image_ref.get("type", "output"))
        if not isinstance(name, str) or not re.fullmatch(
                r"[A-Za-z0-9_][A-Za-z0-9_. -]{0,254}", name) or ".." in name:
            raise HTTPException(502, "ComfyUI returned no valid file")
        if subfolder != "":
            raise HTTPException(502, "Unauthorized ComfyUI subfolder")
        if kind != "output":
            raise HTTPException(502, "ComfyUI returned an image outside the output directory")
        downloaded[slot_id] = (name, subfolder, kind)
    results = {}
    for slot_id, (name, subfolder, kind) in downloaded.items():
        # /view is a provider endpoint, never a local file read.
        view = await client.get(base_url + "/view", params={
            "filename": name, "subfolder": subfolder, "type": kind,
        }, follow_redirects=False)
        view.raise_for_status()
        results[slot_id] = view.content
    return results


async def render(client: httpx.AsyncClient, base_url: str, nodes: dict) -> bytes:
    return (await render_outputs(client, base_url, nodes))["7"]
