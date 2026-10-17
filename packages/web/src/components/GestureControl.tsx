import { useThree } from "@react-three/fiber";
import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useStore } from "../store";

type Status = "boot" | "tracking" | "no-hand" | "error";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const PINCH_DIST = 0.06;
const DOLLY_STEP = 0.08;
const ORBIT_GAIN = 0.04;
const POINT_COOLDOWN_MS = 600;

function pinchDistance(lm: NormalizedLandmark[]): number {
  return Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y, lm[4].z - lm[8].z);
}

function indexExtendedMiddleCurled(lm: NormalizedLandmark[]): boolean {
  const d = (a: NormalizedLandmark, b: NormalizedLandmark) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const wrist = lm[0];
  const indexExtended = d(lm[8], wrist) > d(lm[6], wrist) * 1.15;
  const middleCurled = d(lm[12], wrist) < d(lm[10], wrist);
  return indexExtended && middleCurled;
}

export default function GestureControl() {
  const { camera, scene } = useThree();

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let landmarker: HandLandmarker | null = null;
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;
    let lastPointAt = 0;

    const stopCamera = () => {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };

    async function boot() {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1,
      });
      if (cancelled) return;

      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
      if (cancelled) {
        stopCamera();
        return;
      }

      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.srcObject = stream;
      await video.play();
      if (cancelled) return;

      tick();
    }

    const raycaster = new THREE.Raycaster();

    function tick() {
      if (cancelled || !landmarker || !video) return;
      raf = requestAnimationFrame(tick);

      let result;
      try {
        if (video.readyState < 2) return;
        result = landmarker.detectForVideo(video, performance.now());
      } catch (err) {
        console.warn("[gesture] detection frame failed", err);
        return;
      }

      const lm = result.landmarks?.[0];
      if (!lm) return;

      // PINCH: dolly forward
      if (pinchDistance(lm) < PINCH_DIST) {
        const dir = camera.getWorldDirection(new THREE.Vector3());
        camera.position.addScaledVector(dir, DOLLY_STEP);
      }

      // WRIST X: orbit
      const theta = Math.atan2(camera.position.x, camera.position.z);
      const radius = Math.hypot(camera.position.x, camera.position.z);
      const newTheta = theta + (0.5 - lm[0].x) * ORBIT_GAIN;
      camera.position.x = Math.sin(newTheta) * radius;
      camera.position.z = Math.cos(newTheta) * radius;
      camera.lookAt(0, 0, 0);

      // POINT: raycast
      if (indexExtendedMiddleCurled(lm) && performance.now() - lastPointAt > POINT_COOLDOWN_MS) {
        const ndc = new THREE.Vector2(
          (1 - lm[8].x) * 2 - 1,
          -(lm[8].y * 2 - 1),
        );
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster
          .intersectObjects(scene.children, true)
          .find((h) => (h.object.userData as { nodeId?: string }).nodeId);
        const nodeId = hit ? (hit.object.userData as { nodeId?: string }).nodeId : undefined;
        if (nodeId) {
          lastPointAt = performance.now();
          useStore.getState().select(nodeId);
        }
      }
    }

    boot().catch((err) => {
      if (cancelled) return;
      console.warn("[gesture] setup failed", err);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      // Defer cleanup to fix React 19 unmount crash
      setTimeout(() => {
        stopCamera();
        landmarker?.close();
      }, 0);
    };
  }, [camera, scene]);

  return null; // No UI overlay, removing the crash-causing <Html> tag
}