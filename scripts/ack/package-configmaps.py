#!/usr/bin/env python3
"""Package repo source into ConfigMaps for the in-cluster ACK demo.

Usage: python scripts/ack/package-configmaps.py
Writes deploy/ack/*-src-configmap.yaml (generated, gitignored).
"""
import base64
import os
import subprocess
import tarfile
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "deploy", "ack")

TARGETS = {
    "operator-src": ["services/workspace-operator/main.go", "services/workspace-operator/go.mod",
                     "services/workspace-operator/go.sum", "services/workspace-operator/api",
                     "services/workspace-operator/internal"],
    "control-plane-src": ["apps/control-plane/package.json", "apps/control-plane/tsconfig.json",
                          "apps/control-plane/src", "apps/control-plane/db"],
    "skill-center-src": ["services/skill-center/package.json", "services/skill-center/tsconfig.json",
                         "services/skill-center/src", "packages/shared/src"],
    "eval-center-src": ["services/eval-center/package.json", "services/eval-center/tsconfig.json",
                        "services/eval-center/src", "packages/shared/src"],
    "app-center-src": ["services/app-center/package.json", "services/app-center/tsconfig.json",
                       "services/app-center/src", "packages/shared/src"],
    "mcp-hub-src": ["services/mcp-hub/package.json", "services/mcp-hub/tsconfig.json",
                    "services/mcp-hub/src", "packages/shared/src"],
}


def package(name: str, paths: list[str]) -> None:
    with tempfile.NamedTemporaryFile(suffix=".tgz", delete=False) as tmp:
        archive = tmp.name
    try:
        with tarfile.open(archive, "w:gz") as tar:
            for path in paths:
                tar.add(os.path.join(ROOT, path), arcname=path)
        data = base64.b64encode(open(archive, "rb").read()).decode()
        yaml = (
            "apiVersion: v1\n"
            "kind: ConfigMap\n"
            "metadata:\n"
            f"  name: {name}\n"
            "  namespace: opencode-system\n"
            "binaryData:\n"
            f"  src.tgz: {data}\n"
        )
        with open(os.path.join(OUT, f"{name}-configmap.yaml"), "w", encoding="utf-8") as fh:
            fh.write(yaml)
        print(f"wrote {name} ({len(data)} b64 chars)")
    finally:
        os.unlink(archive)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, paths in TARGETS.items():
        package(name, paths)
