"""Storing catalogue photos that operators upload from the admin panel.

Until now every image in the catalogue was a URL pasted by hand, which meant
photos lived on whatever host somebody happened to use. Products need real
uploads, so this writes the bytes to disk under a name we choose and hands back
a URL the mobile app can fetch.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple

from backend.config import UPLOAD_MAX_BYTES, UPLOADS_DIR

__all__ = ["UploadError", "save_image", "public_url", "UPLOAD_MAX_BYTES"]


class UploadError(ValueError):
    """An upload we refuse, with a reason the panel can show as is."""

    def __init__(self, message: str, code: str = "upload_rejected") -> None:
        super().__init__(message)
        self.code = code

    def as_payload(self) -> dict:
        return {"error": self.code, "message": str(self)}


# Extension by content, not by whatever the browser claimed the file was called.
_SIGNATURES: Tuple[Tuple[bytes, str], ...] = (
    (b"\xff\xd8\xff", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"GIF87a", "gif"),
    (b"GIF89a", "gif"),
)


def _sniff(data: bytes) -> Optional[str]:
    for magic, extension in _SIGNATURES:
        if data.startswith(magic):
            return extension
    # WEBP is "RIFF....WEBP", so the marker sits past the size field.
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


def save_image(data: bytes, *, folder: str = "catalog") -> dict:
    """Write an uploaded image and describe where it landed.

    The extension comes from the file's own bytes: trusting the supplied name
    would let someone store a .html or .svg and have it served back from our
    origin. Identical files collapse onto one name, so re-uploading the same
    photo does not litter the disk.
    """
    if not data:
        raise UploadError("Fayl bo'sh", "empty_file")
    if len(data) > UPLOAD_MAX_BYTES:
        limit_mb = UPLOAD_MAX_BYTES / (1024 * 1024)
        raise UploadError(f"Rasm {limit_mb:.0f} MB dan katta bo'lmasligi kerak", "too_large")

    extension = _sniff(data)
    if extension is None:
        raise UploadError("Faqat JPG, PNG, GIF yoki WEBP rasm yuklash mumkin", "unsupported_type")

    safe_folder = "".join(ch for ch in folder if ch.isalnum() or ch in "-_") or "catalog"
    digest = hashlib.sha256(data).hexdigest()[:24]
    stamp = datetime.now(timezone.utc).strftime("%Y%m")
    name = f"{stamp}-{digest}-{secrets.token_hex(3)}.{extension}"

    directory = Path(UPLOADS_DIR) / safe_folder
    directory.mkdir(parents=True, exist_ok=True)

    # Same bytes, same name: skip the write and reuse what is already there.
    existing = next(directory.glob(f"{stamp}-{digest}-*.{extension}"), None)
    if existing is not None:
        name = existing.name
    else:
        (directory / name).write_bytes(data)

    return {
        "path": f"{safe_folder}/{name}",
        "bytes": len(data),
        "extension": extension,
    }


def public_url(path: str, *, request_base: str = "") -> str:
    """Turn a stored path into something the app can load over the network."""
    from backend.config import PUBLIC_API_BASE_URL

    origin = PUBLIC_API_BASE_URL or (request_base or "").rstrip("/")
    return f"{origin}/uploads/{path}" if origin else f"/uploads/{path}"
