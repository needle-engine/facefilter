#if UNITY_EDITOR
using System.Collections.Generic;
using UnityEditor;
using UnityEngine;

namespace Needle.Typescript.GeneratedComponents
{
    internal static class HandInspectorUI
    {
        internal static void Choice(SerializedObject obj, string property, string label, string[] values, string[] labels = null)
        {
            var prop = obj.FindProperty(property);
            var index = System.Array.IndexOf(values, prop.stringValue);
            var mixed = EditorGUI.showMixedValue;
            EditorGUI.showMixedValue = prop.hasMultipleDifferentValues;
            EditorGUI.BeginChangeCheck();
            var next = EditorGUILayout.Popup(label, Mathf.Max(0, index), labels ?? values);
            if (EditorGUI.EndChangeCheck()) prop.stringValue = values[next];
            EditorGUI.showMixedValue = mixed;
        }
        internal static void Field(SerializedObject obj, string name, string label = null)
        {
            EditorGUILayout.PropertyField(obj.FindProperty(name), new GUIContent(label ?? ObjectNames.NicifyVariableName(name)), true);
        }
        internal static void ManagerHelp(NeedleTrackingManager manager)
        {
            if (!manager) manager = Object.FindObjectOfType<NeedleTrackingManager>();
            if (!manager) EditorGUILayout.HelpBox("Add a Tracking Manager to the scene and set Max Hands to 1 or 2.", MessageType.Warning);
            else if (manager.maxHands <= 0) EditorGUILayout.HelpBox("Hand tracking is disabled. Set Max Hands on the Tracking Manager to 1 or 2.", MessageType.Warning);
        }
        internal static bool IsHierarchySelected(Transform root)
        {
            foreach (var selected in Selection.transforms)
                if (selected == root || selected.IsChildOf(root)) return true;
            return false;
        }
        internal static Transform Bone(HandTrackingBehaviour hand, string name)
        {
            foreach (var mesh in hand.GetComponentsInChildren<SkinnedMeshRenderer>(true))
                foreach (var bone in mesh.bones)
                    if (bone && bone.name == name) return bone;
            return null;
        }
    }

