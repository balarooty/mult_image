from .mult_image_nodes import MultiImageLoader, ImageRoleSelector

NODE_CLASS_MAPPINGS = {
    "MultiImageLoader": MultiImageLoader,
    "ImageRoleSelector": ImageRoleSelector
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MultiImageLoader": "Multi Image Loader 🖼️",
    "ImageRoleSelector": "Image Role Selector 🎯"
}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
