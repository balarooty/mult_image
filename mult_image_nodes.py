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
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("Main Character", "Object", "Background", "2nd Character")
    FUNCTION = "select_roles"
    CATEGORY = "Custom/MultiImage"

    def select_roles(self, images):
        def get_img(idx):
            if len(images) > idx:
                return images[idx]
            elif len(images) > 0:
                # Fallback to first image if not enough provided to prevent runtime missing tensor errors
                return images[0]
            else:
                # Extreme fallback if no images uploaded
                return torch.zeros((1, 512, 512, 3))
                
        return (get_img(0), get_img(1), get_img(2), get_img(3))
