using UnityEngine;

namespace Needle.Typescript.GeneratedComponents
{
    [AddComponentMenu("Needle Engine/Hand Tracking/Hand Attachment")]
    [HelpURL("https://github.com/needle-engine/facefilter")]
    public class HandAttachment : MonoBehaviour
    {
        public NeedleTrackingManager manager;
        [Tooltip("Optional override. Leave empty to attach this GameObject.")]
        public Transform target;
        public string handedness = "Any";
        public string finger = "ring";
        public int segment = 0;
        [Range(0, 1)] public float position = 0.75f;
        public Vector3 offset;
        public bool handOcclusion = false;
        public bool autoFit = false;
        [Range(0.8f, 1.2f), Tooltip("Multiplier of the measured fit. 1 fits the finger; lower is tighter, higher is looser.")]
        public float fitFactor = 1;
        [Min(0), Tooltip("Opening radius in metres at the model's authored scale. Zero measures it automatically.")]
        public float innerRadius = 0;
        [Range(0, 0.01f)] public float halfWidth = 0.002f;
        [Range(0, 0.002f)] public float clearance = 0.0005f;
        [Range(0, 0.5f), Tooltip("Rotation smoothing in seconds. Zero disables smoothing.")]
        public float rotationSmoothing = 0.12f;
    }
}
