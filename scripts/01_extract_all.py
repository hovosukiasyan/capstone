# scripts/01_extract_all.py
from __future__ import annotations

import sys
import shutil
import subprocess
from pathlib import Path
import traceback
import requests

# ----------------------------
# CONFIG
# ----------------------------
TABLES = {
    "poverty_ps_hh_11": "https://statbank.armstat.am/pxweb/en/ArmStatBank/ArmStatBank__2%20Population%20and%20social%20processes__25%20Households/PS-hh-11-2022.px/",
    "crime_selected_ps_ls_oc03": "https://statbank.armstat.am/pxweb/en/ArmStatBank/ArmStatBank__2%20Population%20and%20social%20processes__29%20Legal%20issues__2904-ls-oc/ps-ls-oc03.px/",
    "crime_severity_ps_ls_oc02": "https://statbank.armstat.am/pxweb/en/ArmStatBank/ArmStatBank__2%20Population%20and%20social%20processes__29%20Legal%20issues__2904-ls-oc/ps-ls-oc02.px/",
    "health_capacity_ps_si_hms33": "https://statbank.armstat.am/pxweb/en/ArmStatBank/ArmStatBank__2%20Population%20and%20social%20processes__24%20Social%20issues__2401-si-hms/ps-si-hms33.px/",
}

# NOTE: I fixed one common typo above (ps-si-hms33 vs ps-si_hms33).
# If your original URL has a dash, keep the dash. If it has underscore, keep underscore.
# If this table fails, we will copy your exact link back in.

POPULATION_XLSX = "https://armstat.am/file/doc/99532168.xlsx"

# ----------------------------
# PATHS (robust: always from project root)
# ----------------------------
THIS_FILE = Path(__file__).resolve()
SCRIPTS_DIR = THIS_FILE.parent
PROJECT_ROOT = SCRIPTS_DIR.parent

RAW_DIR = PROJECT_ROOT / "data" / "raw"
PX_DIR = RAW_DIR / "pxweb"
POP_DIR = RAW_DIR / "population"

PX_DIR.mkdir(parents=True, exist_ok=True)
POP_DIR.mkdir(parents=True, exist_ok=True)


def loud_print(msg: str) -> None:
    print(msg, flush=True)


def check_environment() -> None:
    loud_print(">>> STARTING 01_extract_all.py (HTML scraper mode)")
    loud_print(f">>> Python: {sys.version.splitlines()[0]}")
    loud_print(f">>> Script path: {THIS_FILE}")
    loud_print(f">>> Project root: {PROJECT_ROOT}")
    loud_print(f">>> Output folder: {RAW_DIR}")

    # Check write permission
    test_file = PX_DIR / ".write_test"
    try:
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink(missing_ok=True)
        loud_print(">>> Write permission: OK")
    except Exception as e:
        raise RuntimeError(f"Cannot write to {PX_DIR}. Check permissions. Error: {e}") from e

    # Check that statbank_parser is installed
    try:
        import statbank_parser  # noqa: F401
        loud_print(">>> statbank_parser import: OK")
    except Exception:
        raise RuntimeError(
            "statbank_parser is not installed.\n\n"
            "Install it with:\n"
            "  python3 -m pip install git+https://github.com/opendataam/statbank-parser.git\n"
        )


def download_population_excel() -> Path:
    out = POP_DIR / "population_by_marz_year.xlsx"
    loud_print(f"\n[1/2] Downloading population Excel...")
    loud_print(f"URL: {POPULATION_XLSX}")

    r = requests.get(POPULATION_XLSX, timeout=180)
    if not r.ok:
        loud_print("\n[POPULATION DOWNLOAD ERROR]")
        loud_print(f"Status: {r.status_code}")
        loud_print("Body (first 2000 chars):")
        loud_print(r.text[:2000])
        r.raise_for_status()

    out.write_bytes(r.content)
    loud_print(f"Saved population file -> {out}")
    loud_print(f"File size: {out.stat().st_size} bytes")
    return out


def run_statbank_parser(url: str, output_path: Path) -> None:
    cmd = [
        sys.executable,
        "-m",
        "statbank_parser.cli",
        "get-data",
        "--url",
        url,
        "--output",
        str(output_path),
    ]

    loud_print(f"Running: {' '.join(cmd)}")
    proc = subprocess.run(cmd, capture_output=True, text=True)

    # Always show some output if something went wrong OR file is empty
    def show_logs():
        loud_print("STDOUT (first 2000 chars):")
        loud_print((proc.stdout or "")[:2000])
        loud_print("STDERR (first 2000 chars):")
        loud_print((proc.stderr or "")[:2000])

    if proc.returncode != 0:
        loud_print("\n[STATBANK_PARSER ERROR] Non-zero exit code.")
        show_logs()
        raise RuntimeError(f"statbank_parser failed for URL: {url}")

    # If command "succeeded" but output is empty, print logs too (very useful)
    if not output_path.exists() or output_path.stat().st_size < 50:
        loud_print("\n[STATBANK_PARSER WARNING] Output is empty/suspicious.")
        show_logs()
        raise RuntimeError(
            f"Output looks empty: {output_path} "
            f"(size={output_path.stat().st_size if output_path.exists() else 0})"
        )

    loud_print("statbank_parser OK.")
    loud_print(f"Saved -> {output_path} (size={output_path.stat().st_size} bytes)")

def extract_one(name: str, table_url: str) -> Path:
    loud_print(f"\n[2/2] Extracting table: {name}")
    loud_print(f"URL: {table_url}")

    out = PX_DIR / f"{name}.csv"
    run_statbank_parser(table_url, out)
    return out


def main() -> None:
    check_environment()

    download_population_excel()

    for name, url in TABLES.items():
        extract_one(name, url)

    loud_print("\n>>> DONE. Files created:")
    loud_print(f" - {PX_DIR}")
    loud_print(f" - {POP_DIR}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        loud_print("\nStopped by user (KeyboardInterrupt).")
        raise
    except Exception as e:
        loud_print("\n[FATAL ERROR] The extraction script failed.")
        loud_print(f"Error: {e}")
        loud_print("\nTraceback:")
        loud_print(traceback.format_exc())
        sys.exit(1)
