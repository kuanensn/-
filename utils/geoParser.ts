import { GeoFeatureCollection, GeoFeature } from "../types";

export const parseMapFile = async (file: File): Promise<GeoFeatureCollection | null> => {
  const text = await file.text();
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'json' || extension === 'geojson') {
    try {
      const json = JSON.parse(text);
      if (json.type === 'FeatureCollection') {
        return json as GeoFeatureCollection;
      } else if (json.type === 'Feature') {
        return { type: 'FeatureCollection', features: [json] };
      }
      return null;
    } catch (e) {
      console.error("Invalid GeoJSON", e);
      return null;
    }
  } 
  
  if (extension === 'kml') {
    return parseKML(text);
  }

  return null;
};

// Basic KML to GeoJSON converter
const parseKML = (kmlText: string): GeoFeatureCollection => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(kmlText, "text/xml");
  const placemarks = xmlDoc.getElementsByTagName("Placemark");
  const features: GeoFeature[] = [];

  for (let i = 0; i < placemarks.length; i++) {
    const placemark = placemarks[i];
    const name = placemark.getElementsByTagName("name")[0]?.textContent;
    const description = placemark.getElementsByTagName("description")[0]?.textContent;
    
    // Polygon
    const polygon = placemark.getElementsByTagName("Polygon")[0];
    if (polygon) {
      const coords = polygon.getElementsByTagName("coordinates")[0]?.textContent;
      if (coords) {
        features.push({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [parseCoordinates(coords)]
          },
          properties: { name, description, type: 'area' }
        });
        continue;
      }
    }

    // LineString
    const lineString = placemark.getElementsByTagName("LineString")[0];
    if (lineString) {
      const coords = lineString.getElementsByTagName("coordinates")[0]?.textContent;
      if (coords) {
        features.push({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: parseCoordinates(coords)
          },
          properties: { name, description, type: 'route' }
        });
        continue;
      }
    }

    // Point
    const point = placemark.getElementsByTagName("Point")[0];
    if (point) {
      const coords = point.getElementsByTagName("coordinates")[0]?.textContent;
      if (coords) {
        const parsed = parseCoordinates(coords);
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: parsed[0] // Points are usually single coord in array from parseCoordinates helper
          },
          properties: { name, description, type: 'poi' }
        });
      }
    }
  }

  return { type: "FeatureCollection", features };
};

const parseCoordinates = (coordString: string): number[][] => {
  return coordString.trim().split(/\s+/).map(pair => {
    const [lon, lat] = pair.split(',').map(Number);
    return [lon, lat];
  });
};