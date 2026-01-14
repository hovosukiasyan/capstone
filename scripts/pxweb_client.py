# scripts/pxweb_client.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Tuple
import requests
import pandas as pd
from pyjstat import pyjstat


@dataclass
class PxWebResolved:
    ui_url: str
    api_url: str
    tried: List[Tuple[str, int]]  # (url, status_code)


def _parse_pxweb_ui_url(table_url: str) -> Tuple[str, str, str, str]:
    """
    Parse:
      https://statbank.armstat.am/pxweb/en/ArmStatBank/<REST>/<TABLE>.px/
    Returns: (host, lang, db, rest)
    where rest is everything after "/pxweb/<lang>/<db>/" and without trailing "/"
    """
    if not isinstance(table_url, str) or not table_url.strip():
        raise ValueError("table_url must be a non-empty string")

    if "/pxweb/" not in table_url:
        raise ValueError(f"Expected PxWeb UI URL containing '/pxweb/'. Got: {table_url}")

    # host like: https://statbank.armstat.am
    host = table_url.split("/pxweb/")[0].rstrip("/")

    tail = table_url.split("/pxweb/")[1].strip().strip("/")  # en/ArmStatBank/....
    parts = tail.split("/")
    if len(parts) < 3:
        raise ValueError(f"Unexpected PxWeb URL structure. Got: {table_url}")

    lang = parts[0]          # en
    db = parts[1]            # ArmStatBank
    rest = "/".join(parts[2:]).rstrip("/")  # everything after db

    # UI typically ends with ".px" or ".px/". Keep the ".px" part.
    # If rest ends with ".px/" or ".px", we want it ending with ".px"
    if rest.endswith(".px/"):
        rest = rest[:-1]
    if rest.endswith("/"):
        rest = rest[:-1]

    return host, lang, db, rest


def candidate_api_urls(table_url: str) -> List[str]:
    """
    Build multiple possible API URL patterns and try them all.
    PxWeb installations differ in where API is mounted.
    """
    host, lang, db, rest = _parse_pxweb_ui_url(table_url)

    candidates = [
        # Pattern 1: host/api/v1/<lang>/<db>/<rest>
        f"{host}/api/v1/{lang}/{db}/{rest}",
        # Pattern 2: host/api/v1/<lang>/<rest>  (some installs don't repeat db)
        f"{host}/api/v1/{lang}/{rest}",
        # Pattern 3: host/pxweb/api/v1/<lang>/<db>/<rest>
        f"{host}/pxweb/api/v1/{lang}/{db}/{rest}",
        # Pattern 4: host/pxweb/api/v1/<lang>/<rest>
        f"{host}/pxweb/api/v1/{lang}/{rest}",
        # Pattern 5: host/pxweb/<lang>/<db>/api/v1/<lang>/<db>/<rest>
        f"{host}/pxweb/{lang}/{db}/api/v1/{lang}/{db}/{rest}",
        # Pattern 6: host/pxweb/<lang>/<db>/api/v1/<lang>/<rest>
        f"{host}/pxweb/{lang}/{db}/api/v1/{lang}/{rest}",
    ]

    # some servers require trailing slash, some don't -> try both
    expanded: List[str] = []
    for u in candidates:
        expanded.append(u.rstrip("/"))
        expanded.append(u.rstrip("/") + "/")

    # de-duplicate while preserving order
    seen = set()
    out = []
    for u in expanded:
        if u not in seen:
            out.append(u)
            seen.add(u)
    return out


def resolve_api_url(table_url: str, timeout: int = 40) -> PxWebResolved:
    """
    Try candidates until one returns metadata JSON with a "variables" field.
    """
    tried: List[Tuple[str, int]] = []
    headers = {"Accept": "application/json"}

    for api_url in candidate_api_urls(table_url):
        try:
            r = requests.get(api_url, headers=headers, timeout=timeout)
            tried.append((api_url, r.status_code))
            if not r.ok:
                continue

            # Must be JSON and must contain variables
            js = r.json()
            if isinstance(js, dict) and "variables" in js and isinstance(js["variables"], list):
                return PxWebResolved(ui_url=table_url, api_url=api_url, tried=tried)

        except Exception:
            # network/json parsing error
            tried.append((api_url, -1))
            continue

    # If we get here, nothing worked
    lines = ["Could not resolve a working PxWeb API endpoint.", f"UI URL: {table_url}", "Tried:"]
    for u, code in tried[:20]:
        lines.append(f"  - {code}  {u}")
    raise RuntimeError("\n".join(lines))


def get_metadata(api_url: str, timeout: int = 60) -> Dict[str, Any]:
    r = requests.get(api_url, headers={"Accept": "application/json"}, timeout=timeout)
    if not r.ok:
        print("\n[PXWEB METADATA ERROR]")
        print("Status:", r.status_code)
        print("URL:", api_url)
        print("Body (first 2000 chars):")
        print(r.text[:2000])
        r.raise_for_status()
    return r.json()


def build_query_select_all(meta: Dict[str, Any], *, response_format: str = "json-stat2") -> Dict[str, Any]:
    if "variables" not in meta:
        raise ValueError("Metadata missing 'variables'. Can't build query.")

    query = []
    for v in meta["variables"]:
        code = v.get("code")
        values = v.get("values", [])
        if not code:
            raise ValueError(f"Variable missing code in metadata: {v}")
        if not isinstance(values, list):
            raise ValueError(f"Variable values not a list for code={code}: {values}")

        query.append(
            {
                "code": code,
                "selection": {"filter": "item", "values": values},
            }
        )

    return {"query": query, "response": {"format": response_format}}


def fetch_table_df(api_url: str, query: Dict[str, Any], timeout: int = 180) -> pd.DataFrame:
    r = requests.post(api_url, json=query, timeout=timeout)

    if not r.ok:
        print("\n[PXWEB DATA ERROR]")
        print("Status:", r.status_code)
        print("URL:", api_url)
        print("Body (first 4000 chars):")
        print(r.text[:4000])
        r.raise_for_status()

    try:
        ds = pyjstat.Dataset.read(r.text)
        df = ds.write("dataframe")
    except Exception as e:
        print("\n[PXWEB PARSE ERROR]")
        print("URL:", api_url)
        print("Body (first 4000 chars):")
        print(r.text[:4000])
        raise RuntimeError(f"Failed to parse PxWeb response as json-stat2: {e}") from e

    return df