    internal static class HandModelPreview
    {
        internal static GameObject Model(string hand)
        {
            // Same opposite anatomical mesh selection as the mirrored browser view.
            var guid = hand == "Left" ? "966e40566da34a2ea3b5ac548270cd81" : "3a99d8d9a76d46ebb35ca381deb99cd2";
            return AssetDatabase.LoadAssetAtPath<GameObject>(AssetDatabase.GUIDToAssetPath(guid));
        }
        internal static Transform Bone(GameObject model, string name)
        {
            foreach (var bone in model.GetComponentsInChildren<Transform>(true)) if (bone.name == name) return bone;
            return null;
        }
        // Match FingerPose.buildFingerBasis, using the imported GLB joint positions.
        // UnityGLTF reflects X, so the cross-product normal changes sign on import.
        internal static bool AttachmentRotation(GameObject model, string hand, string finger, bool palm, string coordinateSpace, Vector3 forward, out Quaternion rotation)
        {
            rotation = Quaternion.identity;
            var wrist = Bone(model, "wrist");
            var names = new[] { "index", "middle", "ring", "pinky" };
            var knuckles = new Transform[4];
            for (var i = 0; i < 4; i++) {
                knuckles[i] = Bone(model, names[i] + "-finger-phalanx-proximal");
                if (!knuckles[i]) return false;
            }
            if (!wrist || forward.sqrMagnitude < 1e-8f) return false;
            var normal = Vector3.zero;
            for (var i = 0; i < 3; i++)
                normal += Vector3.Cross(knuckles[i].position - wrist.position, knuckles[i + 1].position - wrist.position);
            // Any/Both currently preview the Right tracking handle (left anatomical GLB).
            if (hand == "Left") normal = -normal;
            var palmForward = (knuckles[1].position - wrist.position).normalized;
            var reference = forward.normalized;
            if (!palm) {
                var prefix = finger == "thumb" ? "thumb" : finger + "-finger";
                var a = Bone(model, prefix + (finger == "thumb" ? "-metacarpal" : "-phalanx-proximal"));
                var b = Bone(model, prefix + (finger == "thumb" ? "-phalanx-proximal" : "-phalanx-intermediate"));
                if (!a || !b) return false;
                reference = (b.position - a.position).normalized;
            }
            var up = Vector3.ProjectOnPlane(normal, palmForward).normalized;
            if (up.sqrMagnitude < 1e-8f || reference.sqrMagnitude < 1e-8f) return false;
            var right = Vector3.Cross(up, palmForward).normalized;
            var bend = Vector3.Dot(palmForward, reference) < -1 + 1e-6f
                ? Quaternion.AngleAxis(180, right) : Quaternion.FromToRotation(palmForward, reference);
            right = bend * right; up = bend * up;
            forward.Normalize();
            bend = Vector3.Dot(reference, forward) < -1 + 1e-6f
                ? Quaternion.AngleAxis(180, right) : Quaternion.FromToRotation(reference, forward);
            // Unity authoring +Y points outward from the back of the hand.
            // attachToHand applies the same convention to the tracking anchor.
            rotation = Quaternion.LookRotation(forward, (coordinateSpace == "finger-pad" ? 1 : -1) * (bend * up));
            return true;
        }
        internal static void Draw(string hand, Matrix4x4 placement, float opacity = 1)
        {
            var model = Model(hand); if (!model) return;
            var oldMatrix = Gizmos.matrix; var oldColor = Gizmos.color;
            foreach (var renderer in model.GetComponentsInChildren<SkinnedMeshRenderer>(true))
            {
                if (!renderer.sharedMesh) continue;
                Gizmos.matrix = placement * renderer.transform.localToWorldMatrix;
                Gizmos.color = new Color(0.5f, 0.7f, 0.8f, 0.5f * opacity);
                Gizmos.DrawMesh(renderer.sharedMesh);
                Gizmos.color = new Color(0.5f, 0.7f, 0.8f, 0.05f * opacity);
                Gizmos.DrawWireMesh(renderer.sharedMesh);
            }
            Gizmos.matrix = oldMatrix; Gizmos.color = oldColor;
        }
    }

    [CustomEditor(typeof(HandTrackingBehaviour)), CanEditMultipleObjects]
    internal class HandTrackingInspector : Editor
    {
        public override void OnInspectorGUI()
        {
            serializedObject.Update();
            EditorGUILayout.LabelField("Tracked Hand Mesh", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox("Tracks a hand mesh from the camera. Uses your WebXR-named skinned mesh when present, otherwise loads the packaged hand model automatically. Occlusion hides objects behind the hand; Visible and Wireframe help you inspect it. Live tracking runs in the browser.", MessageType.Info);
            HandInspectorUI.Choice(serializedObject, "handedness", "Hand", new[] { "Left", "Right" });
            HandInspectorUI.Field(serializedObject, "meshThickness", "Mesh Thickness");
            HandInspectorUI.Field(serializedObject, "useDefaultModel", "Use Built-in Hand if Empty");
            HandInspectorUI.Choice(serializedObject, "defaultModelMode", "Built-in Model Display", new[] { "occlusion", "visible", "wireframe" }, new[] { "Occlusion", "Visible", "Wireframe" });
            serializedObject.ApplyModifiedProperties();
            var hand = (HandTrackingBehaviour)target;
            if (hand.GetComponentsInChildren<SkinnedMeshRenderer>(true).Length == 0)
                EditorGUILayout.HelpBox(hand.useDefaultModel ? "The packaged hand model will load automatically. The Scene gizmo previews this model." : "No skinned hand mesh found. Enable the built-in hand or add a WebXR-named skinned mesh.", hand.useDefaultModel ? MessageType.Info : MessageType.Warning);
            else if (!HandInspectorUI.Bone(hand, "wrist"))
                EditorGUILayout.HelpBox("The mesh has no bone named wrist. Hand tracking needs the WebXR hand bone names.", MessageType.Warning);
            HandInspectorUI.ManagerHelp(null);
            EditorGUILayout.HelpBox("Select this object with Scene Gizmos enabled to inspect the authored hand bones. Camera tracking is visible after exporting to the browser.", MessageType.None);
        }
        [DrawGizmo(GizmoType.Selected | GizmoType.NonSelected)]
        private static void DrawHand(HandTrackingBehaviour hand, GizmoType type)
        {
            var selected = HandInspectorUI.IsHierarchySelected(hand.transform);
            // The attachment preview already draws this reference hand at the selected finger.
            if (hand.GetComponent<HandAttachment>()) return;
            if (hand.GetComponentsInChildren<SkinnedMeshRenderer>(true).Length == 0 && hand.useDefaultModel)
                HandModelPreview.Draw(hand.handedness, Matrix4x4.TRS(hand.transform.position, hand.transform.rotation, Vector3.one), selected ? 1 : 0.2f);
            var old = Gizmos.color;
            Gizmos.color = new Color(0, 1, 1, selected ? 1 : 0.2f);
            foreach (var mesh in hand.GetComponentsInChildren<SkinnedMeshRenderer>(true))
            {
                var bones = new HashSet<Transform>(mesh.bones);
                foreach (var bone in mesh.bones)
                {
                    if (!bone) continue;
                    if (bone.parent && bones.Contains(bone.parent)) Gizmos.DrawLine(bone.parent.position, bone.position);
                    Gizmos.DrawWireSphere(bone.position, HandleUtility.GetHandleSize(bone.position) * 0.006f);
                    if (selected && (bone.name == "wrist" || bone.name.EndsWith("tip"))) Handles.Label(bone.position, bone.name);
                }
            }
            Gizmos.color = old;
        }
    }

