"""Static locale key and interpolation-parity gate for the shipped web UI."""
import json
from pathlib import Path
import re
import unittest

BASE = Path(__file__).resolve().parents[1] / "apps" / "web" / "src" / "locales"
LANGUAGES = ("en", "es-419", "pt-BR", "zh-CN")
PLACEHOLDERS = re.compile(r"{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}")


class InterfaceLocaleTests(unittest.TestCase):
    def test_catalogs_have_matching_keys_and_interpolation_variables(self):
        catalogs = {lang: json.loads((BASE / (lang + ".json")).read_text("utf-8"))
                    for lang in LANGUAGES}
        expected = set(catalogs["en"])
        self.assertGreaterEqual(len(expected), 150)
        for lang, catalog in catalogs.items():
            with self.subTest(language=lang):
                self.assertEqual(set(catalog), expected)
                self.assertEqual(len(catalog), len(expected))
                for key, source in catalogs["en"].items():
                    value = catalog[key]
                    self.assertIsInstance(value, str)
                    self.assertTrue(value.strip(), key)
                    self.assertEqual(set(PLACEHOLDERS.findall(source)),
                                     set(PLACEHOLDERS.findall(value)), key)


    def test_react_translation_keys_exist_in_english_catalog(self):
        """All static t('key') references in React must resolve to catalog entries."""
        english = json.loads((BASE / "en.json").read_text("utf-8"))
        key_call = re.compile(r"""\bt\(\s*(['"])([^'"]+)\1""")
        missing = []
        references = 0
        for source in sorted(BASE.parent.glob("*.tsx")):
            for match in key_call.finditer(source.read_text("utf-8")):
                key = match.group(2)
                if key.endswith("."):
                    # Dynamic key prefix, e.g. t('nav.' + page), checked at runtime.
                    continue
                references += 1
                if key not in english:
                    missing.append(f"{source.name}: {key}")
        self.assertGreater(references, 300)
        self.assertEqual(missing, [], "\n".join(missing))

    def test_action_feedback_uses_translatable_keys(self):
        """Prevent new hardcoded feedback messages in the localized panels."""
        panels = ("ImageCheckpointManager", "ComfyRuntimePanel", "ImageSettingsPanel",
                  "RemoteWorkers", "RuntimeManager", "VoiceSettingsPanel",
                  "StoryStudio", "WorldStateEditor", "AssistantStoryWizard")
        hardcoded = re.compile(r"""\b(?:setMessage|setNotice)\(\s*(['"])([^'"]+)\1""")
        errors = []
        for panel in panels:
            source = BASE.parent / (panel + ".tsx")
            for match in hardcoded.finditer(source.read_text("utf-8")):
                errors.append(f"{panel}: {match.group(2)}")
        self.assertEqual(errors, [], "\n".join(errors))


    def test_dynamic_ui_lookup_domains_have_complete_translations(self):
        """All known dynamic navigation, download, fit and reader keys exist in every locale."""
        domains = {
            "nav": ("inicio", "descubrir", "crear", "modelos", "descargas",
                    "ajustes", "diagnostico"),
            "jobs": ("queued", "downloading", "verifying", "paused", "failed",
                     "completed", "cancelled", "canceled", "installed",
                     "availableToInstall"),
            "modelFitUi": ("unknown", "full_gpu", "partial_offload", "cpu",
                           "too_large", "unsupported"),
            "reader": ("summary", "history", "gallery", "uiUx"),
            "storySse": ("preparing", "connecting", "streaming"),
        }
        for language in LANGUAGES:
            catalog = json.loads((BASE / (language + ".json")).read_text("utf-8"))
            for namespace, suffixes in domains.items():
                for suffix in suffixes:
                    with self.subTest(language=language, key=namespace + "." + suffix):
                        key = namespace + "." + suffix
                        self.assertIn(key, catalog)
                        self.assertTrue(catalog[key].strip())

    def test_primary_ui_surfaces_are_localized_in_every_supported_language(self):
        """Catch accidental English fallbacks on critical screens."""
        english = json.loads((BASE / "en.json").read_text("utf-8"))
        visible = (
            "nav.inicio", "nav.crear", "nav.ajustes", "model.description",
            "creator.title", "reader.emptyHint", "jobs.downloading",
            "modelFitUi.too_large", "settings.workspaceDescription",
            "voice.description", "reader.summary", "reader.history",
            "reader.gallery", "reader.uiUx",
        )
        for language in LANGUAGES[1:]:
            catalog = json.loads((BASE / (language + ".json")).read_text("utf-8"))
            for key in visible:
                with self.subTest(language=language, key=key):
                    self.assertIn(key, catalog)
                    self.assertNotEqual(catalog[key], english[key])


    def test_number_formats_do_not_default_to_browser_or_fixed_costa_rica_locale(self):
        """UI numerals must use the selected UI locale, not the browser locale."""
        ui_sources = sorted(BASE.parent.glob("*.tsx"))
        unscoped = []
        for source in ui_sources:
            for line, value in enumerate(source.read_text("utf-8").splitlines(), 1):
                if ".toLocaleString()" in value:
                    unscoped.append(f"{source.name}:{line}")
        self.assertEqual(unscoped, [], "Unscoped localized numbers: " + ", ".join(unscoped))
        api_helpers = (BASE.parent / "api.ts").read_text("utf-8")
        self.assertNotIn("Intl.NumberFormat('es-CR'", api_helpers)


    def test_non_react_client_diagnostics_use_translations(self):
        """Client-side fallback errors must follow UI locale; backend error details stay English."""
        english = json.loads((BASE / "en.json").read_text("utf-8"))
        keys = (
            "apiClient.validationError", "apiClient.httpError",
            "apiClient.voicePreviewError", "apiClient.voiceSynthesisError",
            "apiClient.saveVisualError", "apiClient.importExpressionError",
            "apiClient.restoreBackupError", "apiClient.importIllustrationError",
            "apiClient.noStreamError", "apiClient.invalidStoryIdentifier",
        )
        for language in LANGUAGES:
            catalog = json.loads((BASE / (language + ".json")).read_text("utf-8"))
            for key in keys:
                with self.subTest(language=language, key=key):
                    self.assertIn(key, catalog)
                    self.assertTrue(catalog[key].strip())
        api_source = (BASE.parent / "api.ts").read_text("utf-8")
        route_source = (BASE.parent / "workspaceRoute.ts").read_text("utf-8")
        self.assertIn("import i18n from './i18n';", api_source)
        self.assertIn("import i18n from './i18n';", route_source)
        self.assertNotIn("throw new Error('The provider did not return a data stream.')",
                         api_source)
        self.assertNotIn("throw new Error('Invalid story identifier')", route_source)
        self.assertNotIn("'Error HTTP ' + response.status", api_source)
        self.assertIn("import { fetchWithApiError, responseFailure } from './apiErrors';",
                      api_source)
        self.assertGreaterEqual(api_source.count("throw await responseFailure("), 8)
        self.assertEqual(route_source.count("i18n.t('apiClient."), 1)



    def test_known_backend_status_copy_is_not_rendered_raw(self):
        """Known English API status prose must be localized at the view boundary."""
        english = json.loads((BASE / "en.json").read_text("utf-8"))
        keys = (
            "feedback.narratorModelAssigned",
            "reader.directorReasonEvent", "reader.directorReasonEmotion",
            "reader.directorReasonReused", "reader.directorReasonNew",
            "settings.networkLoopbackExplanation",
        )
        for key in keys:
            self.assertIn(key, english)
        app = (BASE.parent / "App.tsx").read_text("utf-8")
        reader = (BASE.parent / "VisualReader.tsx").read_text("utf-8")
        network = (BASE.parent / "WorkspaceSettings.tsx").read_text("utf-8")
        self.assertNotIn("setNotice(result.message)", app)
        self.assertNotIn("<p>{directorPreview.reason}</p>", reader)
        self.assertIn("'reader.directorReasonEvent'", reader)
        self.assertIn("t('settings.networkLoopbackExplanation')", network)



    def test_api_error_boundaries_are_localized_and_keep_diagnostics_separate(self):
        """All HTTP/media/SSE fallback errors must flow through one i18n boundary."""
        english = json.loads((BASE / "en.json").read_text("utf-8"))
        keys = (
            "apiClient.badRequest", "apiClient.authenticationRequired",
            "apiClient.accessDenied", "apiClient.notFound",
            "apiClient.requestTimeout", "apiClient.conflict",
            "apiClient.payloadTooLarge", "apiClient.invalidField",
            "apiClient.tooManyRequests", "apiClient.serverError",
            "apiClient.serviceUnavailable", "apiClient.networkError",
            "apiClient.storyNotFound", "apiClient.generationError",
        )
        for language in LANGUAGES:
            catalog = json.loads((BASE / (language + ".json")).read_text("utf-8"))
            for key in keys:
                with self.subTest(language=language, key=key):
                    self.assertIn(key, catalog)
                    self.assertTrue(catalog[key].strip())
                    if language != "en":
                        self.assertNotEqual(english[key], catalog[key])
        helper = (BASE.parent / "apiErrors.ts").read_text("utf-8")
        self.assertIn("export async function responseFailure(", helper)
        self.assertIn("export function streamFailure(", helper)
        self.assertIn("readonly diagnostic: unknown", helper)
        api_source = (BASE.parent / "api.ts").read_text("utf-8")
        studio = (BASE.parent / "StoryStudio.tsx").read_text("utf-8")
        self.assertEqual(api_source.count("await fetchWithApiError("), 8)
        self.assertGreaterEqual(api_source.count("throw await responseFailure("), 8)
        self.assertNotIn("throw new Error(error.detail", api_source)
        self.assertNotIn("throw new Error(payload.detail", api_source)
        self.assertIn("throw streamFailure(evt.data)", studio)
        self.assertNotIn("throw new Error(evt.data.message)", studio)


    def test_background_job_diagnostics_do_not_bypass_i18n(self):
        """Task status copy is localized; the original backend detail is opt-in."""
        keys = ("apiClient.backgroundTaskFailed", "apiClient.showTechnicalDetails",
                "apiClient.unknownSize", "jobs.unknown", "settings.networkUnknown")
        for language in LANGUAGES:
            catalog = json.loads((BASE / (language + ".json")).read_text("utf-8"))
            for key in keys:
                self.assertIn(key, catalog)
                self.assertTrue(catalog[key].strip())
        component = (BASE.parent / "BackendDiagnostic.tsx").read_text("utf-8")
        self.assertIn("t('apiClient.backgroundTaskFailed')", component)
        self.assertIn("t('apiClient.showTechnicalDetails')", component)
        self.assertIn("<details>", component)
        for filename in ("App.tsx", "ImageCheckpointManager.tsx", "VoiceSettingsPanel.tsx"):
            source = (BASE.parent / filename).read_text("utf-8")
            with self.subTest(filename=filename):
                self.assertIn("<BackendDiagnostic detail={job.error}", source)
                self.assertNotIn("{job.error}</", source)
                self.assertNotIn("+ job.error", source)
        self.assertNotIn("return 'Unknown size'", (BASE.parent / "api.ts").read_text("utf-8"))
        self.assertNotIn(" : network.message", (BASE.parent / "WorkspaceSettings.tsx").read_text("utf-8"))


if __name__ == "__main__":
    unittest.main()
