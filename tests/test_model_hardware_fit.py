"""Model hub fit regressions against deterministic GGUF headers and GPU profiles.

All capacities here are fixtures. An advisory compatibility badge is NEVER
proof of inference on a real GPU.
"""
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"apps"/"api"))
from noble_api.main import create_app
from noble_api.model_fit import assess_variants, gguf_metadata,kv_cache_bytes,quantization

REV="c"*40
REPO="noble-test/quantized-family"
GIB=1024**3


def header():
    entries={
        "general.architecture":"llama",
        "general.parameter_count":8000000000,
        "llama.block_count":32,
        "llama.embedding_length":4096,
        "llama.attention.head_count":32,
        "llama.attention.head_count_kv":8,
        "llama.attention.key_length":128,
        "llama.attention.value_length":128,
    }
    data=b"GGUF"+struct.pack("<IQQ",3,0,len(entries))
    for k,v in entries.items():
        key=k.encode("utf8")
        data+=struct.pack("<Q",len(key))+key
        if isinstance(v,str):
            payload=v.encode("utf8")
            data+=struct.pack("<IQ",8,len(payload))+payload
        else:
            data+=struct.pack("<IQ",10,v)
    return data


def hf(request:httpx.Request):
    if request.url.path=="/api/models/"+REPO:
        return httpx.Response(200,json={
            "id":REPO,"sha":REV,"author":"noble-test","downloads":48000,"likes":215,
            "lastModified":"2026-10-19T12:00:00Z","library_name":"gguf",
            "tags":["gguf","text-generation","llama"],"pipeline_tag":"text-generation",
            "cardData":{"license":"apache-2.0","base_model":"noble-test/base"},
            "siblings":[
                {"rfilename":"family.Q4_K_M.gguf","size":5*GIB},
                {"rfilename":"family.Q6_K.gguf","size":8*GIB},
                {"rfilename":"family.Q8_0.gguf","size":11*GIB},
                {"rfilename":"family.F16.gguf","size":18*GIB},
            ],
        })
    if request.url.path.startswith("/"+REPO+"/resolve/"):
        if request.headers.get("range")=="bytes=0-524287":
            return httpx.Response(206,content=header(),
                headers={"Content-Range":f"bytes 0-{len(header())-1}/{len(header())+2000}"})
    return httpx.Response(404)


class HardwareFitTests(unittest.TestCase):
    def test_gguf_fields_kv_and_quantizations(self):
        meta=gguf_metadata(header())
        self.assertEqual(meta["general.architecture"],"llama")
        self.assertEqual(meta["general.parameter_count"],8_000_000_000)
        # 4096 tokens * 32 layers * 8 kv heads * 256 head dims * 2 bytes
        self.assertEqual(kv_cache_bytes(meta,4096),536870912)
        self.assertEqual(quantization("sample.IQ4_XS.gguf"),"IQ4_XS")
        self.assertEqual(quantization("family.Q4_K_M.gguf"),"Q4_K_M")
        self.assertIsNone(quantization("not-a-model.txt"))
        self.assertEqual(gguf_metadata(b"not a GGUF"),{})

    def test_fit_uses_free_vram_and_alternative_ram(self):
        mock_hw={"gpus":[{"index":0,"name":"RTX 16GB",
                  "vram_total_mb":16384,"vram_free_mb":14336}],
                  "ram_available_mb":32768,"storage_free_gb":140}
        detail={"variants":[
            {"filename":"x.Q4_K_M.gguf","size_bytes":5*GIB,"supported":True},
            {"filename":"x.Q6_K.gguf","size_bytes":8*GIB,"supported":True},
            {"filename":"x.Q8_0.gguf","size_bytes":11*GIB,"supported":True},
            {"filename":"x.F16.gguf","size_bytes":18*GIB,"supported":True},
        ]}
        fit=assess_variants(detail,mock_hw,4096,gguf_metadata(header()))
        self.assertEqual(fit["metadata_source"],"gguf_header")
        self.assertEqual(fit["recommended_filename"],"x.Q8_0.gguf")
        self.assertEqual(fit["variants"][2]["fit"],"full_gpu")
        self.assertIn(fit["variants"][3]["fit"],("partial_offload","cpu"))
        self.assertEqual(fit["parameter_count"],8_000_000_000)
        fit_no_gpu=assess_variants(detail,{**mock_hw,"gpus":[]},4096)
        self.assertEqual(fit_no_gpu["metadata_source"],"fallback_estimate")
        self.assertEqual(fit_no_gpu["variants"][0]["fit"],"cpu")
        too_big=assess_variants(detail,{"gpus":[],"ram_available_mb":512,
                                           "storage_free_gb":2},4096)
        self.assertEqual(too_big["recommended_filename"],None)
        self.assertFalse(too_big["variants"][0]["disk_ok"])

    def test_real_catalog_contract_enriches_metadata_and_bounded_header(self):
        with tempfile.TemporaryDirectory() as temp:
            app=create_app(Path(temp),catalog_transport=httpx.MockTransport(hf))
            gpu={"os":"Windows","cpu":"Fixture","logical_cores":16,
                 "ram_total_mb":65536,"ram_available_mb":45056,
                 "storage_free_gb":100,"gpus":[{"index":0,"name":"RTX",
                 "vram_total_mb":16384,"vram_free_mb":15104,"backend":"cuda","driver":"fixture"}],
                 "device_options":["cuda","cpu"],"fit_is_estimate":True}
            with patch("noble_api.main.snapshot",return_value=gpu):
                with TestClient(app) as client:
                    response=client.get("/api/v1/models/"+REPO)
            self.assertEqual(response.status_code,200,response.text)
            payload=response.json()
            self.assertEqual(payload["author"],"noble-test")
            self.assertEqual(payload["downloads"],48000)
            self.assertEqual(payload["library"],"gguf")
            self.assertEqual(payload["hardware_fit"]["architecture"],"llama")
            self.assertEqual(payload["hardware_fit"]["metadata_source"],"gguf_header")
            self.assertEqual(payload["hardware_fit"]["recommended_filename"],"family.Q8_0.gguf")

    def test_unknown_variant_never_claims_full_gpu(self):
        fit=assess_variants({"variants":[{"filename":"missing.gguf",
                  "size_bytes":None,"supported":True}]},
                  {"gpus":[{"vram_free_mb":16384,"vram_total_mb":16384}],
                   "ram_available_mb":64000,"storage_free_gb":300})
        self.assertIsNone(fit["recommended_filename"])
        self.assertEqual(fit["variants"][0]["fit"],"unknown")


if __name__=="__main__":
    unittest.main()
