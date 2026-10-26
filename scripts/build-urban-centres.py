# /// script
# requires-python = ">=3.9"
# dependencies = ["shapely==2.0.7"]
# ///
"""Build the server-only city index from the pinned JRC GeoPackage (uv run this file)."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import urllib.request
import zipfile

from shapely import from_wkb

SOURCE = "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_UCDB_GLOBE_R2024A/GHS_UCDB_THEME_GLOBE_R2024A/GHS_UCDB_THEME_GENERAL_CHARACTERISTICS_GLOBE_R2024A/V1-2/GHS_UCDB_THEME_GENERAL_CHARACTERISTICS_GLOBE_R2024A_V1_2.zip"
SHA256 = "bc879d82320504f89df2041b7936221c8239cd808abe93980493aed062b4f3d6"
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "urban-centres.json.gz"


def ring(coordinates):
    return [[round(x, 3), round(y, 3)] for x, y in coordinates]


def build(archive):
    if hashlib.sha256(archive).hexdigest() != SHA256:
        raise ValueError("Source checksum changed; review the new dataset before updating")
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped, tempfile.TemporaryDirectory() as temp:
        database = Path(temp) / "cities.gpkg"
        database.write_bytes(zipped.read("GHS_UCDB_THEME_GENERAL_CHARACTERISTICS_GLOBE_R2024A.gpkg"))
        with sqlite3.connect(database) as db:
            rows = db.execute("SELECT ID_UC_G0, GC_UCN_MAI_2025, GC_UCN_LIS_2025, geom FROM GHSL_UCDB_THEME_GENERAL_CHARACTERISTICS_GLOBE_R2024A ORDER BY ID_UC_G0")
            cities = []
            for city_id, name, names, blob in rows:
                # Skip the GeoPackage header/envelope before decoding its WKB geometry.
                envelope = (blob[3] >> 1) & 7
                geometry = from_wkb(blob[8 + [0, 32, 48, 48, 64][envelope]:])
                if geometry.is_empty:
                    raise ValueError(f"Missing geometry for {city_id}")
                if not name:
                    continue
                cities.append({
                    "id": city_id,
                    "name": name,
                    "names": sorted(set([name] + [n.strip() for n in (names or "").split(";") if n.strip()])),
                    "bounds": list(geometry.bounds),
                    "polygons": [[ring(p.exterior.coords), *[ring(h.coords) for h in p.interiors]] for p in geometry.geoms],
                })
    data = {"source": SOURCE, "sha256": SHA256, "projection": "ESRI:54009", "epoch": 2025, "cities": cities}
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_bytes(gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode(), mtime=0))
    print(f"Wrote {len(cities)} urban centres ({OUTPUT.stat().st_size:,} compressed bytes)")


if __name__ == "__main__":
    with urllib.request.urlopen(SOURCE, timeout=60) as response:
        build(response.read())