    [CustomEditor(typeof(HandAttachment)), CanEditMultipleObjects]
    internal class HandAttachmentInspector : Editor
    {
        private bool _advanced;
        private bool _fitAdvanced;
        private void Millimetres(string name, string label, float min, float max)
        {
            var prop = serializedObject.FindProperty(name);
            var mixed = EditorGUI.showMixedValue;
            EditorGUI.showMixedValue = prop.hasMultipleDifferentValues;
            EditorGUI.BeginChangeCheck();
            var value = EditorGUILayout.Slider(label + " (mm)", prop.floatValue * 1000, min, max);
            if (EditorGUI.EndChangeCheck()) prop.floatValue = Mathf.Clamp(value, min, max) / 1000;
            EditorGUI.showMixedValue = mixed;
        }
        public override void OnInspectorGUI()
        {
            serializedObject.Update();
            EditorGUILayout.LabelField("Attach an Object to a Finger", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox("Attaches this GameObject to the selected finger. Finds the scene Tracking Manager automatically. The object hides when tracking is lost and returns when tracking recovers. Use its rotation and scale to fit the hand preview. Live tracking runs in the browser; enable Max Hands on the manager.", MessageType.Info);

            HandInspectorUI.Choice(serializedObject, "handedness", "Hand", new[] { "Left", "Right", "Any", "Both" });
            HandInspectorUI.Choice(serializedObject, "finger", "Placement", new[] { "wrist", "palm", "thumb", "index", "middle", "ring", "pinky" }, new[] { "Wrist / Base", "Palm", "Thumb", "Index", "Middle", "Ring", "Pinky" });
            var placement = serializedObject.FindProperty("finger").stringValue;
            var mixedPlacement = serializedObject.FindProperty("finger").hasMultipleDifferentValues;
            var isFinger = !mixedPlacement && placement != "wrist" && placement != "palm";
            if (mixedPlacement) EditorGUILayout.HelpBox("Selected attachments use different placements. Select matching placements to edit segment and autofit settings together.", MessageType.None);
            if (isFinger) {
                var segment = serializedObject.FindProperty("segment");
                EditorGUI.showMixedValue = segment.hasMultipleDifferentValues;
                EditorGUI.BeginChangeCheck();
                var nextSegment = EditorGUILayout.Popup("Finger Segment", segment.intValue, new[] { "Base", "Middle", "Tip" });
                if (EditorGUI.EndChangeCheck()) segment.intValue = nextSegment;
                EditorGUI.showMixedValue = false;
            }
            if (!mixedPlacement && placement != "wrist") HandInspectorUI.Field(serializedObject, "position", placement == "palm" ? "Wrist to Middle Knuckle" : "Position Along Segment");
            var selectedHand = serializedObject.FindProperty("handedness").stringValue;
            EditorGUILayout.HelpBox(serializedObject.FindProperty("handedness").hasMultipleDifferentValues ? "Selected attachments use different hands. Changing Hand applies to all selected attachments." : selectedHand == "Any" ? "Follows one available hand. Keeps that hand until it is lost, then switches to the other."
                : selectedHand == "Both" ? "Shows a visual copy on each hand. Set Max Hands to 2 to track both together."
                : "Appears only on the " + selectedHand.ToLowerInvariant() + " hand. Hides while that hand is not tracked.", MessageType.None);
            HandInspectorUI.Field(serializedObject, "rotationSmoothing", "Rotation Smoothing (s)");
            EditorGUILayout.Space();
            HandInspectorUI.Field(serializedObject, "handOcclusion", "Hand Occlusion");
            if (serializedObject.FindProperty("handOcclusion").boolValue)
                EditorGUILayout.HelpBox("Hides parts of this object behind your hand. Hand attachments share one invisible hand mesh. It is removed when no attachment needs it, unless Hand Mesh Tracking is also enabled.", MessageType.None);
            if (isFinger) HandInspectorUI.Field(serializedObject, "autoFit", "Autofit Ring to Hand Mesh");
            if (isFinger && !serializedObject.FindProperty("autoFit").hasMultipleDifferentValues && serializedObject.FindProperty("autoFit").boolValue)
            {
                EditorGUILayout.HelpBox("Measures the ring opening and fits it to your finger. Fit Factor: 1 = measured fit, below 1 = tighter, above 1 = looser. Enable Hand Occlusion or add Hand Mesh Tracking. Align the opening with local Z.", MessageType.Info);
                HandInspectorUI.Field(serializedObject, "fitFactor", "Fit Factor");
                _fitAdvanced = EditorGUILayout.Foldout(_fitAdvanced, "Advanced Fit Measurements", true);
                if (_fitAdvanced) {
                    var radius = serializedObject.FindProperty("innerRadius");
                    var automatic = radius.floatValue <= 0;
                    EditorGUI.showMixedValue = radius.hasMultipleDifferentValues;
                    EditorGUI.BeginChangeCheck();
                    var nextAutomatic = EditorGUILayout.Toggle("Measure Opening Automatically", automatic);
                    if (EditorGUI.EndChangeCheck()) radius.floatValue = nextAutomatic ? 0 : 0.01f;
                    EditorGUI.showMixedValue = false;
                    if (!nextAutomatic) Millimetres("innerRadius", "Opening Radius", 0.1f, 50);
                    Millimetres("halfWidth", "Band Half Width", 0, 10);
                    Millimetres("clearance", "Surface Clearance", 0, 2);
                    EditorGUILayout.HelpBox("Opening radius is measured at the model's initial scale. Half width samples the finger along the band. Clearance adds a small gap before applying Fit Factor.", MessageType.None);
                }
            }
            _advanced = EditorGUILayout.Foldout(_advanced, "Optional Overrides", true);
            if (_advanced) {
                HandInspectorUI.Choice(serializedObject, "coordinateSpace", "Coordinate Space", new[] { "hand-back", "finger-pad" }, new[] { "Hand Back (+Y outward)", "Finger Pad (+Y toward pad)" });
                HandInspectorUI.Field(serializedObject, "offset", "Tracking Offset (m)");
                EditorGUILayout.HelpBox("For visual placement, attach a parent object and position the model as its child. Tracking Offset shifts the attachment in its tracking frame.", MessageType.None);
                HandInspectorUI.Field(serializedObject, "manager", "Manager Override");
                HandInspectorUI.Field(serializedObject, "target", "Target Override");
            }
            serializedObject.ApplyModifiedProperties();
            var attachment = (HandAttachment)target;
            if (attachment.target && attachment.target != attachment.transform && attachment.transform.IsChildOf(attachment.target)) EditorGUILayout.HelpBox("Target cannot be an ancestor of this component.", MessageType.Error);
            HandInspectorUI.ManagerHelp(attachment.manager);
            var manager = attachment.manager ? attachment.manager : Object.FindObjectOfType<NeedleTrackingManager>();
            if (manager && System.Array.IndexOf(manager.filters, attachment.transform) >= 0)
                EditorGUILayout.HelpBox("Remove this object from the manager's face Filters list. Hand attachments work independently and must not be face filters.", MessageType.Warning);
            EditorGUILayout.HelpBox("The hand gizmo previews your selected finger and position using the packaged model. Rotate and scale your object to fit. Blue is along the finger; green is +Y in the selected coordinate space. Autofit is applied in the browser.", MessageType.None);
        }
        [DrawGizmo(GizmoType.Selected | GizmoType.NonSelected)]
        private static void DrawAttachment(HandAttachment attachment, GizmoType type)
        {
            var selected = HandInspectorUI.IsHierarchySelected(attachment.transform) || (attachment.target && HandInspectorUI.IsHierarchySelected(attachment.target));
            var model = HandModelPreview.Model(attachment.handedness);
            if (!model) return;
            var prefix = attachment.finger == "thumb" ? "thumb" : attachment.finger + "-finger";
            var sections = attachment.finger == "thumb" ? new[] { "metacarpal", "phalanx-proximal", "phalanx-distal", "tip" }
                : new[] { "phalanx-proximal", "phalanx-intermediate", "phalanx-distal", "tip" };
            var index = Mathf.Clamp(attachment.segment, 0, 2);
            var isPalm = attachment.finger == "wrist" || attachment.finger == "palm";
            var a = HandModelPreview.Bone(model, isPalm ? "wrist" : prefix + "-" + sections[index]);
            var b = HandModelPreview.Bone(model, isPalm ? "middle-finger-phalanx-proximal" : prefix + "-" + sections[index + 1]);
            if (!a || !b) return;
            var start = a.position; var end = b.position;
            var direction = end - start;
            if (direction.sqrMagnitude < 0.000001f) return;
            if (!HandModelPreview.AttachmentRotation(model, attachment.handedness, attachment.finger, isPalm, attachment.coordinateSpace, direction, out var rotation)) return;
            var sample = Vector3.Lerp(start, end, attachment.finger == "wrist" ? 0 : attachment.position) + rotation * attachment.offset;
            var target = attachment.target ? attachment.target : attachment.transform;
            // Exclude the accessory's scale: the reference hand stays life-sized.
            var placement = Matrix4x4.TRS(target.position, target.rotation, Vector3.one) * Matrix4x4.TRS(sample, rotation, Vector3.one).inverse;
            HandModelPreview.Draw(attachment.handedness, placement, selected ? 1 : 0.2f);
            if (!selected) return;
            start = placement.MultiplyPoint3x4(start); end = placement.MultiplyPoint3x4(end);
            var point = target.position; direction = end - start; rotation = target.rotation;
            var old = Handles.color;
            Handles.color = Color.cyan; Handles.DrawLine(start, end);
            var size = HandleUtility.GetHandleSize(point) * 0.12f;
            Handles.color = Color.blue; Handles.ArrowHandleCap(0, point, rotation, size, EventType.Repaint);
            Handles.color = Color.green; Handles.ArrowHandleCap(0, point, Quaternion.LookRotation(rotation * Vector3.up), size, EventType.Repaint);
            Handles.color = Color.red; Handles.ArrowHandleCap(0, point, Quaternion.LookRotation(rotation * Vector3.right), size, EventType.Repaint);
            Handles.color = Color.yellow;
            Handles.DrawWireDisc(point, direction.normalized, attachment.innerRadius > 0 ? attachment.innerRadius : 0.01f);
            Handles.Label(point, attachment.handedness + " " + attachment.finger + " placement preview");
            Handles.color = old;
        }
    }
}
#endif
