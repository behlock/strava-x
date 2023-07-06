import sys

import gpxpy


def extract_gpx_data(file_path):
    with open(file_path, "r") as gpx_file:
        gpx = gpxpy.parse(gpx_file)

        data_points = []

        for track in gpx.tracks:
            for segment in track.segments:
                for point in segment.points:
                    latitude = point.latitude
                    longitude = point.longitude
                    # Extract any additional data fields you need
                    # such as intensity or elevation

                    # Add the data point to the list
                    data_points.append(
                        {
                            "latitude": latitude,
                            "longitude": longitude,
                            # Add additional fields if necessary
                        }
                    )

        return data_points


def main(file_path: str) -> None:
    gpx_file_path = file_path
    # Extract the data from the GPX file
    extracted_data = extract_gpx_data(gpx_file_path)

    # Print the extracted data points
    for point in extracted_data:
        print(f"Latitude: {point['latitude']}, Longitude: {point['longitude']}")
        # Print any additional fields you extracted


# Entrypoint
if __name__ == "__main__":
    main(sys.argv[1])
