import type {
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
  StyleSpecification,
} from "maplibre-gl";

import type {
  LngLat,
  NavigationRoute,
  SceneCollections,
} from "./types";

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const SOURCE_IDS = [
  "nav-roads",
  "nav-sidewalks",
  "nav-medians",
  "nav-bridges",
  "nav-footbridges",
  "nav-tunnels",
  "nav-markings",
  "nav-waterways",
  "nav-greens",
  "nav-buildings",
  "nav-symbols",
  "nav-route",
  "nav-traveled",
] as const;

const LAYER_IDS = [
  "nav-greens",
  "nav-water-polygons",
  "nav-water-lines",
  "nav-buildings",
  "nav-tunnels",
  "nav-road-shadow",
  "nav-roads",
  "nav-sidewalks",
  "nav-medians",
  "nav-bridge-shadow",
  "nav-bridges",
  "nav-footbridges",
  "nav-markings",
  "nav-route-shadow",
  "nav-active-route",
  "nav-traveled",
  "nav-point-symbols",
] as const;

export function navigationStyle(): StyleSpecification {
  return {
    version: 8,
    name: "ITS Maps Lane-Level Navigation",
    light: {
      anchor: "viewport",
      color: "#fff8ec",
      intensity: 0.58,
      position: [1.15, 205, 34],
    },
    sky: {
      "sky-color": "#79c9ee",
      "horizon-color": "#e8f5f8",
      "fog-color": "#dceced",
      "sky-horizon-blend": 0.58,
      "horizon-fog-blend": 0.28,
      "fog-ground-blend": 0.18,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 14, 0.75, 20, 0.28, 22, 0.12],
    },
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#f3f8f3", "background-opacity": 1 },
      },
    ],
  };
}

function ensureSource(map: MapLibreMap, id: string): void {
  if (map.getSource(id)) return;
  map.addSource(id, {
    type: "geojson",
    data: EMPTY_COLLECTION,
  });
}

function addLayer(map: MapLibreMap, layer: LayerSpecification): void {
  if (!map.getLayer(layer.id)) map.addLayer(layer);
}

