from .mult_image_nodes import MultiImageLoader

NODE_CLASS_MAPPINGS = {
    "MultiImageLoader": MultiImageLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MultiImageLoader": "Multi Image Loader 🖼️",
}

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
