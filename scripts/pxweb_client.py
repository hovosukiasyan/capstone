# scripts/pxweb_client.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import json
import requests
import pandas as pd
from pyjstat import pyjstat


@dataclass
class PxWebTable:
    """
    PxWeb table endpoints typically work like:
      - GET  <api_url>        -> metadata (variables, values)
      - POST <api_url> (JSON) -> data in json-stat2 (recommended)
    This workflow is standard across PxWeb deployments.  :contentReference[oaicite:3]{index=3}
    """
    api_url: str


def pxweb_table_url_to_api_url(table_url: str) -> str:
    """
    ArmStat UI URLs look like:
      https://statbank.armstat.am/pxweb/en/ArmStatBank/.../PS-hh-11-2022.px/
    ArmStat API base is listed as:
      https://statbank.armstat.am/api/v1/en/   :contentReference[oaicite:4]{index=4}

    PxWeb APIs typically expose the same table path under /api/v1/<lang>/...
    So we transform the UI path into:
      https://statbank.armstat.am/api/v1/en/ArmStatBank/.../PS-hh-11-2022.px
    """
    if "/pxweb/" not in table_url:
        raise ValueError("Expected a PxWeb UI URL containing '/pxweb/'")

    base = "https://statbank.armstat.am"
    # keep everything after /pxweb/en/  (or /pxweb/hy/)
    # example: /pxweb/en/ArmStatBank/ArmStatBank__.../PS-hh-11-2022.px/
    path = table_url.split("/pxweb/")[1]  # e.g. 'en/ArmStatBank/.../PS-hh-11-2022.px/'
    # strip trailing slash for API calls
    path = path.strip("/")
    # Replace leading 'en/' or 'hy/' with API language segment
    # We want /api/v1/en/<rest after language> ...
    lang = path.split("/")[0]
    rest = "/".join(path.split("/")[1:])
    return f"{base}/api/v1/{lang}/{rest}"


def get_metadata(api_url: str, timeout: int = 60) -> Dict[str, Any]:
    r = requests.get(api_url, timeout=timeout)
    r.raise_for_status()
    return r.json()


def build_query_select_all(meta: Dict[str, Any], *, response_format: str = "json-stat2") -> Dict[str, Any]:
    """
    Build a query that selects ALL values for each variable.
    Metadata contains variables with codes + possible values.
    """
    query = []
    for v in meta["variables"]:
        code = v["code"]
        # v["values"] is a list of allowed values
        values = v.get("values", [])
        query.append({
            "code": code,
            "selection": {"filter": "item", "values": values}
        })

    return {"query": query, "response": {"format": response_format}}


def fetch_table_df(api_url: str, query: Dict[str, Any], timeout: int = 120) -> pd.DataFrame:
    r = requests.post(api_url, json=query, timeout=timeout)
    r.raise_for_status()

    # PX-Web commonly supports json-stat2 :contentReference[oaicite:5]{index=5}
    ds = pyjstat.Dataset.read(r.text)
    df = ds.write("dataframe")
    return df
