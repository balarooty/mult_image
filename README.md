# ComfyUI Multi Image Loader & Qwen 10-Scene Story Generator

A robust setup for generating 10-scene sequential visual stories with **strict character consistency** using Qwen-VL architecture in ComfyUI. 

This repository contains:
1. **Multi Image Loader**: A custom ComfyUI node allowing role-based image assignments (Character, Background, Object).
2. **Qwen 10-Scene Story Workflow**: A fully optimized `workflow/qwen_multi_image.json` designed for zero character drift across multiple scenes.

Instead of IP-Adapters, this workflow taps into Qwen's *native* multi-image referencing capabilities (`image1`, `image2`, `image3`) for vastly superior character consistency.

---

## 🌟 Features

### Role-Based Image Routing
The custom `MultiImageLoader` node allows you to upload multiple reference images and assign them specific roles via a dropdown menu directly on the thumbnail:
*   🟡 **Main Character** (Outputs to Port 0)
*   🟢 **Background** (Outputs to Port 1)
*   🟠 **Object / Prop** (Outputs to Port 2)

*Note: Only one image can be the main character. Assigning a new image to "Main Character" will automatically demote the previous one.*

### Zero Character Drift Architecture
In traditional 10-scene generation chaining, standard practice is to feed Scene N's output into Scene N+1's input. Over 10 scenes, the character's face heavily distorts (generational drift). 

This workflow fixes this by providing the **Original Character Reference** to all 10 scenes simultaneously, while passing Scene N's output as the "Background/Context" to Scene N+1. This ensures perfect environmental continuity *without* sacrificing character identity.

### Smart Prompts & Conditioning
The workflow scenes are perfectly wired to leverage the Qwen LVLM properly. Every scene prompt automatically incorporates:
- `"same character as image 1"`
- `"use image 2 as the background and environment"`
- `"use image 3 as the object and prop"`

It also applies a heavy, curated negative prompt to guarantee high-quality generation, avoiding mutants and poor anatomy.

---

## 🛠️ Installation

1. Open your terminal and navigate to your ComfyUI custom nodes directory:
   ```bash
   cd /path/to/ComfyUI/custom_nodes/
   ```
2. Clone this repository:
   ```bash
   git clone https://github.com/balarooty/mult_image.git
   ```
3. Restart ComfyUI.

---

## 📖 How to Use

### 1. Load the Workflow
In ComfyUI, click **Load** and select `workflow/qwen_multi_image.json` from this repository.

### 2. Upload Reference Images
- Locate the **Multi Image Loader 🖼️** node.
- Click `choose file to upload` and add your reference photos (Character, Background, Objects).
- Set the roles via the dropdown on the top right of each thumbnail. 

### 3. Edit Your Story Scenes
- Locate the 10 green text nodes labeled `[EDIT] Scene X Prompt`.
- You will see the prompt starts with the image conditioning prefixes. Leave those prefixes intact!
- Type your individual scene descriptions at the end of the text. E.g.: `Scene 1: The character stands at the edge of a vast ancient forest...`

### 4. Adjust Prompt Mode (Optional)
The Multi Image Loader outputs an automatic `prompt_prefix` you can use instead of hardcoded text. 
- **minimal:** Just mentions image 1, 2, and 3.
- **detailed:** Adds strong enforcement text.
- **off:** Sends the images but disables text references.
- **custom:** Uses what you type in the `custom_prefix` field.

### 5. Generate!
Hit **Queue Prompt**. ComfyUI will share the VAE/CLIP/UNET loading and sequentially generate all 10 scenes perfectly sized at 2048x1152 (16:9 cinematic aspect ratio).

---

## 🎥 Turning the Story into a Video
All 10 scenes are saved to your ComfyUI output directory labeled sequentially (`Story_Scene_01_00001.png`, etc). You can easily stitch them together using `ffmpeg`:

```bash
ffmpeg -framerate 1 -i Story_Scene_%02d_00001.png -c:v libx264 -pix_fmt yuv420p story_video.mp4
```
