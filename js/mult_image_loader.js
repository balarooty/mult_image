import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const ROLE_COLORS = {
    main_character: { border: "#D4A017", bg: "rgba(212, 160, 23, 0.15)", label: "Main Character" },
    background:     { border: "#2E8B57", bg: "rgba(46, 139, 87, 0.15)",  label: "Background" },
    object:         { border: "#E07020", bg: "rgba(224, 112, 32, 0.15)", label: "Object" },
};

const ROLE_OPTIONS = [
    { value: "main_character", label: "Main Character" },
    { value: "background",    label: "Background" },
    { value: "object",        label: "Object" },
];

app.registerExtension({
    name: "mult_image.Loader",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "MultiImageLoader") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

            // --- Hide the raw JSON string widget ---
            const filesWidget = this.widgets.find(w => w.name === "uploaded_images");
            if (filesWidget) {
                filesWidget.type = "hidden";
                if (filesWidget.element) filesWidget.element.style.display = "none";
                filesWidget.computeSize = () => [0, 0];
            }

            // Internal state: array of { name, role }
            this._imageEntries = [];

            // --- Sync entries from widget (for loading saved workflows) ---
            const syncFromWidget = () => {
                if (!filesWidget || !filesWidget.value) {
                    this._imageEntries = [];
                    return;
                }
                const raw = (filesWidget.value || "").trim();
                if (raw.startsWith("[")) {
                    try { this._imageEntries = JSON.parse(raw); } catch { this._imageEntries = []; }
                } else if (raw) {
                    // Legacy comma-separated
                    this._imageEntries = raw.split(",").filter(n => n.trim()).map((n, i) => ({
                        name: n.trim(),
                        role: i === 0 ? "main_character" : "background"
                    }));
                } else {
                    this._imageEntries = [];
                }
            };

            const syncToWidget = () => {
                if (filesWidget) {
                    filesWidget.value = JSON.stringify(this._imageEntries);
                }
            };

            // --- DOM Container ---
            const container = document.createElement("div");
            container.style.cssText = `
                width: 100%; padding: 5px; box-sizing: border-box;
                display: flex; flex-direction: column; gap: 12px;
                pointer-events: auto;
            `;

            // --- Top Bar ---
            const topBar = document.createElement("div");
            topBar.style.cssText = "display: flex; justify-content: space-around; align-items: center; width: 100%; gap: 10px; padding-top: 5px;";

            const uploadBtn = document.createElement("button");
            uploadBtn.innerText = "Upload Images";
            uploadBtn.style.cssText = `
                flex: 1; background: #333; color: #ddd; border: 1px solid #555;
                padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;
            `;

            const removeAllBtn = document.createElement("button");
            removeAllBtn.innerText = "Clear All";
            removeAllBtn.style.cssText = `
                flex: 1; background: #532; color: #fcc; border: 1px solid #744;
                padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 13px;
            `;
            removeAllBtn.onclick = () => {
                this._imageEntries = [];
                syncToWidget();
                this.reloadGallery();
            };

            topBar.appendChild(uploadBtn);
            topBar.appendChild(removeAllBtn);
            container.appendChild(topBar);

            // --- Role Legend ---
            const legend = document.createElement("div");
            legend.style.cssText = "display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; padding: 2px 0;";
            for (const [role, info] of Object.entries(ROLE_COLORS)) {
                const chip = document.createElement("span");
                chip.style.cssText = `
                    display: inline-flex; align-items: center; gap: 4px;
                    font-size: 10px; color: ${info.border}; padding: 2px 6px;
                    border: 1px solid ${info.border}; border-radius: 3px;
                    background: ${info.bg};
                `;
                chip.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${info.border};display:inline-block;"></span>${info.label}`;
                legend.appendChild(chip);
            }
            container.appendChild(legend);

            // --- Thumbnail Grid ---
            const grid = document.createElement("div");
            grid.style.cssText = `
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
                grid-auto-rows: 120px;
                gap: 8px; width: 100%;
            `;
            container.appendChild(grid);
            this.galleryGrid = grid;

            // --- Hidden File Input ---
            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.multiple = true;
            fileInput.accept = "image/jpeg,image/png,image/webp";
            fileInput.style.display = "none";
            container.appendChild(fileInput);

            uploadBtn.onclick = () => fileInput.click();

            fileInput.onchange = async (e) => {
                const files = e.target.files;
                if (!files.length) return;

                for (let file of files) {
                    const body = new FormData();
                    body.append("image", file);
                    const resp = await api.fetchApi("/upload/image", { method: "POST", body });
                    const data = await resp.json();

                    // First image ever → main_character, otherwise background
                    const role = this._imageEntries.length === 0 ? "main_character" : "background";
                    this._imageEntries.push({ name: data.name, role });
                }

                syncToWidget();
                this.reloadGallery();
                fileInput.value = "";
            };

            // --- DOM Widget ---
            const galleryWidget = this.addDOMWidget("Gallery", "html_gallery", container, { serialize: false });
            galleryWidget.computeSize = function (width) {
                return [width, container.offsetHeight + 15];
            };

            const resizeObserver = new ResizeObserver(() => {
                app.graph.setDirtyCanvas(true, true);
            });
            resizeObserver.observe(container);

            // --- Reload Gallery ---
            this.reloadGallery = function () {
                this.galleryGrid.innerHTML = "";
                if (!this._imageEntries || !this._imageEntries.length) return;

                this._imageEntries.forEach((entry, idx) => {
                    const roleInfo = ROLE_COLORS[entry.role] || ROLE_COLORS.background;

                    const item = document.createElement("div");
                    item.style.cssText = `
                        position: relative; width: 100%; height: 100%;
                        background: #111; border-radius: 6px;
                        border: 2px solid ${roleInfo.border};
                        overflow: hidden; display: flex; flex-direction: column;
                        align-items: center; justify-content: flex-start;
                        box-shadow: 0 0 6px ${roleInfo.bg};
                    `;

                    // Thumbnail image
                    const imgWrap = document.createElement("div");
                    imgWrap.style.cssText = "flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden;";
                    const img = document.createElement("img");
                    img.src = `/api/view?filename=${encodeURIComponent(entry.name.trim())}&type=input`;
                    img.style.cssText = "max-width: 100%; max-height: 100%; object-fit: contain;";
                    imgWrap.appendChild(img);
                    item.appendChild(imgWrap);

                    // Role selector dropdown
                    const select = document.createElement("select");
                    select.style.cssText = `
                        width: 100%; background: #222; color: ${roleInfo.border};
                        border: none; border-top: 1px solid #333;
                        padding: 3px 4px; font-size: 10px; cursor: pointer;
                        text-align: center; font-weight: bold;
                        outline: none;
                    `;
                    for (const opt of ROLE_OPTIONS) {
                        const option = document.createElement("option");
                        option.value = opt.value;
                        option.text = opt.label;
                        if (opt.value === entry.role) option.selected = true;
                        select.appendChild(option);
                    }
                    select.onchange = () => {
                        const newRole = select.value;

                        // Enforce: only ONE main_character allowed
                        if (newRole === "main_character") {
                            this._imageEntries.forEach((e, i) => {
                                if (i !== idx && e.role === "main_character") {
                                    e.role = "background";
                                }
                            });
                        }

                        this._imageEntries[idx].role = newRole;
                        syncToWidget();
                        this.reloadGallery();
                    };
                    item.appendChild(select);

                    // Index badge
                    const badge = document.createElement("div");
                    badge.style.cssText = `
                        position: absolute; top: 0; left: 0;
                        background: ${roleInfo.border}; color: #000;
                        padding: 1px 5px; font-size: 10px; font-weight: bold;
                        border-bottom-right-radius: 4px; z-index: 5;
                    `;
                    badge.innerText = `${idx + 1}`;
                    item.appendChild(badge);

                    // Delete button
                    const del = document.createElement("div");
                    del.style.cssText = `
                        position: absolute; top: 0; right: 0;
                        background: #c22; color: white; width: 16px; height: 16px;
                        display: flex; align-items: center; justify-content: center;
                        font-size: 10px; cursor: pointer; z-index: 10;
                        border-bottom-left-radius: 4px; transition: background 0.2s;
                    `;
                    del.innerHTML = "✕";
                    del.onclick = (e) => {
                        e.stopPropagation();
                        this._imageEntries.splice(idx, 1);
                        syncToWidget();
                        this.reloadGallery();
                    };
                    del.onmouseenter = () => { del.style.background = "#f33"; };
                    del.onmouseleave = () => { del.style.background = "#c22"; };
                    item.appendChild(del);

                    this.galleryGrid.appendChild(item);
                });

                setTimeout(() => {
                    const minH = (this.computeSize ? this.computeSize()[1] : 100) + this.galleryGrid.parentElement.offsetHeight + 15;
                    this.setSize([Math.max(this.size[0], 280), Math.max(this.size[1], minH)]);
                    app.graph.setDirtyCanvas(true, true);
                }, 50);
            };

            // Suppress default background drawing
            nodeType.prototype.onDrawBackground = function () {};

            // Initial load from saved state
            syncFromWidget();
            setTimeout(() => this.reloadGallery(), 200);

            // Sync gallery when widget value changes externally (e.g. loading a workflow)
            if (filesWidget) {
                const oldCallback = filesWidget.callback;
                filesWidget.callback = (v) => {
                    if (oldCallback) oldCallback.apply(filesWidget, [v]);
                    syncFromWidget();
                    if (this.reloadGallery) this.reloadGallery();
                };
            }

            return r;
        };
    }
});
