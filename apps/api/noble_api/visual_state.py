"""Durable visual scene journal, immutable art gallery and character visual bible.

No automatic diffusion. Transitions are conservative high-confidence text cues
from *completed* narrator turns only. All images are stored as immutable
content-addressed WebP versions, with a separately selectable active asset.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import shutil
import sqlite3
import time
import uuid
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field, ConfigDict

from .store import Store

MAX_BYTES = 12 * 1024 * 1024
MAX_PIXELS = 20_000_000

# Intentionally conservative: movement must be explicit and the destination
# must have a known place-noun. It is a useful hint, not a semantic classifier.
PLACE = (r"bosque|castillo|taberna|ciudad|templo|torre|playa|puerto|cueva|"
         r"calle|escuela|biblioteca|mercado|habitaci[oó]n|mazmorra|plaza|"
         r"estaci[oó]n|palacio|casa|jard[ií]n|santuario|posada|monta[nñ]a|"
         r"campamento|fortaleza|aldea|laboratorio|hospital|arena|"
         r"forest|castle|tavern|city|temple|tower|beach|harbor|cave|"
         r"library|market|room|dungeon|station|palace|house|garden")
TRANSITION = re.compile(
    r"\b(?:lleg(?:ó|aron|amos|aste|asteis)|entr(?:ó|aron|amos|aste)|"
    r"viaj(?:ó|aron|amos)|camin(?:ó|aron|amos)|cruz(?:ó|aron|amos)|"
    r"regres(?:ó|aron|amos)|se dirig(?:ió|ieron)|"
    r"arrived|entered|traveled|travelled|returned|reached)\s+"
    r"(?:a|al|a la|en|hacia|hasta|to|into|at|the|una?|un|el|la|los|las|"
    r"nuevo|nueva|antiguo|antigua|oscuro|oscura|misterioso|misteriosa|\s)*"
    r"(?P<place>(?:(?:[a-záéíóúüñ]+\s+){0,3})?(?:" + PLACE +
    r")(?:\s+(?:de|del|of|en)\s+[a-záéíóúüñ]+){0,3})",
    re.IGNORECASE,
)


def infer_location(text: str) -> str | None:
    """Hint only; do not mistake dialogue or intentions for observed travel."""
    if not text or len(text) > 60000:
        return None
    for line in re.split(r"[\n.!?]+", text):
        # Narrator text may contain quoted speech; a spoken destination is not
        # proof the player actually arrived there.
        line = re.sub(r'[«“"][^»”"]*[»”"]', '', line).strip()
        if not line or line[0] in {"«", '"', "“", "-", "—"}:
            continue
        match = TRANSITION.search(line)
        if match:
            prefix = line[:match.start()].lower()
            if re.search(r"\b(?:no|nunca|jamás|never|not)\s*$", prefix):
                continue
            location = " ".join(match.group("place").lower().split())
            return location[:120]
    return None


def image_bytes_to_webp(raw: bytes) -> bytes:
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError("Ilustración vacía o superior al límite de 12 MB")
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in {"PNG", "JPEG", "WEBP"}:
                raise ValueError("Formato no admitido")
            if source.width * source.height > MAX_PIXELS:
                raise ValueError("Demasiados píxeles")
            source.load()
            target = ImageOps.exif_transpose(source).convert("RGB")
            target.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            target.save(output, "WEBP", quality=88, method=5)
            return output.getvalue()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise ValueError("No se pudo decodificar la imagen") from exc


class SceneChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    location: str = Field(min_length=2, max_length=120)


class CharacterVisual(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    appearance: str = Field(min_length=12, max_length=1500)
    outfit: str = Field(default="", max_length=650)
    distinguishing_features: str = Field(default="", max_length=650)


class CharacterReference(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_id: uuid.UUID | None = None


class VisualState:
    def __init__(self, store: Store):
        self.store = store
        self.planner = None
        with self.store._conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS visual_scenes(
                    id TEXT PRIMARY KEY, story_id TEXT NOT NULL,
                    location TEXT NOT NULL, source_turn_id TEXT,
                    detection TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_visual_scenes_story
                    ON visual_scenes(story_id, created_at, id);
                CREATE TABLE IF NOT EXISTS visual_assets(
                    id TEXT PRIMARY KEY, story_id TEXT NOT NULL, scene_id TEXT NOT NULL,
                    file_name TEXT NOT NULL, content_sha256 TEXT NOT NULL,
                    origin TEXT NOT NULL, prompt TEXT NOT NULL,
                    checkpoint TEXT, seed INTEGER, created_at REAL NOT NULL,
                    render_signature TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_visual_assets_story
                    ON visual_assets(story_id, created_at, id);
                CREATE TABLE IF NOT EXISTS visual_current(
                    story_id TEXT PRIMARY KEY, asset_id TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS visual_characters(
                    id TEXT PRIMARY KEY, story_id TEXT NOT NULL,
                    name TEXT NOT NULL, appearance TEXT NOT NULL,
                    outfit TEXT NOT NULL, distinguishing_features TEXT NOT NULL,
                    revision INTEGER NOT NULL, updated_at REAL NOT NULL,
                    UNIQUE(story_id, name)
                );
            """)
            character_columns = [row[1] for row in conn.execute(
                "PRAGMA table_info(visual_characters)")]
            if "reference_asset_id" not in character_columns:
                conn.execute("ALTER TABLE visual_characters ADD COLUMN reference_asset_id TEXT")
            columns = [row[1] for row in conn.execute("PRAGMA table_info(visual_assets)")]
            if "render_signature" not in columns:
                conn.execute("ALTER TABLE visual_assets ADD COLUMN render_signature TEXT")
            conn.execute("""CREATE INDEX IF NOT EXISTS idx_visual_assets_signature
                ON visual_assets(story_id, render_signature)""")

    def _exists(self, story_id: str) -> bool:
        with self.store._conn() as conn:
            return conn.execute("SELECT 1 FROM stories WHERE id=?", (story_id,)).fetchone() is not None

    def scene(self, story_id: str) -> dict:
        if not self._exists(story_id):
            raise ValueError("Historia inexistente")
        with self.store._conn() as conn:
            last = conn.execute(
                "SELECT * FROM visual_scenes WHERE story_id=? ORDER BY created_at DESC,id DESC LIMIT 1",
                (story_id,)).fetchone()
            if last:
                return dict(last)
            ident, now = str(uuid.uuid4()), time.time()
            conn.execute("INSERT INTO visual_scenes VALUES(?,?,?,?,?,?)",
                         (ident, story_id, "Escena inicial", None, "initial", now))
            return dict(conn.execute("SELECT * FROM visual_scenes WHERE id=?", (ident,)).fetchone())

    def set_scene(self, story_id: str, location: str, source_turn_id: str | None = None,
                  detection: str = "confirmed") -> dict:
        location = " ".join(location.split())[:120]
        if len(location) < 2:
            raise ValueError("Escenario vacío")
        prior = self.scene(story_id)
        if prior["location"].casefold() == location.casefold():
            return prior
        ident, now = str(uuid.uuid4()), time.time()
        with self.store._conn() as conn:
            conn.execute("INSERT INTO visual_scenes VALUES(?,?,?,?,?,?)",
                         (ident, story_id, location, source_turn_id, detection, now))
        return self.scene(story_id)

    def observe_turn(self, story_id: str, turn: dict) -> dict | None:
        location = infer_location(turn["assistant_text"])
        if not location:
            return None
        prior = self.scene(story_id)
        if prior["location"].casefold() == location.casefold():
            return None
        return self.set_scene(story_id, location, turn["id"], detection="heuristic")

    def characters(self, story_id: str) -> list[dict]:
        self.scene(story_id)
        with self.store._conn() as conn:
            return [dict(r) for r in conn.execute(
                "SELECT * FROM visual_characters WHERE story_id=? ORDER BY name COLLATE NOCASE,id",
                (story_id,))]

    def put_character(self, story_id: str, item: CharacterVisual,
                      character_id: str | None = None) -> dict:
        self.scene(story_id)
        now = time.time()
        try:
            with self.store._conn() as conn:
                if character_id:
                    found = conn.execute(
                        "SELECT * FROM visual_characters WHERE story_id=? AND id=?",
                        (story_id, character_id)).fetchone()
                    if not found:
                        raise ValueError("Personaje inexistente")
                    conn.execute("""UPDATE visual_characters SET
                        name=?,appearance=?,outfit=?,distinguishing_features=?,
                        revision=revision+1,updated_at=?
                        WHERE story_id=? AND id=?""",
                        (item.name.strip(), item.appearance.strip(), item.outfit.strip(),
                         item.distinguishing_features.strip(), now, story_id, character_id))
                    ident = character_id
                else:
                    ident = str(uuid.uuid4())
                    conn.execute("""INSERT INTO visual_characters
                        (id,story_id,name,appearance,outfit,distinguishing_features,
                         revision,updated_at,reference_asset_id)
                        VALUES(?,?,?,?,?,?,?,?,?)""",
                        (ident, story_id, item.name.strip(), item.appearance.strip(),
                         item.outfit.strip(), item.distinguishing_features.strip(), 1, now, None))
                return dict(conn.execute(
                    "SELECT * FROM visual_characters WHERE id=?", (ident,)).fetchone())
        except sqlite3.IntegrityError as exc:
            raise ValueError("Ya existe un personaje visual con ese nombre") from exc

    def set_character_reference(self, story_id: str,
                                character_id: str, asset_id: str | None) -> dict:
        self.scene(story_id)
        with self.store._conn() as db:
            character = db.execute("""SELECT * FROM visual_characters
                WHERE story_id=? AND id=?""", (story_id, character_id)).fetchone()
            if character is None:
                raise ValueError("El personaje visual no existe en esta historia")
            if asset_id:
                asset = db.execute("""SELECT 1 FROM visual_assets
                    WHERE story_id=? AND id=?""", (story_id, asset_id)).fetchone()
                if asset is None:
                    raise ValueError("La imagen de referencia no pertenece a esta historia")
                # Check on-disk integrity before accepting a canonical reference.
                self.reference_bytes(story_id, asset_id)
            db.execute("""UPDATE visual_characters
                SET reference_asset_id=?,revision=revision+1,updated_at=?
                WHERE story_id=? AND id=?""",
                (asset_id, time.time(), story_id, character_id))
            return dict(db.execute("""SELECT * FROM visual_characters
                WHERE story_id=? AND id=?""", (story_id, character_id)).fetchone())

    def enriched_prompt(self, story_id: str, prompt: str) -> str:
        scene = self.scene(story_id)
        characters = self.characters(story_id)
        appearance = []
        for row in characters:
            # Do not inject absent people into the image prompt; they often
            # appear in the output even if the scene requested an empty room.
            if not re.search(r"(?<!\w)" + re.escape(row["name"]) + r"(?!\w)",
                             prompt, flags=re.IGNORECASE):
                continue
            appearance.append(
                f"{row['name']}: {row['appearance']}; ropa: {row['outfit']}; "
                f"rasgos: {row['distinguishing_features']}")
        # No vision claim: this is text guidance, not IPAdapter or an identity lock.
        return ("Escenario actual: " + scene["location"] + ".\n" +
                ("Fichas visuales canónicas (mantener rasgos, no intercambiarlos):\n" +
                 "\n".join(appearance) + "\n" if appearance else "") +
                "Solicitud visual: " + prompt).strip()

    def all(self, story_id: str) -> dict:
        active_scene = self.scene(story_id)
        # Older Noble AI installations kept only scene.webp. Import that
        # image as the first immutable version when the gallery is first read.
        legacy = self.store.root / "story-assets" / story_id / "scene.webp"
        with self.store._conn() as conn:
            has_art = conn.execute(
                "SELECT 1 FROM visual_assets WHERE story_id=? LIMIT 1",
                (story_id,)).fetchone()
        if has_art is None and legacy.is_file() and not legacy.is_symlink():
            try:
                self.publish(story_id, legacy.read_bytes(), origin="manual")
            except (ValueError, OSError):
                # Broken older artwork must not hide the story or its scene log.
                pass
        with self.store._conn() as conn:
            scenes = [dict(row) for row in conn.execute(
                "SELECT * FROM visual_scenes WHERE story_id=? ORDER BY created_at,id",
                (story_id,))]
            rows = [dict(row) for row in conn.execute(
                "SELECT * FROM visual_assets WHERE story_id=? ORDER BY created_at DESC,id DESC",
                (story_id,))]
            selected = conn.execute("SELECT asset_id FROM visual_current WHERE story_id=?",
                                    (story_id,)).fetchone()
        current = selected["asset_id"] if selected else None
        for item in rows:
            item["url"] = f"/api/v1/stories/{story_id}/gallery/{item['id']}"
            item["selected"] = item["id"] == current
        return {"current_scene": active_scene, "scenes": scenes,
                "assets": rows, "characters": self.characters(story_id),
                "selected_asset_id": current}

    def clone_branch(self, source_id: str, branch_id: str,
                     turn_ids: dict[str, str], partial: bool = False,
                     cutoff_created_at: float | None = None) -> None:
        """Fork visual history with independent scene/character/art identifiers.

        A partial fork only receives scenes that existed at its selected turn.
        A gallery from a later scene is not exposed on an earlier branch.
        """
        self.all(source_id)  # migrate any pre-gallery scene.webp before copying
        self.scene(branch_id)  # ensures a scene even for older histories
        with self.store._conn() as conn:
            scenes = [dict(row) for row in conn.execute(
                "SELECT * FROM visual_scenes WHERE story_id=? ORDER BY created_at,id",
                (source_id,))]
            gallery = [dict(row) for row in conn.execute(
                "SELECT * FROM visual_assets WHERE story_id=? ORDER BY created_at,id",
                (source_id,))]
            chars = [dict(row) for row in conn.execute(
                "SELECT * FROM visual_characters WHERE story_id=?", (source_id,))]
            selected = conn.execute(
                "SELECT asset_id FROM visual_current WHERE story_id=?", (source_id,)).fetchone()
        selected_id = selected["asset_id"] if selected else None
        allowed = []
        for scene in scenes:
            if not partial or (scene["source_turn_id"] in turn_ids or
                    (scene["source_turn_id"] is None and
                     (scene["detection"] == "initial" or
                      (cutoff_created_at is not None and scene["created_at"] <= cutoff_created_at)))):
                allowed.append(scene)
        if not allowed:
            allowed = scenes[:1]
        scene_map = {scene["id"]: str(uuid.uuid4()) for scene in allowed}
        now = time.time()
        copied_paths = []
        asset_map: dict[str, str] = {}
        try:
            with self.store._conn() as conn:
                # Discard initial branch scene; replace with cloned history.
                conn.execute("DELETE FROM visual_scenes WHERE story_id=?", (branch_id,))
                for index, item in enumerate(allowed):
                    conn.execute("INSERT INTO visual_scenes VALUES(?,?,?,?,?,?)", (
                        scene_map[item["id"]], branch_id, item["location"],
                        turn_ids.get(item["source_turn_id"]) if item["source_turn_id"] else None,
                        item["detection"], now + index * 0.00001))
                character_map: dict[str, str] = {}
                for index, art in enumerate(gallery):
                    if art["scene_id"] not in scene_map:
                        continue
                    old_file = self._asset_path(source_id, art["id"])
                    if not old_file.is_file():
                        continue
                    new_asset = str(uuid.uuid4())
                    new_file = self._asset_path(branch_id, new_asset)
                    new_file.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(old_file, new_file)
                    copied_paths.append(new_file)
                    asset_map[art["id"]] = new_asset
                    conn.execute("""INSERT INTO visual_assets
                        (id,story_id,scene_id,file_name,content_sha256,origin,prompt,
                         checkpoint,seed,created_at,render_signature)
                        VALUES(?,?,?,?,?,?,?,?,?,?,?)""", (
                        new_asset, branch_id, scene_map[art["scene_id"]],
                        new_file.name, art["content_sha256"], art["origin"],
                        art["prompt"], art["checkpoint"], art["seed"],
                        now + index * 0.00001, art.get("render_signature")))
                for index, person in enumerate(chars):
                    copied_id = str(uuid.uuid4())
                    character_map[person["id"]] = copied_id
                    conn.execute("""INSERT INTO visual_characters
                        (id,story_id,name,appearance,outfit,distinguishing_features,
                         revision,updated_at,reference_asset_id)
                        VALUES(?,?,?,?,?,?,?,?,?)""", (
                        copied_id, branch_id, person["name"], person["appearance"],
                        person["outfit"], person["distinguishing_features"],
                        person["revision"], now + index * 0.00001,
                        asset_map.get(person.get("reference_asset_id"))))
                if selected_id in asset_map:
                    new_selected = asset_map[selected_id]
                else:
                    new_selected = next(reversed(asset_map.values()), None)
                if new_selected:
                    conn.execute("INSERT INTO visual_current VALUES (?,?)",
                                 (branch_id, new_selected))
            if new_selected:
                self.legacy_copy(branch_id, self._asset_path(branch_id, new_selected))
            if self.planner is not None:
                self.planner.clone(source_id, branch_id, scene_map, character_map)
        except Exception:
            for copied in copied_paths:
                copied.unlink(missing_ok=True)
            raise

    def _asset_path(self, story_id: str, asset_id: str) -> Path:
        return self.store.root / "story-assets" / story_id / "images" / (asset_id + ".webp")

    def legacy_copy(self, story_id: str, source: Path) -> None:
        legacy = self.store.root / "story-assets" / story_id / "scene.webp"
        legacy.parent.mkdir(parents=True, exist_ok=True)
        temp = legacy.with_suffix(".webp.part")
        try:
            shutil.copyfile(source, temp)
            os.replace(temp, legacy)
        finally:
            temp.unlink(missing_ok=True)

    def cached(self, story_id: str, signature: str) -> dict | None:
        with self.store._conn() as conn:
            hit = conn.execute("""SELECT * FROM visual_assets WHERE
                story_id=? AND render_signature=? ORDER BY created_at DESC LIMIT 1""",
                (story_id, signature)).fetchone()
        if hit and self._asset_path(story_id, hit["id"]).is_file():
            return dict(hit)
        return None

    def publish(self, story_id: str, raw: bytes, origin: str,
                prompt: str = "", checkpoint: str | None = None,
                seed: int | None = None, render_signature: str | None = None) -> dict:
        if origin not in {"manual", "comfyui"}:
            raise ValueError("Origen de imagen no admitido")
        scene = self.scene(story_id)
        transformed = image_bytes_to_webp(raw)
        digest = hashlib.sha256(transformed).hexdigest()
        ident, now = str(uuid.uuid4()), time.time()
        asset = self._asset_path(story_id, ident)
        asset.parent.mkdir(parents=True, exist_ok=True)
        # Version file first, then SQLite commit. No old artwork is deleted.
        tmp = asset.with_suffix(".webp.part")
        try:
            tmp.write_bytes(transformed)
            os.replace(tmp, asset)
            with self.store._conn() as conn:
                conn.execute("""INSERT INTO visual_assets
                    (id,story_id,scene_id,file_name,content_sha256,origin,prompt,
                     checkpoint,seed,created_at,render_signature)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                    (ident, story_id, scene["id"], asset.name, digest, origin,
                     prompt, checkpoint, seed, now, render_signature))
                conn.execute("""INSERT INTO visual_current(story_id,asset_id)
                    VALUES (?,?) ON CONFLICT(story_id)
                    DO UPDATE SET asset_id=excluded.asset_id""", (story_id, ident))
            self.legacy_copy(story_id, asset)
        except Exception:
            # An inconsistent gallery must not leak partial files.
            with self.store._conn() as conn:
                inserted = conn.execute(
                    "SELECT 1 FROM visual_assets WHERE id=?", (ident,)).fetchone()
            if not inserted:
                asset.unlink(missing_ok=True)
            raise
        finally:
            tmp.unlink(missing_ok=True)
        return self.all(story_id)

    def choose(self, story_id: str, asset_id: str) -> dict:
        self.scene(story_id)
        with self.store._conn() as conn:
            row = conn.execute(
                "SELECT * FROM visual_assets WHERE story_id=? AND id=?",
                (story_id, asset_id)).fetchone()
        if not row:
            raise ValueError("Ilustración inexistente en esta historia")
        path = self._asset_path(story_id, asset_id)
        if not path.is_file():
            raise ValueError("El archivo de ilustración ya no está disponible")
        self.legacy_copy(story_id, path)
        with self.store._conn() as conn:
            conn.execute("""INSERT INTO visual_current(story_id,asset_id)
                VALUES (?,?) ON CONFLICT(story_id)
                DO UPDATE SET asset_id=excluded.asset_id""", (story_id, asset_id))
        return self.all(story_id)

    def reference_bytes(self, story_id: str, asset_id: str) -> tuple[bytes, str]:
        """Only the owning story may use this asset as a ComfyUI reference."""
        with self.store._conn() as conn:
            record = conn.execute(
                "SELECT content_sha256 FROM visual_assets WHERE id=? AND story_id=?",
                (asset_id, story_id)).fetchone()
        if record is None:
            raise ValueError("La ilustración de referencia no pertenece a esta historia")
        path = self._asset_path(story_id, asset_id)
        if not path.is_file() or path.is_symlink():
            raise ValueError("La ilustración de referencia ya no está disponible")
        data = path.read_bytes()
        if not data or len(data) > MAX_BYTES:
            raise ValueError("Referencia vacía o demasiado grande")
        if hashlib.sha256(data).hexdigest() != record["content_sha256"]:
            raise ValueError("La ilustración de referencia no pasó su verificación SHA256")
        return data, record["content_sha256"]

    def asset_response(self, story_id: str, asset_id: str) -> FileResponse:
        with self.store._conn() as conn:
            row = conn.execute("SELECT id FROM visual_assets WHERE story_id=? AND id=?",
                               (story_id, asset_id)).fetchone()
        if not row:
            raise HTTPException(404, "Ilustración inexistente")
        target = self._asset_path(story_id, asset_id)
        if not target.is_file():
            raise HTTPException(404, "Archivo de imagen ausente")
        return FileResponse(target, media_type="image/webp",
            headers={"Cache-Control": "private, no-store",
                     "X-Content-Type-Options": "nosniff"})


def mount_visual_routes(app, visual: VisualState):
    @app.get("/api/v1/stories/{story_id}/visual-state")
    def view(story_id: uuid.UUID):
        try:
            return visual.all(str(story_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.put("/api/v1/stories/{story_id}/scene")
    def confirm_scene(story_id: uuid.UUID, body: SceneChange):
        try:
            visual.set_scene(str(story_id), body.location)
            return visual.all(str(story_id))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/visual-characters", status_code=201)
    def add_character(story_id: uuid.UUID, body: CharacterVisual):
        try:
            return visual.put_character(str(story_id), body)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.put("/api/v1/stories/{story_id}/visual-characters/{character_id}")
    def edit_character(story_id: uuid.UUID, character_id: uuid.UUID, body: CharacterVisual):
        try:
            return visual.put_character(str(story_id), body, str(character_id))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.put("/api/v1/stories/{story_id}/visual-characters/{character_id}/reference")
    def assign_reference(story_id: uuid.UUID, character_id: uuid.UUID,
                         body: CharacterReference):
        try:
            return visual.set_character_reference(str(story_id), str(character_id),
                str(body.asset_id) if body.asset_id else None)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/api/v1/stories/{story_id}/gallery/{asset_id}")
    def image(story_id: uuid.UUID, asset_id: uuid.UUID):
        return visual.asset_response(str(story_id), str(asset_id))

    @app.post("/api/v1/stories/{story_id}/gallery/{asset_id}/select")
    def select(story_id: uuid.UUID, asset_id: uuid.UUID):
        try:
            return visual.choose(str(story_id), str(asset_id))
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.post("/api/v1/stories/{story_id}/illustration-prompt")
    def prompt_preview(story_id: uuid.UUID, body: dict):
        prompt = body.get("prompt")
        if not isinstance(prompt, str) or not 8 <= len(prompt) <= 2400:
            raise HTTPException(422, "El prompt debe tener entre 8 y 2400 caracteres")
        try:
            return {"prompt": visual.enriched_prompt(str(story_id), prompt),
                    "inference_used": False}
        except ValueError as exc:
            raise HTTPException(404, str(exc)) from exc
