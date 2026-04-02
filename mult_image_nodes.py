import os
import torch
from PIL import Image, ImageOps
import numpy as np
import folder_paths

class MultiImageLoader:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "uploaded_images": ("STRING", {"default": "", "multiline": True}),
            }
        }
    
    RETURN_TYPES = ("IMAGE_LIST",)
    RETURN_NAMES = ("images",)
    FUNCTION = "load_images"
    CATEGORY = "Custom/MultiImage"

    def load_images(self, uploaded_images):
        # uploaded_images is a comma-separated string of filenames that were uploaded via UI
        files = [f.strip() for f in uploaded_images.split(',') if f.strip()]
        
        output_images = []
        input_dir = folder_paths.get_input_directory()
        
        for file in files:
            image_path = folder_paths.get_annotated_filepath(file)
            if not os.path.exists(image_path):
                image_path = os.path.join(input_dir, file)
            
            if os.path.exists(image_path):
                i = Image.open(image_path)
                i = ImageOps.exif_transpose(i)
                image = i.convert("RGB")
                image = np.array(image).astype(np.float32) / 255.0
                image = torch.from_numpy(image)[None,]
                output_images.append(image)
        
        return (output_images,)

class ImageRoleSelector:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE_LIST",),
            },
            "hidden": {
                "output_roles": ("STRING", {"default": ""}),
            }
        }

    RETURN_TYPES = tuple()
    FUNCTION = "select_roles"
    CATEGORY = "Custom/MultiImage"

    def select_roles(self, images, output_roles="", **kwargs):
        outputs = []
        if not output_roles: return tuple()
        roles = output_roles.split(",")
        
        for role in roles:
            assigned_img = None
            for i, img in enumerate(images):
                w_name = f"role_img_{i+1}"
                if kwargs.get(w_name) == role:
                    assigned_img = img
                    break
            
            if assigned_img is None:
                if len(images) > 0:
                    assigned_img = images[0]
                else:
                    assigned_img = torch.zeros((1, 512, 512, 3))
            outputs.append(assigned_img)
            
        return tuple(outputs)
