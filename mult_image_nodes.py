import os
import json
import torch
from PIL import Image, ImageOps
import numpy as np
import folder_paths


class MultiImageLoader:
    PROMPT_MODES = ["minimal", "off", "detailed", "custom"]
    ROLES = ["main_character", "background", "object"]

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "uploaded_images": ("STRING", {"default": "[]", "multiline": True}),
                "prompt_mode": (s.PROMPT_MODES, {"default": "minimal"}),
            },
            "optional": {
                "custom_prefix": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "placeholder": "Write your own prefix (used when mode is 'custom')"
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "IMAGE", "STRING")
    RETURN_NAMES = ("main_character", "background", "objects", "prompt_prefix")
    FUNCTION = "load_images"
    CATEGORY = "Custom/MultiImage"

    def _load_single_image(self, filename):
        """Load a single image file and return it as a torch tensor [1, H, W, 3]."""
        input_dir = folder_paths.get_input_directory()
        image_path = folder_paths.get_annotated_filepath(filename)

        if not os.path.exists(image_path):
            image_path = os.path.join(input_dir, filename)

        if not os.path.exists(image_path):
            return None

        i = Image.open(image_path)
        i = ImageOps.exif_transpose(i)
        image = i.convert("RGB")
        image = np.array(image).astype(np.float32) / 255.0
        image = torch.from_numpy(image)[None,]
        return image

    def _build_prompt_prefix(self, prompt_mode, custom_prefix, has_character, has_background, has_objects):
        """Build the prompt prefix string based on mode and available roles."""
        if prompt_mode == "off":
            return ""

        if prompt_mode == "custom":
            return custom_prefix if custom_prefix else ""

        parts = []

        if prompt_mode == "minimal":
            if has_character:
                parts.append("same character as image 1")
            if has_background:
                parts.append("background from image 2")
            if has_objects:
                parts.append("props from image 3")
            if parts:
                return ", ".join(parts) + ". "
            return ""

        if prompt_mode == "detailed":
            if has_character:
                parts.append(
                    "Keep the character from image 1 exactly consistent across all scenes — "
                    "same face, same hair, same outfit, same body proportions."
                )
            if has_background:
                parts.append(
                    "Use image 2 as the background and environment reference. "
                    "Match the lighting, color palette, and atmosphere."
                )
            if has_objects:
                parts.append(
                    "Use image 3 as the object/prop reference. "
                    "Include this item naturally in the scene."
                )
            if parts:
                return " ".join(parts) + " "
            return ""

        return ""

    def load_images(self, uploaded_images, prompt_mode="minimal", custom_prefix=""):
        blank = torch.zeros((1, 512, 512, 3))

        # --- Parse input ---
        # Support both legacy comma-separated format and new JSON format
        entries = []
        raw = uploaded_images.strip()

        if raw.startswith("["):
            # New JSON format
            try:
                entries = json.loads(raw)
            except json.JSONDecodeError:
                entries = []
        elif raw:
            # Legacy comma-separated format — treat all as main_character for backward compat
            names = [n.strip() for n in raw.split(",") if n.strip()]
            for idx, name in enumerate(names):
                role = "main_character" if idx == 0 else "background"
                entries.append({"name": name, "role": role})

        # --- Group images by role ---
        role_images = {
            "main_character": None,
            "background": None,
            "object": None,
        }

        for entry in entries:
            name = entry.get("name", "")
            role = entry.get("role", "background")
            if not name:
                continue

            img = self._load_single_image(name)
            if img is None:
                continue

            # Take the FIRST image for each role (TextEncodeQwenImageEditPlus takes single images)
            if role in role_images and role_images[role] is None:
                role_images[role] = img

        # --- Build outputs ---
        main_character = role_images["main_character"] if role_images["main_character"] is not None else blank
        background = role_images["background"] if role_images["background"] is not None else blank
        objects = role_images["object"] if role_images["object"] is not None else blank

        # --- Build prompt prefix ---
        prompt_prefix = self._build_prompt_prefix(
            prompt_mode,
            custom_prefix,
            has_character=role_images["main_character"] is not None,
            has_background=role_images["background"] is not None,
            has_objects=role_images["object"] is not None,
        )

        return (main_character, background, objects, prompt_prefix)
