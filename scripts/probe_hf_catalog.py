"""Optional live Hub probe. Does NOT download weights or execute a model."""
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from noble_api.catalog import HfCatalog  # noqa: E402


def main():
    catalog = HfCatalog()
    try:
        result = catalog.search("Qwen", "narrator", 6)
        if not result["results"]:
            raise RuntimeError("Hugging Face devolvió cero resultados para Qwen GGUF")
        item = result["results"][0]
        details = catalog.details(item["repo_id"])
        print(json.dumps({
            "status": "PASS", "source": "Hugging Face live",
            "query": "Qwen", "results": len(result["results"]),
            "example_repo": details["repo_id"],
            "revision": details["revision"],
            "single_file_variants": len(details["variants"]),
        }, ensure_ascii=False, indent=2))
    finally:
        catalog.close()


if __name__ == "__main__":
    main()