function layerSpecifications(): LayerSpecification[] {
  return [
    {
      id: "nav-greens",
      type: "fill-extrusion",
      source: "nav-greens",
      paint: {
        "fill-extrusion-color": "#a9d69d",
        "fill-extrusion-base": 0,
        "fill-extrusion-height": 0.12,
        "fill-extrusion-opacity": 0.94,
      },
    },
    {
      id: "nav-water-polygons",
      type: "fill",
      source: "nav-waterways",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#8fcfe5", "fill-opacity": 0.94 },
    },
    {
      id: "nav-water-lines",
      type: "line",
      source: "nav-waterways",
      filter: ["==", ["geometry-type"], "LineString"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#58b5d5",
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1.25, 18, 4, 21, 9],
      },
    },
    {
      id: "nav-buildings",
      type: "fill-extrusion",
      source: "nav-buildings",
      minzoom: 14,
      paint: {
        "fill-extrusion-color": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "height"], 9],
          0,
          "#d8e8ef",
          30,
          "#dfeef3",
          100,
          "#eaf4f7",
        ],
        "fill-extrusion-base": ["coalesce", ["get", "baseHeight"], 0],
        "fill-extrusion-height": ["coalesce", ["get", "height"], 9],
        "fill-extrusion-opacity": 0.42,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    {
      id: "nav-tunnels",
      type: "line",
      source: "nav-tunnels",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#263441",
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 3, 16, 7, 21, 28],
        "line-opacity": 0.52,
        "line-dasharray": [2, 1.3],
      },
    },
    {
      id: "nav-road-shadow",
      type: "fill",
      source: "nav-roads",
      paint: {
        "fill-color": "#15222e",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.08, 17, 0.22],
        "fill-translate": [0, 3],
      },
    },
    {
      id: "nav-roads",
      type: "fill-extrusion",
      source: "nav-roads",
      paint: {
        "fill-extrusion-color": [
          "match",
          ["get", "surfaceRole"],
          "bus",
          "#a94f57",
          "cycle",
          "#35a774",
          "pedestrian",
          "#dfe5e8",
          [
            "match",
            ["get", "roadClass"],
            "motorway",
            "#2f3f52",
            "trunk",
            "#354659",
            "primary",
            "#3a4a5d",
            "secondary",
            "#425164",
            "residential",
            "#4d5a6b",
            "#465465",
          ],
        ],
        "fill-extrusion-base": 0,
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0.08, 18, 0.18],
        "fill-extrusion-opacity": 1,
        "fill-extrusion-vertical-gradient": false,
      },
    },
    {
      id: "nav-sidewalks",
      type: "fill-extrusion",
      source: "nav-sidewalks",
      minzoom: 15,
      paint: {
        "fill-extrusion-color": "#e2e8e9",
        "fill-extrusion-base": 0.08,
        "fill-extrusion-height": 0.24,
        "fill-extrusion-opacity": 1,
      },
    },
    {
      id: "nav-medians",
      type: "fill-extrusion",
      source: "nav-medians",
      minzoom: 14.5,
      paint: {
        "fill-extrusion-color": [
          "match",
          ["get", "medianType"],
          "garden",
          "#94ca8d",
          "water",
          "#8fcfe5",
          "#d3dadd",
        ],
        "fill-extrusion-base": 0.1,
        "fill-extrusion-height": [
          "match",
          ["get", "medianType"],
          "garden",
          0.42,
          "water",
          0.12,
          0.28,
        ],
        "fill-extrusion-opacity": 0.98,
      },
    },
    {
      id: "nav-bridge-shadow",
      type: "fill",
      source: "nav-bridges",
      paint: { "fill-color": "#142230", "fill-opacity": 0.38, "fill-translate": [0, 9] },
    },
    {
      id: "nav-bridges",
      type: "fill-extrusion",
      source: "nav-bridges",
      paint: {
        "fill-extrusion-color": "#465568",
        "fill-extrusion-base": ["coalesce", ["get", "baseHeight"], 5],
        "fill-extrusion-height": ["coalesce", ["get", "deckHeight"], 5.72],
        "fill-extrusion-opacity": 1,
      },
    },
    {
      id: "nav-footbridges",
      type: "fill-extrusion",
      source: "nav-footbridges",
      paint: {
        "fill-extrusion-color": "#aeb8c0",
        "fill-extrusion-base": ["coalesce", ["get", "baseHeight"], 5],
        "fill-extrusion-height": ["coalesce", ["get", "deckHeight"], 5.4],
        "fill-extrusion-opacity": 0.98,
      },
    },
    {
      id: "nav-markings",
      type: "line",
      source: "nav-markings",
      minzoom: 15.5,
      layout: { "line-cap": "butt", "line-join": "round" },
      paint: {
        "line-color": ["match", ["get", "color"], "yellow", "#f3c84b", "#ffffff"],
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          15.5,
          ["case", ["==", ["get", "markingType"], "crossing"], 1.2, 0.6],
          19,
          ["case", ["==", ["get", "markingType"], "crossing"], 4.2, 1.4],
          22,
          ["case", ["==", ["get", "markingType"], "crossing"], 7, 3],
        ],
        "line-dasharray": [
          "case",
          ["==", ["get", "pattern"], "dashed"],
          ["literal", [3, 4]],
          ["literal", [1, 0]],
        ],
        "line-opacity": 0.97,
      },
    },
    {
      id: "nav-route-shadow",
      type: "line",
      source: "nav-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#075466",
        "line-offset": ["interpolate", ["linear"], ["zoom"], 14, 1, 18, 8, 21, 22],
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 8, 18, 22, 21, 38],
        "line-opacity": 0.72,
        "line-blur": 2,
        "line-translate": [0, 4],
      },
    },
    {
      id: "nav-active-route",
      type: "line",
      source: "nav-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "match",
          ["get", "traffic"],
          "heavy",
          "#e25454",
          "medium",
          "#e4a13f",
          "#18b98c",
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 5, 18, 16, 21, 30],
        "line-offset": ["interpolate", ["linear"], ["zoom"], 14, 1, 18, 8, 21, 22],
        "line-opacity": 0.97,
      },
    },
    {
      id: "nav-traveled",
      type: "line",
      source: "nav-traveled",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#8fa3ad",
        "line-offset": ["interpolate", ["linear"], ["zoom"], 14, 1, 18, 8, 21, 22],
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 3, 21, 20],
        "line-opacity": 0.58,
      },
    },
    {
      id: "nav-point-symbols",
      type: "circle",
      source: "nav-symbols",
      minzoom: 15,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 3, 20, 7],
        "circle-color": [
          "match",
          ["get", "kind"],
          "traffic-signal",
          "#17202a",
          "cctv",
          "#0a8eaa",
          "etle",
          "#d54149",
          "speed-camera",
          "#d54149",
          "crossing",
          "#ffffff",
          "bus-stop",
          "#bf4f56",
          "hydrant",
          "#d83743",
          "#758691",
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    },
  ];
}

