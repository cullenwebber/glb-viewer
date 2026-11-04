bl_info = {
    "name": "GLB Viewer Bridge",
    "author": "GLB Viewer",
    "version": (0, 1, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > GLB Viewer",
    "description": "Send a self-contained GLB with supported material graphs to GLB Viewer",
    "category": "Import-Export",
}

import base64
import json
import os
from pathlib import Path
import tempfile
import uuid

import bpy
from bpy.app.handlers import persistent
from bpy.props import BoolProperty, PointerProperty, StringProperty

BRIDGE_KEY = "glb_viewer_material"
ID_KEY = "glb_viewer_id"


def stable_id(datablock):
    if not datablock.get(ID_KEY):
        datablock[ID_KEY] = str(uuid.uuid4())
    return str(datablock[ID_KEY])


def output_socket(node, socket):
    if node.type == "MAPPING":
        return "vector"
    if node.type == "VECT_MATH":
        return "value" if socket.name == "Value" else "vector"
    if node.type == "MAP_RANGE":
        return "value"
    if node.type in {"BUMP", "NORMAL_MAP"}:
        return "normal"
    if node.type == "VALUE":
        return "value"
    if node.type in {"RGB", "MIX_RGB"}:
        return "color"
    if node.type == "MATH":
        return "value"
    if node.type == "BSDF_PRINCIPLED":
        return "shader"
    if node.type == "TEX_IMAGE":
        return "alpha" if socket.name == "Alpha" else "color"
    if node.type in {"TEX_NOISE", "TEX_VORONOI", "TEX_CHECKER", "TEX_WAVE"}:
        return "color" if socket.name == "Color" else "factor"
    if node.type == "TEX_COORD" and socket.name == "UV":
        return "uv"
    if node.type == "TEX_COORD" and socket.name == "Window":
        return "window"
    if node.type == "VALTORGB":
        return "alpha" if socket.name == "Alpha" else "color"
    if node.type == "REROUTE":
        return "value"
    return socket.name


def socket_value(socket, node_ids):
    if socket.is_linked:
        link = socket.links[0]
        return {"link": {"node": node_ids[link.from_node.name],
                         "socket": output_socket(link.from_node, link.from_socket)}}
    value = getattr(socket, "default_value", 0)
    if not isinstance(value, (int, float)):
        value = list(value)
    return {"value": value}


def image_data(image):
    if image.source not in {"FILE", "GENERATED"} or image.size[0] == 0:
        raise ValueError("Only loaded, single FILE or GENERATED images are supported")
    if image.colorspace_settings.name == "sRGB":
        color_space = "srgb"
    elif image.colorspace_settings.name in {"Non-Color", "Linear Rec.709", "Linear"}:
        color_space = "linear"
    else:
        raise ValueError("Unsupported image color space: " + image.colorspace_settings.name)
    with tempfile.TemporaryDirectory() as directory:
        pixels = image.pixels[:]
        copy = image.copy()
        try:
            copy.pixels.foreach_set(pixels)
            copy.update()
            filename = os.path.join(directory, "texture.png")
            copy.filepath_raw = filename
            copy.file_format = "PNG"
            copy.save()
            data = Path(filename).read_bytes()
            if len(data) > 24 * 1024 * 1024:
                raise ValueError("Bridge textures must be smaller than 24 MB as PNG")
            return "data:image/png;base64," + base64.b64encode(data).decode("ascii"), color_space
        finally:
            bpy.data.images.remove(copy)


def material_graph(material):
    graph = {"version": 1, "id": stable_id(material), "name": material.name,
             "nodes": [], "output": None}
    if not material.use_nodes or not material.node_tree:
        return graph
    nodes = material.node_tree.nodes
    node_ids = {node.name: str(index) for index, node in enumerate(nodes)}
    images = {}
    for node in nodes:
        entry = {"id": node_ids[node.name], "label": node.label or node.name,
                 "type": "unsupported", "inputs": {}, "errors": [],
                 "position": list(node.location)}
        inputs = entry["inputs"]
        if node.mute:
            entry["errors"].append("Muted nodes need to be unmuted or baked")
        if node.type == "VALUE":
            entry.update(type="value", value=node.outputs[0].default_value)
        elif node.type == "RGB":
            entry.update(type="rgb", value=list(node.outputs[0].default_value))
        elif node.type == "MATH":
            entry.update(type="math", operation=node.operation, clamp=node.use_clamp)
            inputs["a"] = socket_value(node.inputs[0], node_ids)
            inputs["b"] = socket_value(node.inputs[1], node_ids)
        elif node.type == "MAPPING":
            entry.update(type="mapping", operation=node.vector_type)
            for name, blender_name in {"vector": "Vector", "location": "Location", "rotation": "Rotation", "scale": "Scale"}.items():
                if node.inputs.get(blender_name):
                    inputs[name] = socket_value(node.inputs[blender_name], node_ids)
        elif node.type == "VECT_MATH":
            entry.update(type="vectorMath", operation=node.operation)
            inputs["a"] = socket_value(node.inputs[0], node_ids)
            if len(node.inputs) > 1:
                inputs["b"] = socket_value(node.inputs[1], node_ids)
            if node.inputs.get("Scale"):
                inputs["scale"] = socket_value(node.inputs["Scale"], node_ids)
        elif node.type == "MAP_RANGE":
            entry.update(type="mapRange", interpolation=node.interpolation_type, clamp=node.clamp)
            for name, blender_name in {"value": "Value", "fromMin": "From Min", "fromMax": "From Max", "toMin": "To Min", "toMax": "To Max", "steps": "Steps"}.items():
                if node.inputs.get(blender_name):
                    inputs[name] = socket_value(node.inputs[blender_name], node_ids)
            if node.data_type != "FLOAT":
                entry["errors"].append("Vector Map Range is unsupported; use float mode")
        elif node.type == "BUMP":
            entry.update(type="bump", invert=node.invert)
            for name, blender_name in {"height": "Height", "strength": "Strength", "distance": "Distance"}.items():
                inputs[name] = socket_value(node.inputs[blender_name], node_ids)
            if node.inputs["Normal"].is_linked:
                inputs["normal"] = socket_value(node.inputs["Normal"], node_ids)
        elif node.type == "NORMAL_MAP":
            entry["type"] = "normalMap"
            inputs["color"] = socket_value(node.inputs["Color"], node_ids)
            inputs["strength"] = socket_value(node.inputs["Strength"], node_ids)
            if node.space != "TANGENT" or node.uv_map:
                entry["errors"].append("Normal Map supports tangent space with the default UV map only")
        elif node.type == "MIX_RGB":
            entry.update(type="mix", operation=node.blend_type, clamp=node.use_clamp)
            for name, socket in zip(("factor", "a", "b"), node.inputs):
                inputs[name] = socket_value(socket, node_ids)
        elif node.type == "TEX_COORD":
            entry["type"] = "uv"
            if node.from_instancer:
                entry["errors"].append("Instancer texture coordinates are unsupported")
        elif node.type == "VALTORGB":
            ramp = node.color_ramp
            entry.update(type="ramp", interpolation=ramp.interpolation.lower(),
                         stops=[{"position": element.position, "color": list(element.color)} for element in ramp.elements])
            inputs["factor"] = socket_value(node.inputs["Fac"], node_ids)
            if ramp.color_mode != "RGB":
                entry["errors"].append("Color Ramp HSV/HSL modes require baking; use RGB")
        elif node.type == "REROUTE":
            entry["type"] = "reroute"
            inputs["value"] = socket_value(node.inputs[0], node_ids)
        elif node.type == "TEX_IMAGE":
            entry.update(type="image", extension=node.extension.lower(),
                         interpolation=node.interpolation.lower())
            if node.projection != "FLAT":
                entry["errors"].append("Only Flat image projection is supported")
            try:
                if node.image is None:
                    raise ValueError("Image texture has no image")
                if node.image.name not in images:
                    images[node.image.name] = image_data(node.image)
                entry["image"], entry["colorSpace"] = images[node.image.name]
            except Exception as error:
                entry["errors"].append(str(error))
            if node.inputs["Vector"].is_linked:
                inputs["vector"] = socket_value(node.inputs["Vector"], node_ids)
        elif node.type == "TEX_NOISE":
            entry["type"] = "fractal"
            if node.noise_dimensions != "3D" or getattr(node, "noise_type", "FBM") != "FBM":
                entry["errors"].append("Only 3D fBM noise is supported (MaterialX approximation)")
            for name, blender_name in {"scale": "Scale", "detail": "Detail", "roughness": "Roughness", "lacunarity": "Lacunarity"}.items():
                inputs[name] = socket_value(node.inputs[blender_name], node_ids)
            if node.inputs["Vector"].is_linked:
                inputs["vector"] = socket_value(node.inputs["Vector"], node_ids)
            distortion = node.inputs.get("Distortion")
            if distortion and (distortion.is_linked or distortion.default_value != 0):
                entry["errors"].append("Noise distortion requires baking")
        elif node.type == "TEX_CHECKER":
            entry["type"] = "checker"
            inputs["scale"] = socket_value(node.inputs["Scale"], node_ids)
            if node.inputs["Vector"].is_linked:
                inputs["vector"] = socket_value(node.inputs["Vector"], node_ids)
            if node.outputs["Color"].is_linked:
                entry["errors"].append("Checker colors require an explicit Mix Color node; use Fac")
        elif node.type == "BSDF_PRINCIPLED":
            entry["type"] = "principled"
            for name, blender_name in {
                "color": "Base Color", "metalness": "Metallic", "roughness": "Roughness",
                "ior": "IOR", "alpha": "Alpha", "emission": "Emission Color",
                "emissionStrength": "Emission Strength",
                "transmission": "Transmission Weight", "clearcoat": "Coat Weight",
                "clearcoatRoughness": "Coat Roughness", "sheenRoughness": "Sheen Roughness",
                "diffuseRoughness": "Diffuse Roughness", "specularColor": "Specular Tint",
            }.items():
                if node.inputs.get(blender_name):
                    inputs[name] = socket_value(node.inputs[blender_name], node_ids)
            specular = node.inputs.get("Specular IOR Level")
            if specular and not specular.is_linked:
                inputs["specularIntensity"] = {"value": specular.default_value * 2}
            elif specular:
                entry["errors"].append("Linked Specular IOR Level requires baking")
            sheen = node.inputs.get("Sheen Weight")
            tint = node.inputs.get("Sheen Tint")
            if sheen and tint and not sheen.is_linked and not tint.is_linked:
                inputs["sheen"] = {"value": [component * sheen.default_value for component in list(tint.default_value)[:3]]}
            elif sheen and (sheen.is_linked or tint and tint.is_linked):
                entry["errors"].append("Linked sheen weight/tint requires baking")
            if node.inputs["Normal"].is_linked:
                inputs["normal"] = socket_value(node.inputs["Normal"], node_ids)
            for name in ("Coat Normal", "Tangent", "Weight"):
                socket = node.inputs.get(name)
                if socket and (socket.is_linked or name == "Weight" and socket.default_value != 1):
                    entry["errors"].append(name + " needs baking or is unsupported")
            for name, default in {
                "Subsurface Weight": 0, "Anisotropic IOR Level": 0,
                "Thin Film Thickness": 0, "Coat IOR": 1.5,
                "Coat Tint": [1, 1, 1, 1],
            }.items():
                socket = node.inputs.get(name)
                if socket:
                    value = socket.default_value
                    if not isinstance(value, (float, int)):
                        value = list(value)
                    if socket.is_linked or value != default:
                        entry["errors"].append(name + " is not supported in bridge v1")
        elif node.type == "OUTPUT_MATERIAL":
            entry["type"] = "output"
            inputs["surface"] = socket_value(node.inputs["Surface"], node_ids)
            for name in ("Volume", "Displacement"):
                if node.inputs[name].is_linked:
                    entry["errors"].append(name + " is not supported")
            if node.is_active_output and node.target in {"ALL", "EEVEE"}:
                graph["output"] = entry["id"]
        graph["nodes"].append(entry)
    return graph


def export_bridge(context):
    settings = context.scene.glb_viewer_bridge
    if not settings.directory:
        raise ValueError("Choose an output folder first")
    directory = Path(bpy.path.abspath(settings.directory))
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / "model.glb"
    temporary = directory / (".bridge-" + uuid.uuid4().hex + ".glb")
    previous = []
    selection = list(context.selected_objects)
    active = context.view_layer.objects.active
    try:
        objects = list(context.selected_objects if settings.selected_only else context.scene.objects)
        if settings.selected_only and not objects:
            raise ValueError("Select at least one object")
        if settings.selected_only:
            for obj in context.view_layer.objects:
                if (obj.type == "CAMERA" and settings.export_cameras or obj.type == "LIGHT" and settings.export_lights) and obj not in objects:
                    objects.append(obj)
                    obj.select_set(True)
        materials = set()
        for obj in objects:
            if obj.library:
                continue
            stable_id(obj)
            materials.update(slot.material for slot in obj.material_slots if slot.material)
        for material in materials:
            if material.library:
                continue
            previous.append((material, material.get(BRIDGE_KEY)))
            material[BRIDGE_KEY] = json.dumps(material_graph(material), allow_nan=False)
        result = bpy.ops.export_scene.gltf(
            filepath=str(temporary), export_format="GLB", export_extras=True,
            use_selection=settings.selected_only, use_active_scene=True, export_yup=True,
            export_cameras=settings.export_cameras, export_lights=settings.export_lights,
        )
        if "FINISHED" not in result:
            raise RuntimeError("Blender glTF export did not finish")
        os.replace(temporary, target)
        return target
    finally:
        if settings.selected_only:
            for obj in context.selected_objects:
                obj.select_set(False)
            for obj in selection:
                obj.select_set(True)
            context.view_layer.objects.active = active
        temporary.unlink(missing_ok=True)
        for material, value in previous:
            if value is None:
                if BRIDGE_KEY in material:
                    del material[BRIDGE_KEY]
            else:
                material[BRIDGE_KEY] = value


class GLBVIEWER_Settings(bpy.types.PropertyGroup):
    directory: StringProperty(name="Output folder", subtype="DIR_PATH")
    selected_only: BoolProperty(name="Selected objects only", default=False)
    export_cameras: BoolProperty(name="Include scene cameras", default=True)
    export_lights: BoolProperty(name="Include scene lights", default=True)
    export_on_save: BoolProperty(name="Export after saving .blend", default=False)


class GLBVIEWER_OT_send(bpy.types.Operator):
    bl_idname = "glb_viewer.send"
    bl_label = "Send to GLB Viewer"
    bl_description = "Atomically export model.glb; open it in GLB Viewer and enable Watch exports"

    def execute(self, context):
        try:
            target = export_bridge(context)
            if context.scene.glb_viewer_bridge.export_lights and any(obj.type == "LIGHT" and obj.data.type == "AREA" for obj in context.scene.objects):
                self.report({"WARNING"}, "Area lights cannot be exported to glTF; use Point, Spot, or Sun lights")
            self.report({"INFO"}, "Exported " + str(target))
            return {"FINISHED"}
        except Exception as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}


