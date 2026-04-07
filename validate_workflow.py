#!/usr/bin/env python3
"""Validate the workflow JSON: check all node connections, custom node outputs, and wiring integrity."""

import json
import sys

def validate():
    with open("workflow/qwen_img_story_10scenes_2k.json") as f:
        data = json.load(f)

    errors = []
    warnings = []
    info = []

    # --- 1. Catalog all nodes ---
    all_node_ids = set(data.keys())
    info.append(f"Total nodes: {len(all_node_ids)}")

    # Categorize nodes
    note_nodes = {k for k, v in data.items() if v.get("class_type") == "Note"}
    functional_nodes = all_node_ids - note_nodes
    info.append(f"Functional nodes: {len(functional_nodes)}, Note nodes: {len(note_nodes)}")

    # --- 2. Define expected output port counts per class_type ---
    output_ports = {
        "MultiImageLoader": 4,       # main_character, background, objects, prompt_prefix
        "UNETLoader": 1,              # model
        "CLIPLoader": 1,              # clip
        "VAELoader": 1,               # vae
        "LoraLoaderModelOnly": 1,     # model
        "ModelSamplingAuraFlow": 1,   # model
        "CFGNorm": 1,                 # model
        "ImageScale": 1,              # image
        "VAEEncodeTiled": 1,          # latent
        "TextEncodeQwenImageEditPlus": 1,  # conditioning
        "KSampler": 1,                # latent
        "VAEDecodeTiled": 1,          # image
        "SaveImage": 0,               # no outputs (terminal node)
        "PrimitiveStringMultiline": 1, # string
        "Note": 0,                    # no outputs (documentation)
    }

    # --- 3. Check every input reference points to an existing node with valid port ---
    for node_id, node_data in data.items():
        class_type = node_data.get("class_type", "Unknown")
        title = node_data.get("_meta", {}).get("title", "untitled")
        inputs = node_data.get("inputs", {})

        for input_name, input_value in inputs.items():
            # Only check list references [node_id, port_index]
            if isinstance(input_value, list) and len(input_value) == 2:
                ref_node_id = str(input_value[0])
                ref_port = input_value[1]

                # Check referenced node exists
                if ref_node_id not in all_node_ids:
                    errors.append(
                        f"BROKEN REF: Node {node_id} ({title}) input '{input_name}' "
                        f"references non-existent node '{ref_node_id}'"
                    )
                    continue

                # Check port index is valid
                ref_class = data[ref_node_id].get("class_type", "Unknown")
                max_ports = output_ports.get(ref_class)
                if max_ports is not None and ref_port >= max_ports:
                    errors.append(
                        f"BAD PORT: Node {node_id} ({title}) input '{input_name}' "
                        f"references port {ref_port} of node '{ref_node_id}' ({ref_class}), "
                        f"but that node only has {max_ports} output(s) (ports 0-{max_ports-1})"
                    )

    # --- 4. Verify MultiImageLoader (node 78) outputs ---
    ml = data.get("78")
    if not ml:
        errors.append("MISSING: MultiImageLoader node (78) not found!")
    else:
        info.append(f"MultiImageLoader (78): class={ml['class_type']}, inputs={list(ml['inputs'].keys())}")
        if ml["class_type"] != "MultiImageLoader":
            errors.append(f"Node 78 should be MultiImageLoader, got {ml['class_type']}")
        if "prompt_mode" not in ml.get("inputs", {}):
            errors.append("Node 78 missing 'prompt_mode' input")

    # --- 5. Verify shared scale nodes ---
    for nid, expected_source, expected_port, label in [
        ("700", "78", 0, "Scale Main Character"),
        ("701", "78", 1, "Scale Background"),
        ("702", "78", 2, "Scale Objects"),
    ]:
        node = data.get(nid)
        if not node:
            errors.append(f"MISSING: {label} node ({nid}) not found!")
        else:
            img_ref = node["inputs"].get("image")
            if img_ref != [expected_source, expected_port]:
                errors.append(
                    f"WRONG WIRING: {label} ({nid}) image input is {img_ref}, "
                    f"expected ['{expected_source}', {expected_port}]"
                )
            else:
                info.append(f"✅ {label} ({nid}): correctly wired to MultiImageLoader port {expected_port}")

    # --- 6. Verify each scene's wiring ---
    scenes = [
        # (scene_num, prompt_id, img_scale_id, vae_enc_id, neg_id, pos_id, sampler_id, vae_dec_id, save_id, prev_vae_dec_id)
        (1,  "435", "433:117", "433:88", "433:110", "433:111", "433:3",  "433:8", "60",  None),
        (2,  "503", "501",     "502",    "504",     "505",     "506",    "507",   "508", "433:8"),
        (3,  "513", "511",     "512",    "514",     "515",     "516",    "517",   "518", "507"),
        (4,  "523", "521",     "522",    "524",     "525",     "526",    "527",   "528", "517"),
        (5,  "533", "531",     "532",    "534",     "535",     "536",    "537",   "538", "527"),
        (6,  "543", "541",     "542",    "544",     "545",     "546",    "547",   "548", "537"),
        (7,  "553", "551",     "552",    "554",     "555",     "556",    "557",   "558", "547"),
        (8,  "563", "561",     "562",    "564",     "565",     "566",    "567",   "568", "557"),
        (9,  "573", "571",     "572",    "574",     "575",     "576",    "577",   "578", "567"),
        (10, "583", "581",     "582",    "584",     "585",     "586",    "587",   "588", "577"),
    ]

    for scene in scenes:
        sn, prompt_id, scale_id, vae_enc_id, neg_id, pos_id, sampler_id, vae_dec_id, save_id, prev_dec_id = scene

        # Check all scene nodes exist
        for nid, label in [
            (prompt_id, f"Scene {sn} Prompt"),
            (scale_id, f"Scene {sn} ImageScale"),
            (vae_enc_id, f"Scene {sn} VAEEncode"),
            (neg_id, f"Scene {sn} Negative"),
            (pos_id, f"Scene {sn} Positive"),
            (sampler_id, f"Scene {sn} KSampler"),
            (vae_dec_id, f"Scene {sn} VAEDecode"),
            (save_id, f"Scene {sn} SaveImage"),
        ]:
            if nid not in data:
                errors.append(f"MISSING: {label} (node {nid}) not found!")

        if pos_id not in data:
            continue

        pos_inputs = data[pos_id]["inputs"]
        neg_inputs = data[neg_id]["inputs"] if neg_id in data else {}

        # Check Positive encoder: image1 should ALWAYS be character (node 700)
        if pos_inputs.get("image1") != ["700", 0]:
            errors.append(
                f"Scene {sn} Positive ({pos_id}): image1 = {pos_inputs.get('image1')}, "
                f"EXPECTED ['700', 0] (character reference)"
            )
        else:
            info.append(f"✅ Scene {sn} Positive: image1 → character (700) ✓")

        # Check Positive encoder: image2
        if sn == 1:
            # Scene 1 should use background (701)
            if pos_inputs.get("image2") != ["701", 0]:
                errors.append(
                    f"Scene 1 Positive ({pos_id}): image2 = {pos_inputs.get('image2')}, "
                    f"EXPECTED ['701', 0] (background reference)"
                )
            else:
                info.append(f"✅ Scene 1 Positive: image2 → background (701) ✓")
        else:
            # Scenes 2-10 should use previous scene's ImageScale output
            expected_img2 = [scale_id, 0]
            if pos_inputs.get("image2") != expected_img2:
                errors.append(
                    f"Scene {sn} Positive ({pos_id}): image2 = {pos_inputs.get('image2')}, "
                    f"EXPECTED {expected_img2} (prev scene continuity)"
                )
            else:
                info.append(f"✅ Scene {sn} Positive: image2 → prev scene ({scale_id}) ✓")

        # Check Positive encoder: image3 should be objects (702)
        if pos_inputs.get("image3") != ["702", 0]:
            errors.append(
                f"Scene {sn} Positive ({pos_id}): image3 = {pos_inputs.get('image3')}, "
                f"EXPECTED ['702', 0] (objects reference)"
            )
        else:
            info.append(f"✅ Scene {sn} Positive: image3 → objects (702) ✓")

        # Check Negative encoder: image1 should be character (700)
        if neg_inputs.get("image1") != ["700", 0]:
            errors.append(
                f"Scene {sn} Negative ({neg_id}): image1 = {neg_inputs.get('image1')}, "
                f"EXPECTED ['700', 0] (character reference)"
            )

        # Check Positive encoder: prompt wired to scene prompt node
        if pos_inputs.get("prompt") != [prompt_id, 0]:
            errors.append(
                f"Scene {sn} Positive ({pos_id}): prompt = {pos_inputs.get('prompt')}, "
                f"EXPECTED ['{prompt_id}', 0]"
            )

        # Check Positive/Negative: clip wired to shared CLIP
        for enc_id, enc_label in [(pos_id, "Positive"), (neg_id, "Negative")]:
            if enc_id in data:
                enc = data[enc_id]["inputs"]
                if enc.get("clip") != ["433:38", 0]:
                    errors.append(f"Scene {sn} {enc_label}: clip not wired to shared CLIP (433:38)")
                if enc.get("vae") != ["433:39", 0]:
                    errors.append(f"Scene {sn} {enc_label}: vae not wired to shared VAE (433:39)")

        # Check KSampler wiring
        if sampler_id in data:
            ks = data[sampler_id]["inputs"]
            if ks.get("model") != ["433:75", 0]:
                errors.append(f"Scene {sn} KSampler: model not wired to CFGNorm (433:75)")
            if ks.get("positive") != [pos_id, 0]:
                errors.append(f"Scene {sn} KSampler: positive not wired to Positive encoder ({pos_id})")
            if ks.get("negative") != [neg_id, 0]:
                errors.append(f"Scene {sn} KSampler: negative not wired to Negative encoder ({neg_id})")
            if ks.get("latent_image") != [vae_enc_id, 0]:
                errors.append(f"Scene {sn} KSampler: latent_image not wired to VAEEncode ({vae_enc_id})")

        # Check ImageScale input (Scene 1 from character, Scenes 2-10 from prev decode)
        if scale_id in data:
            scale_img = data[scale_id]["inputs"].get("image")
            if sn == 1:
                if scale_img != ["700", 0]:
                    errors.append(
                        f"Scene 1 ImageScale ({scale_id}): image = {scale_img}, "
                        f"EXPECTED ['700', 0] (character reference)"
                    )
            else:
                if scale_img != [prev_dec_id, 0]:
                    errors.append(
                        f"Scene {sn} ImageScale ({scale_id}): image = {scale_img}, "
                        f"EXPECTED ['{prev_dec_id}', 0] (prev scene decode output)"
                    )

        # Check SaveImage wired to VAEDecode
        if save_id in data:
            save_imgs = data[save_id]["inputs"].get("images")
            if save_imgs != [vae_dec_id, 0]:
                errors.append(f"Scene {sn} SaveImage: images not wired to VAEDecode ({vae_dec_id})")

    # --- 7. Check model chain ---
    chain_checks = [
        ("433:89", "model", "433:37", 0, "LoRA → UNETLoader"),
        ("433:66", "model", "433:89", 0, "AuraFlow → LoRA"),
        ("433:75", "model", "433:66", 0, "CFGNorm → AuraFlow"),
    ]
    for node_id, input_name, expected_ref, expected_port, label in chain_checks:
        if node_id in data:
            actual = data[node_id]["inputs"].get(input_name)
            if actual != [expected_ref, expected_port]:
                errors.append(f"MODEL CHAIN: {label} broken! {input_name}={actual}, expected [{expected_ref}, {expected_port}]")
            else:
                info.append(f"✅ Model chain: {label} ✓")

    # --- 8. Report ---
    print("\n" + "=" * 60)
    print("  WORKFLOW VALIDATION REPORT")
    print("=" * 60)

    print(f"\n📊 SUMMARY:")
    for i in info:
        print(f"  {i}")

    if errors:
        print(f"\n❌ ERRORS ({len(errors)}):")
        for e in errors:
            print(f"  ❌ {e}")
    else:
        print(f"\n✅ NO ERRORS FOUND — All connections verified!")

    if warnings:
        print(f"\n⚠️  WARNINGS ({len(warnings)}):")
        for w in warnings:
            print(f"  ⚠️  {w}")

    print("\n" + "=" * 60)

    return len(errors) == 0


if __name__ == "__main__":
    ok = validate()
    sys.exit(0 if ok else 1)
