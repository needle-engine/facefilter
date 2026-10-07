import { Quaternion, Vector3 } from "three";

const fingerBend = new Quaternion();

/** Carry the pad-facing orientation from the finger base into the tracked segment. */
export function buildFingerBasis(forward: Vector3, palmSide: Vector3, palmFacing: Vector3, referenceForward: Vector3, right: Vector3, up: Vector3): boolean {
    if (forward.lengthSq() < 1e-8 || referenceForward.lengthSq() < 1e-8) return false;
    // Establish the pad at the base using the palm normal. A cross-palm side
    // projected independently onto each bone can add roll to splayed fingers.
    up.copy(palmFacing).addScaledVector(referenceForward, -palmFacing.dot(referenceForward));
    if (up.lengthSq() < 1e-8) {
        up.crossVectors(referenceForward, palmSide);
        if (up.dot(palmFacing) < 0) up.negate();
    }
    if (up.lengthSq() < 1e-8) return false;
    up.normalize();
    right.crossVectors(up, referenceForward).normalize();

    // Bend the complete frame, retaining the base orientation around the finger.
    // For an exactly folded finger, use its side as the flexion axis.
    if (referenceForward.dot(forward) < -1 + 1e-6)
        fingerBend.setFromAxisAngle(right, Math.PI);
    else
        fingerBend.setFromUnitVectors(referenceForward, forward);
    right.applyQuaternion(fingerBend);
    up.applyQuaternion(fingerBend);
    return true;
}