/** Installs only the custom navigation sources and layers on the current style. */
export function installNavigationLayers(map: MapLibreMap): void {
  for (const sourceId of SOURCE_IDS) ensureSource(map, sourceId);
  for (const layer of layerSpecifications()) addLayer(map, layer);
}

function setSourceData(
  map: MapLibreMap,
  sourceId: string,
  data: GeoJSON.FeatureCollection | GeoJSON.Feature,
): void {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  source?.setData(data);
}

export function setScene(map: MapLibreMap, scene: SceneCollections): void {
  setSourceData(map, "nav-roads", scene.roads);
  setSourceData(map, "nav-sidewalks", scene.sidewalks);
  setSourceData(map, "nav-medians", scene.medians);
  setSourceData(map, "nav-bridges", scene.bridges);
  setSourceData(map, "nav-footbridges", scene.footbridges);
  setSourceData(map, "nav-tunnels", scene.tunnels);
  setSourceData(map, "nav-markings", scene.markings);
  setSourceData(map, "nav-waterways", scene.waterways);
  setSourceData(map, "nav-greens", scene.greens);
  setSourceData(map, "nav-buildings", scene.buildings);
  setSourceData(map, "nav-symbols", scene.pointSymbols);
}

export function setRoute(map: MapLibreMap, route: NavigationRoute): void {
  setSourceData(map, "nav-route", route.geometry);
}

export function setTraveledRoute(map: MapLibreMap, coordinates: LngLat[]): void {
  setSourceData(
    map,
    "nav-traveled",
    coordinates.length >= 2
      ? {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates },
        }
      : EMPTY_COLLECTION,
  );
}

/**
 * Stateful facade used by the navigation controller. It survives a delayed style
 * load and reapplies the most recent scene, route, and traveled path afterwards.
 */
export class NavigationLayers {
  private readonly map: MapLibreMap;
  private installed = false;
  private waitingForStyle = false;
  private scene: SceneCollections | null = null;
  private route: NavigationRoute | null = null;
  private traveled: LngLat[] = [];

  constructor(map: MapLibreMap) {
    this.map = map;
  }

  private readonly handleStyleLoad = (): void => {
    this.waitingForStyle = false;
    this.installNow();
  };

  private installNow(): void {
    if (!this.map.isStyleLoaded()) {
      this.install();
      return;
    }
    installNavigationLayers(this.map);
    this.installed = true;
    if (this.scene) setScene(this.map, this.scene);
    if (this.route) setRoute(this.map, this.route);
    setTraveledRoute(this.map, this.traveled);
  }

  install(): void {
    if (this.map.isStyleLoaded()) {
      this.installNow();
      return;
    }
    if (!this.waitingForStyle) {
      this.waitingForStyle = true;
      this.map.once("style.load", this.handleStyleLoad);
    }
  }

  setScene(scene: SceneCollections): void {
    this.scene = scene;
    if (!this.installed || !this.map.getSource("nav-roads")) this.install();
    else setScene(this.map, scene);
  }

  setRoute(route: NavigationRoute): void {
    this.route = route;
    if (!this.installed || !this.map.getSource("nav-route")) this.install();
    else setRoute(this.map, route);
  }

  setTraveledRoute(coordinates: LngLat[]): void {
    this.traveled = coordinates.slice();
    if (!this.installed || !this.map.getSource("nav-traveled")) this.install();
    else setTraveledRoute(this.map, this.traveled);
  }

  clear(): void {
    this.scene = null;
    this.route = null;
    this.traveled = [];
    if (!this.map.getSource("nav-roads")) return;
    for (const sourceId of SOURCE_IDS) setSourceData(this.map, sourceId, EMPTY_COLLECTION);
  }

  destroy(): void {
    if (this.waitingForStyle) {
      this.map.off("style.load", this.handleStyleLoad);
      this.waitingForStyle = false;
    }
    if (this.map.getStyle()) {
      for (const layerId of [...LAYER_IDS].reverse()) {
        if (this.map.getLayer(layerId)) this.map.removeLayer(layerId);
      }
      for (const sourceId of [...SOURCE_IDS].reverse()) {
        if (this.map.getSource(sourceId)) this.map.removeSource(sourceId);
      }
    }
    this.installed = false;
    this.scene = null;
    this.route = null;
    this.traveled = [];
  }
}
