using Needle.Facefilter.Scripts;
using UnityEditor;
using UnityEngine;

namespace Needle.Typescript.GeneratedComponents
{
	[AddComponentMenu("Needle Engine/Face Filter/Face Filter Tracking Manager")]
	public partial class NeedleTrackingManager
	{
		public Texture2D customLogo;
		public string downloadName;
		
#if UNITY_EDITOR
		[UnityEditor.CustomEditor(typeof(NeedleTrackingManager))]
		private class Editor : UnityEditor.Editor
		{
			public override void OnInspectorGUI()
			{
				var self = (NeedleTrackingManager) this.target;
				UnityEditor.EditorGUILayout.LabelField("How to Use", UnityEditor.EditorStyles.boldLabel);
				UnityEditor.EditorGUILayout.HelpBox("You can create new prefabs using the button below or by adding the FaceFilter component to a new object. Filters can be part of this scene or inside separate prefabs to speedup loading time (recommended). Click the button below to create a new filter using our template prefab:", UnityEditor.MessageType.None);
				var text = self.filters.Length <= 0 ? "Create Your First Filter" : "Create New Filter";
				if (GUILayout.Button(text, GUILayout.Height(24)))
				{
					Utils.CreateNewFilterAsset(self);
				}
				UnityEditor.EditorGUILayout.HelpBox("Then add your filter to the \"Filters\" list below", UnityEditor.MessageType.None);

				if (self.maxFaces > 1)
				{
					EditorGUILayout.HelpBox("Warning: Face tracking is set to track " + self.maxFaces + " faces - tracking more than one face is currently experimental and less stable. Please set \"Max Faces\" to 1 for production.", MessageType.Warning);
				}

				GUILayout.Space(5);
				base.OnInspectorGUI();
				GUILayout.Space(5);
				
			}
		}
#endif
		
	}
}
