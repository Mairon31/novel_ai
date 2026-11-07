"""P0 documentation/scaffold integrity checks; not provider or GPU validation."""
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
REQUIRED = [
    "README.md", "AGENTS.md", "docs/GDD_TECNICO.md",
    "docs/ARQUITECTURA.md", "docs/CONTRATOS_API.md",
    "docs/REPOSITORIOS_OPEN_SOURCE.md", "docs/PROGRESO.md",
    "docs/ROADMAP.md", "docs/IMAGENES.md", "docs/TTS.md",
    "docs/PERFILES_GPU.md", "docs/COLAB_A_LOCAL.md",
    "docs/QA_Y_ACEPTACION.md", "docs/SEGURIDAD_Y_LICENCIAS.md",
    "docs/ESTADO_Y_MEMORIA.md", "docs/adr/0001-stack-modular.md",
    "notebooks/noble_ai_colab_smoke.ipynb",
    "docs/MODEL_HUB.md", "docs/ONBOARDING_Y_UI.md",
    "docs/DESKTOP_Y_DESPLIEGUE.md", "docs/REFERENCIAS_URAKATSU_KOHARU.md",
    "docs/adr/0002-app-first-model-hub.md",
    "config/model_assignments.schema.json", "config/model_assignments.example.json",
    "config/gpu_profiles.json", "config/model_manifest.example.json",
]

class DocumentationStructureTests(unittest.TestCase):
    def test_required_files_exist_and_not_empty(self):
        for path in REQUIRED:
            with self.subTest(path=path):
                file_path = ROOT / path
                self.assertTrue(file_path.is_file(), path)
                self.assertGreater(file_path.stat().st_size, 40, path)

    def test_profiles_json_and_unverified_status(self):
        profiles = json.loads((ROOT / "config/gpu_profiles.json").read_text(encoding="utf-8"))
        for key in ("minimum_12gb", "recommended_16gb", "colab_probe"):
            self.assertIn(key, profiles["profiles"])
            self.assertFalse(profiles["profiles"][key]["verified"], key)

    def test_manifest_no_fabricated_hashes(self):
        manifest = json.loads((ROOT / "config/model_manifest.example.json").read_text(encoding="utf-8"))
        self.assertTrue(all(not model["verified"] for model in manifest["models"]))
        self.assertTrue(all(model["sha256"] is None for model in manifest["models"]))

    def test_colab_notebook_schema(self):
        notebook = json.loads((ROOT / "notebooks/noble_ai_colab_smoke.ipynb").read_text(encoding="utf-8"))
        self.assertEqual(notebook["nbformat"], 4)
        self.assertTrue(any(c["cell_type"] == "code" for c in notebook["cells"]))

    def test_app_first_defaults_and_role_schema(self):
        defaults = json.loads((ROOT / "config/model_assignments.example.json").read_text(encoding="utf-8"))
        schema = json.loads((ROOT / "config/model_assignments.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(defaults["schema_version"], 1)
        self.assertFalse(defaults["setup_completed"])
        self.assertFalse(defaults["global"]["tts_enabled"])
        self.assertFalse(defaults["global"]["tts_autoread"])
        self.assertEqual(set(defaults["roles"]), {"narrator", "world_state", "scene_image", "character_image", "speech"})
        self.assertTrue(all(v is None for v in defaults["roles"].values()))
        self.assertIn("global", schema["properties"])
        self.assertIn("$defs", schema)
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("APP-FIRST", readme.upper())
        self.assertIn("Colab", readme)

    def test_media_policies_are_documented(self):
        image_doc = (ROOT / "docs/IMAGENES.md").read_text(encoding="utf-8")
        tts_doc = (ROOT / "docs/TTS.md").read_text(encoding="utf-8")
        self.assertTrue(
            "No generar imagen" in image_doc or "on request" in image_doc.lower(),
            "Image documentation must describe an on-demand generation policy",
        )
        self.assertIn("opt-in", tts_doc.lower())
        self.assertIn("default", tts_doc.lower())

if __name__ == "__main__":
    unittest.main()
