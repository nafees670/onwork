"""
PPTX/DOCX -> PDF conversion via headless LibreOffice.

Requires the `libreoffice` package to be installed in the runtime image
(see Backend/Dockerfile). Conversion runs synchronously inside the request
— acceptable here since uploads are an infrequent admin action, not a
high-throughput path.
"""
import os
import subprocess
import tempfile
from pathlib import Path


class ConversionError(Exception):
    """Raised when LibreOffice fails or times out converting a document."""


def convert_to_pdf(input_path: str, original_filename: str) -> bytes:
    """
    Convert a PPTX/DOCX file on disk to PDF bytes.

    Runs `soffice --headless --convert-to pdf` into a scratch directory so
    concurrent conversions never collide, then reads the result back into
    memory and lets the scratch directory get cleaned up automatically.
    """
    with tempfile.TemporaryDirectory(prefix="hr_policy_") as outdir, tempfile.TemporaryDirectory(
        prefix="lo_profile_"
    ) as profile_dir:
        # LibreOffice writes config/cache files even in headless mode. Give
        # every conversion an isolated writable profile for concurrent uploads.
        profile_uri = Path(profile_dir).as_uri()
        environment = {
            **os.environ,
            "HOME": profile_dir,
            "XDG_CONFIG_HOME": profile_dir,
            "XDG_CACHE_HOME": profile_dir,
            "XDG_DATA_HOME": profile_dir,
        }
        try:
            result = subprocess.run(
                [
                    "soffice",
                    "--headless",
                    "--norestore",
                    f"-env:UserInstallation={profile_uri}",
                    "--convert-to", "pdf",
                    "--outdir", outdir,
                    input_path,
                ],
                capture_output=True,
                env=environment,
                timeout=60,
            )
        except subprocess.TimeoutExpired as exc:
            raise ConversionError(
                f"Conversion of '{original_filename}' timed out"
            ) from exc
        except FileNotFoundError as exc:
            raise ConversionError(
                "LibreOffice (soffice) is not installed on this server"
            ) from exc

        if result.returncode != 0:
            stderr = result.stderr.decode(errors="replace").strip()
            raise ConversionError(
                f"Failed to convert '{original_filename}': {stderr or 'unknown error'}"
            )

        produced = list(Path(outdir).glob("*.pdf"))
        if not produced:
            raise ConversionError(
                f"Conversion of '{original_filename}' produced no output file"
            )
        return produced[0].read_bytes()
