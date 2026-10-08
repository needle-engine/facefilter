// NEEDLE_CODEGEN_START
// auto generated code - do not edit directly

#pragma warning disable

namespace Needle.Typescript.GeneratedComponents
{
	[UnityEngine.AddComponentMenu("Needle Engine/Hand Tracking/Hand Mesh Tracking")]
	public partial class HandTrackingBehaviour : UnityEngine.MonoBehaviour
	{
		public string @handedness = "Right";
		[UnityEngine.Range(0.1f, 2f), UnityEngine.Tooltip("Pad-to-back thickness multiplier. 1 is the original thickness. Does not move tracked joints.")]
		public float meshThickness = 1f;
		public bool useDefaultModel = true;
		public string defaultModelMode = "occlusion";
		public void awake(){}
		public void onUpdateHandTracking(object @hand, object @res, float @index, float @baseDepth){}
	}
}

// NEEDLE_CODEGEN_END
