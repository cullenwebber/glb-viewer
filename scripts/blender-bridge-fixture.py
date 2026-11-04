import importlib.util
import json
from pathlib import Path
import sys

import bpy

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("glb_viewer_bridge", root / "blender/glb_viewer_bridge/__init__.py")
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
bridge.register()
directory = Path(sys.argv[sys.argv.index("--") + 1])
settings = bpy.context.scene.glb_viewer_bridge
settings.directory = str(directory)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_cube_add()
cube = bpy.context.object
cube.name = "Bridge Cube"
material = bpy.data.materials.new("Bridge Painted")
material.use_nodes = True
material[bridge.BRIDGE_KEY] = "existing-property"
cube.data.materials.append(material)
nodes = material.node_tree.nodes
links = material.node_tree.links
principled = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
value = nodes.new("ShaderNodeValue")
value.label = "Finish"
value.outputs[0].default_value = 0.25
math = nodes.new("ShaderNodeMath")
math.operation = "ADD"
math.inputs[1].default_value = 0.1
links.new(value.outputs[0], math.inputs[0])
links.new(math.outputs[0], principled.inputs["Roughness"])
image = bpy.data.images.new("Bridge pixels", width=2, height=2, alpha=True)
image.pixels[:] = [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1]
texture = nodes.new("ShaderNodeTexImage")
texture.image = image
texture.interpolation = "Closest"
uv = nodes.new("ShaderNodeTexCoord")
links.new(uv.outputs["UV"], texture.inputs["Vector"])
mapping = nodes.new("ShaderNodeMapping")
mapping.inputs["Scale"].default_value = (2, 2, 2)
vector_math = nodes.new("ShaderNodeVectorMath")
vector_math.operation = "SCALE"
vector_math.inputs["Scale"].default_value = 0.5
links.new(uv.outputs["UV"], mapping.inputs["Vector"])
links.new(mapping.outputs["Vector"], vector_math.inputs[0])
links.new(vector_math.outputs["Vector"], texture.inputs["Vector"])
range_node = nodes.new("ShaderNodeMapRange")
links.new(math.outputs[0], range_node.inputs["Value"])
links.new(range_node.outputs["Result"], principled.inputs["Roughness"])
normal_map = nodes.new("ShaderNodeNormalMap")
normal_map.inputs["Color"].default_value = (0.5, 0.5, 1, 1)
links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])
mix = nodes.new("ShaderNodeMixRGB")
mix.inputs[0].default_value = 0.3
mix.inputs[2].default_value = (0.1, 0.2, 0.4, 1)
links.new(texture.outputs["Color"], mix.inputs[1])
links.new(mix.outputs[0], principled.inputs["Base Color"])
bpy.ops.mesh.primitive_cube_add(location=(3, 0, 0))
unsupported = bpy.data.materials.new("Bridge Procedural")
unsupported.use_nodes = True
bpy.context.object.data.materials.append(unsupported)
noise = unsupported.node_tree.nodes.new("ShaderNodeTexNoise")
surface = next(node for node in unsupported.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
unsupported.node_tree.links.new(noise.outputs["Color"], surface.inputs["Base Color"])
bump = unsupported.node_tree.nodes.new("ShaderNodeBump")
bump.inputs["Distance"].default_value = 0.1
unsupported.node_tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
unsupported.node_tree.links.new(bump.outputs["Normal"], surface.inputs["Normal"])
surface.inputs["Transmission Weight"].default_value = 0.5
surface.inputs["Coat Weight"].default_value = 0.25
bpy.ops.mesh.primitive_cube_add(location=(-3, 0, 0))
fallback = bpy.data.materials.new("Bridge Unsupported")
fallback.use_nodes = True
bpy.context.object.data.materials.append(fallback)
unsupported_noise = fallback.node_tree.nodes.new("ShaderNodeTexNoise")
unsupported_noise.noise_dimensions = "4D"
fallback_surface = next(node for node in fallback.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
fallback.node_tree.links.new(unsupported_noise.outputs["Fac"], fallback_surface.inputs["Roughness"])
bpy.ops.object.camera_add(location=(7, -9, 6))
camera = bpy.context.object
camera.name = "Bridge Camera"
from mathutils import Vector
camera.rotation_euler = (Vector((1.5, 0, 0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.camera = camera
bpy.ops.object.camera_add(location=(0, -8, 3))
bpy.context.object.name = "Bridge Ortho"
bpy.context.object.data.type = "ORTHO"
bpy.context.object.data.ortho_scale = 8
bpy.context.object.rotation_euler = (Vector((1.5, 0, 0)) - bpy.context.object.location).to_track_quat("-Z", "Y").to_euler()
for kind, location in [("POINT", (2, -2, 4)), ("SPOT", (-2, -3, 5)), ("SUN", (0, 0, 5))]:
    bpy.ops.object.light_add(type=kind, location=location)
    bpy.context.object.name = "Bridge " + kind
    bpy.context.object.data.energy = 100 if kind != "SUN" else 2
bpy.ops.object.select_all(action="DESELECT")
cube.select_set(True)
bpy.context.view_layer.objects.active = cube
settings.selected_only = True
selected_before = list(bpy.context.selected_objects)
bridge.export_bridge(bpy.context)
assert list(bpy.context.selected_objects) == selected_before
selected_bytes = (directory / "model.glb").read_bytes()
selected_json = json.loads(selected_bytes[20:20 + int.from_bytes(selected_bytes[12:16], "little")])
assert len(selected_json["cameras"]) == 2
assert len(selected_json["extensions"]["KHR_lights_punctual"]["lights"]) == 3
settings.export_cameras = False
settings.export_lights = False
bridge.export_bridge(bpy.context)
mesh_bytes = (directory / "model.glb").read_bytes()
mesh_json = json.loads(mesh_bytes[20:20 + int.from_bytes(mesh_bytes[12:16], "little")])
assert "cameras" not in mesh_json
assert "KHR_lights_punctual" not in mesh_json.get("extensions", {})
settings.export_cameras = True
settings.export_lights = True
settings.selected_only = False
bridge.export_bridge(bpy.context)
assert material[bridge.BRIDGE_KEY] == "existing-property"
first_id = material[bridge.ID_KEY]
settings.export_on_save = True
bpy.ops.wm.save_as_mainfile(filepath=str(directory / "fixture.blend"))
assert material[bridge.ID_KEY] == first_id
assert material[bridge.BRIDGE_KEY] == "existing-property"
assert not list(directory.glob(".bridge-*.glb"))
(directory / "expected.json").write_text(json.dumps({"id": first_id}))
bridge.unregister()
print("PASS: Blender bridge registration, image serialization, graph export, stable IDs, source preservation, atomic save, and save handler")
