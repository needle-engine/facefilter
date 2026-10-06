import { Vector3 } from "three";

/** Build a finger-local frame with a consistent side as the finger curls. */
export function buildFingerBasis(forward: Vector3, palmSide: Vector3, palmFacing: Vector3, referenceForward: Vector3, right: Vector3, up: Vector3): boolean {
    // Choose the palm-facing side near the finger base. Comparing at the tip
    // can flip the orientation when the finger curls beyond 90 degrees.
    const reverseSide = up.crossVectors(referenceForward, palmSide).dot(palmFacing) < 0;
    right.copy(palmSide).addScaledVector(forward, -palmSide.dot(forward));
    const hasStableSide = right.lengthSq() >= 1e-8;
    if (!hasStableSide) right.crossVectors(palmFacing, forward);
    if (right.lengthSq() < 1e-8) {
        right.set(1, 0, 0).addScaledVector(forward, -forward.x);
        if (right.lengthSq() < 1e-8) right.set(0, 1, 0).addScaledVector(forward, -forward.y);
    }
    if (right.lengthSq() < 1e-8) return false;
    right.normalize();
    if (hasStableSide && reverseSide) right.negate();
    up.crossVectors(forward, right).normalize();
    return true;
}