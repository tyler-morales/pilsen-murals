"use client";

import * as THREE from "three";
import type { Mural } from "@/types/mural";

/**
 * When enabling this layer in MuralMap, keep performance in mind:
 * - Viewport culling: add murals to the 3D layer only when near the viewport
 *   (e.g. by distance from center or frustum) to limit meshes and textures.
 * - Textures: reuse where possible; use thumbnails (or a dedicated medium-res
 *   source) for the layer, not full-size images; consider batching/atlasing.
 * - Repaint: avoid triggerRepaint() every frame if Mapbox allows; otherwise
 *   culling and batching keep cost low so one repaint per frame is acceptable.
 */

/** Altitude in meters for mural quads so they sit above ground (building face). */
const MURAL_ALTITUDE_M = 3;

/** Quad size in meters (width, height). Buildings are typically several meters; use a reasonable default. */
const QUAD_WIDTH_M = 8;
const QUAD_HEIGHT_M = 6;

export interface MuralMeshState {
  mesh: THREE.Mesh;
  mural: Mural;
}

/** Minimal Mapbox API needed for the custom layer (avoids full mapbox-gl type from dynamic import). */
interface MapboxMercator {
  MercatorCoordinate: {
    fromLngLat(
      lngLat: { lng: number; lat: number } | [number, number],
      altitude: number
    ): { x: number; y: number; z: number; meterInMercatorCoordinateUnits(): number };
  };
}

interface MapboxMap {
  getCenter(): { lng: number; lat: number };
  getCanvas(): HTMLCanvasElement;
  triggerRepaint(): void;
}

/**
 * Creates a Mapbox custom layer that draws each mural as a textured quad in 3D,
 * positioned at the mural's coordinates and oriented by its bearing (the building face it's on).
 * Uses the same Mercator + meter scale pattern as Mapbox's add-3d-model example.
 */
export function createMuralBuildingLayer(
  murals: Mural[],
  mapboxgl: MapboxMercator
): import("mapbox-gl").CustomLayerInterface {
  const layerId = "mural-building-layer";
  let map: MapboxMap;
  let camera: THREE.Camera;
  let scene: THREE.Scene;
  let renderer: THREE.WebGLRenderer;
  const meshStates: MuralMeshState[] = [];
  let textureLoader: THREE.TextureLoader;

  return {
    id: layerId,
    type: "custom",
    renderingMode: "3d",

    onAdd(mbMap: MapboxMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
      map = mbMap;
      camera = new THREE.Camera();
      scene = new THREE.Scene();
      textureLoader = new THREE.TextureLoader();

      for (const mural of murals) {
        const texture = textureLoader.load(mural.thumbnail ?? mural.imageUrl, undefined, undefined, () => {
          map.triggerRepaint();
        });
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          side: THREE.DoubleSide,
        });
        const geometry = new THREE.PlaneGeometry(QUAD_WIDTH_M, QUAD_HEIGHT_M);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.y = -((mural.bearing ?? 0) * (Math.PI / 180));
        scene.add(mesh);
        meshStates.push({ mesh, mural });
      }

      renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      renderer.autoClear = false;
    },

    render(_glContext: WebGLRenderingContext | WebGL2RenderingContext, matrix: number[]) {
      const center = map.getCenter();
      const origin = mapboxgl.MercatorCoordinate.fromLngLat(
        { lng: center.lng, lat: center.lat },
        0
      );
      const scale = origin.meterInMercatorCoordinateUnits();

      for (const { mesh, mural } of meshStates) {
        const [lng, lat] = mural.coordinates;
        const coord = mapboxgl.MercatorCoordinate.fromLngLat(
          { lng, lat },
          MURAL_ALTITUDE_M
        );
        mesh.position.set(
          (coord.x - origin.x) / scale,
          (coord.y - origin.y) / scale,
          (coord.z - origin.z) / scale
        );
        mesh.rotation.y = -((mural.bearing ?? 0) * (Math.PI / 180));
      }

      const m = new THREE.Matrix4().fromArray(matrix);
      const l = new THREE.Matrix4()
        .makeTranslation(origin.x, origin.y, origin.z)
        .scale(new THREE.Vector3(scale, -scale, scale));
      camera.projectionMatrix = m.multiply(l);
      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },
  };
}
