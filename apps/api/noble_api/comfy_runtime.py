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


async def render(client: httpx.AsyncClient, base_url: str, nodes: dict) -> bytes:
    response = await client.post(base_url + "/prompt", json={
        "prompt": nodes, "client_id": str(uuid.uuid4())}, follow_redirects=False)
    response.raise_for_status()
    result = response.json()
    ident = result.get("prompt_id") if isinstance(result, dict) else None
    if not isinstance(ident, str) or not re.fullmatch(
            r"[A-Za-z0-9_-]{1,100}", ident):
        raise HTTPException(502, "ComfyUI no devolvió el ID de generación")
    image_ref = None
    for _ in range(180):
        history = await client.get(base_url + "/history/" + ident,
                                   follow_redirects=False)
        history.raise_for_status()
        data = history.json()
        record = data.get(ident) if isinstance(data, dict) else None
        if isinstance(record, dict):
            if (record.get("status") or {}).get("status_str") == "error":
                raise HTTPException(502, "ComfyUI falló al ejecutar el workflow")
            outputs = record.get("outputs") or {}
            slot = outputs.get("7") if isinstance(outputs, dict) else None
            images = slot.get("images", []) if isinstance(slot, dict) else []
            if images:
                image_ref = images[0]
                break
        await asyncio.sleep(1)
    if image_ref is None:
        raise HTTPException(504, "ComfyUI no terminó antes del límite de 180 segundos")
    if not isinstance(image_ref, dict):
        raise HTTPException(502, "Salida ComfyUI inválida")
    name, subfolder, kind = (
        image_ref.get("filename"), image_ref.get("subfolder", ""),
        image_ref.get("type", "output"))
    if not isinstance(name, str) or not re.fullmatch(
            r"[A-Za-z0-9_][A-Za-z0-9_. -]{0,254}", name) or ".." in name:
        raise HTTPException(502, "ComfyUI no devolvió un archivo válido")
    # Noble's fixed SaveImage filename_prefix creates no nested subfolders.
    # Do not follow arbitrary provider-supplied paths when requesting /view.
    if subfolder != "":
        raise HTTPException(502, "Subcarpeta ComfyUI no autorizada")
    if kind != "output":
        raise HTTPException(502, "ComfyUI devolvió una imagen fuera de salida")
    # /view is a provider endpoint, never a local file read.
    view = await client.get(base_url + "/view", params={
        "filename": name, "subfolder": subfolder, "type": kind,
    }, follow_redirects=False)
    view.raise_for_status()
    return view.content
