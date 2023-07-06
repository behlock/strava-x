import json
import sys
import os

import gpxpy


def read_geojson(file_path):
    with open(file_path) as file:
        data = json.load(file)
    return data


def convert_gpx_to_geojson(file_path):
    with open(file_path, "r") as gpx_file:
        gpx = gpxpy.parse(gpx_file)

        features = []

        for track in gpx.tracks:
            for segment in track.segments:
                coordinates = []

                for point in segment.points:
                    coordinates.append([point.longitude, point.latitude])

                feature = {
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": coordinates},
                    "properties": {},
                }

                features.append(feature)

        geojson = {"type": "FeatureCollection", "features": features}

        return geojson


def get_files_with_extension(directory, extension):
    file_names = []
    for file in os.listdir(directory):
        if file.endswith(extension):
            file_names.append(file)
    return file_names


def bulk_gpx_to_geojson(gpx_files_path: str) -> None:
    file_names = get_files_with_extension(gpx_files_path, ".gpx")

    for file_name in file_names:
        # Convert GPX data to GeoJSON
        geojson_data = convert_gpx_to_geojson(gpx_files_path + file_name)

        with open(f"../{file_name.replace('.gpx', '.geojson')}", "w") as output_file:
            json.dump(geojson_data, output_file)


def combine_geojsons(geojson_files_path: str) -> None:
    file_names = get_files_with_extension(geojson_files_path, ".geojson")

    features = []

    for file_name in file_names:
        with open(geojson_files_path + file_name) as file:
            data = json.load(file)
            features.extend(data["features"])

    geojson = {"type": "FeatureCollection", "features": features}

    with open("../combined.geojson", "w") as output_file:
        json.dump(geojson, output_file)


def main(gpx_files_path: str) -> None:
    combine_geojsons(gpx_files_path)


# Entrypoint
if __name__ == "__main__":
    main(sys.argv[1])