class GLBVIEWER_PT_bridge(bpy.types.Panel):
    bl_label = "GLB Viewer Bridge"
    bl_idname = "GLBVIEWER_PT_bridge"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "GLB Viewer"

    def draw(self, context):
        settings = context.scene.glb_viewer_bridge
        self.layout.prop(settings, "directory")
        self.layout.prop(settings, "selected_only")
        self.layout.prop(settings, "export_cameras")
        self.layout.prop(settings, "export_lights")
        self.layout.label(text="Lights: Point, Spot and Sun (not Area)")
        self.layout.prop(settings, "export_on_save")
        self.layout.operator("glb_viewer.send", icon="EXPORT")
        self.layout.label(text="Open model.glb in GLB Viewer once.")
        self.layout.label(text="Enable Watch exports for live reload.")


@persistent
def on_save(_dummy):
    if bpy.context.scene and bpy.context.scene.glb_viewer_bridge.export_on_save:
        try:
            export_bridge(bpy.context)
        except Exception as error:
            print("GLB Viewer Bridge:", error)


classes = (GLBVIEWER_Settings, GLBVIEWER_OT_send, GLBVIEWER_PT_bridge)


def register():
    for cls in classes:
        bpy.utils.register_class(cls)
    bpy.types.Scene.glb_viewer_bridge = PointerProperty(type=GLBVIEWER_Settings)
    bpy.app.handlers.save_post.append(on_save)


def unregister():
    if on_save in bpy.app.handlers.save_post:
        bpy.app.handlers.save_post.remove(on_save)
    del bpy.types.Scene.glb_viewer_bridge
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)
