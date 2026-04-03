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

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "load_images"
    CATEGORY = "Custom/MultiImage"

    def load_images(self, uploaded_images):
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

        if not output_images:
            # Fallback: return a blank 512x512 image if nothing was uploaded
            return (torch.zeros((1, 512, 512, 3)),)

        # Batch all images into a single tensor (standard ComfyUI IMAGE format)
        return (torch.cat(output_images, dim=0),)
