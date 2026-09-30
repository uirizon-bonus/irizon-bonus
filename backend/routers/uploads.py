from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import JSONResponse

from backend import deps
from backend.core import uploads as uploads_core

router = APIRouter()


@router.post("/api/uploads/image", dependencies=[Depends(deps.require_admin)])
async def upload_image(request: Request, file: UploadFile = File(...), folder: str = "catalog"):
    """Take a photo from the admin panel and return the URL to store on a record.

    Reading is capped rather than streamed straight to disk: the limit is a few
    megabytes, and refusing an oversized file before it lands is simpler than
    cleaning up a partial write afterwards.
    """
    data = await file.read(uploads_core.UPLOAD_MAX_BYTES + 1)
    try:
        saved = uploads_core.save_image(data, folder=folder)
    except uploads_core.UploadError as exc:
        return JSONResponse(exc.as_payload(), status_code=400)

    return {
        "url": uploads_core.public_url(saved["path"], request_base=str(request.base_url)),
        "path": saved["path"],
        "bytes": saved["bytes"],
    }
