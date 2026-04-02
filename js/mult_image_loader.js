import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "mult_image.Loader",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        
        // --- MULTI IMAGE LOADER (NODE 1) ---
        if (nodeData.name === "MultiImageLoader") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                // Hide the raw string input completely
                const filesWidget = this.widgets.find(w => w.name === "uploaded_images");
                if (filesWidget) {
                    filesWidget.type = "hidden";
                    if (filesWidget.element) filesWidget.element.style.display = "none";
                    filesWidget.computeSize = () => [0,0];
                }

                // Create HTML Container for DOM Widget
                const container = document.createElement("div");
                container.style.cssText = `
                    width: 100%;
                    background: #222222;
                    border: 1px solid #353545;
                    border-radius: 4px;
                    margin-top: 5px;
                    padding: 10px;
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    pointer-events: auto;
                    overflow: hidden;
                `;

                // Top Bar with Buttons
                const topBar = document.createElement("div");
                topBar.style.cssText = "display: flex; justify-content: flex-start; align-items: center; width: 100%; gap: 8px;";

                const uploadBtn = document.createElement("button");
                uploadBtn.innerText = "Upload Images";
                uploadBtn.style.cssText = `
                    background: #3a3f4b; color: white; border: 1px solid #5a5f6b;
                    padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;
                `;

                const removeAllBtn = document.createElement("button");
                removeAllBtn.innerText = "Clear All";
                removeAllBtn.style.cssText = `
                    background: #cc2222; color: white; border: 1px solid #aa1111;
                    padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;
                `;
                removeAllBtn.onclick = () => {
                    if (filesWidget) { filesWidget.value = ""; }
                    this.reloadGallery();
                    this.notifyOutputs();
                };

                topBar.appendChild(uploadBtn);
                topBar.appendChild(removeAllBtn);
                container.appendChild(topBar);

                // Grid Container
                const grid = document.createElement("div");
                grid.style.cssText = `
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(75px, 1fr));
                    grid-auto-rows: 75px;
                    gap: 8px;
                    width: 100%;
                `;
                container.appendChild(grid);
                this.galleryGrid = grid;

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
                    
                    let uploadedNames = [];
                    for (let file of files) {
                        const body = new FormData();
                        body.append("image", file);
                        const resp = await api.fetchApi("/upload/image", { method: "POST", body });
                        const data = await resp.json();
                        uploadedNames.push(data.name);
                    }
                    
                    if (filesWidget) {
                        const current = (filesWidget.value || "").trim();
                        const allPaths = current ? current.split(',').concat(uploadedNames) : uploadedNames;
                        filesWidget.value = allPaths.join(",");
                    }
                    
                    this.reloadGallery();
                    this.notifyOutputs();
                };

                // Add DOM widget
                const galleryWidget = this.addDOMWidget("Gallery", "html_gallery", container, { serialize: false });
                galleryWidget.computeSize = () => [0, 0];
                
                // Track layout changes
                const resizeObserver = new ResizeObserver(() => {
                    const minNodeHeight = (this.computeSize? this.computeSize()[1] : 100) + container.offsetHeight + 15;
                    this.size[1] = Math.max(this.size[1], minNodeHeight);
                });
                resizeObserver.observe(container);

                this.reloadGallery = function() {
                    this.galleryGrid.innerHTML = "";
                    if (!filesWidget || (!filesWidget.value && filesWidget.value !== "")) return;
                    
                    const names = filesWidget.value.split(",").filter(n => n.trim() !== "");
                    
                    names.forEach((name, idx) => {
                        const item = document.createElement("div");
                        item.style.cssText = `
                            position: relative; width: 100%; height: 100%;
                            background: #000; border-radius: 4px; border: 1px solid #444;
                            overflow: hidden; display: flex; align-items: center; justify-content: center;
                        `;

                        const img = document.createElement("img");
                        img.src = `/api/view?filename=${encodeURIComponent(name)}&type=input`;
                        img.style.cssText = "max-width: 100%; max-height: 100%; object-fit: contain;";
                        
                        // Badge
                        const badge = document.createElement("div");
                        badge.style.cssText = `
                            position: absolute; bottom: 0; left: 0;
                            background: rgba(0,0,0,0.7); color: white;
                            padding: 2px 5px; font-size: 10px;
                            border-top-right-radius: 4px; z-index: 5;
                        `;
                        badge.innerText = `${idx + 1}`;
                        
                        // Delete Button
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
                            const newNames = names.filter((_, i) => i !== idx);
                            if (filesWidget) { filesWidget.value = newNames.join(","); }
                            this.reloadGallery();
                            this.notifyOutputs();
                        };
                        del.onmouseenter = () => { del.style.background = "#f33"; };
                        del.onmouseleave = () => { del.style.background = "#c22"; };

                        item.appendChild(img);
                        item.appendChild(badge);
                        item.appendChild(del);
                        this.galleryGrid.appendChild(item);
                    });

                    // Trigger resize logic slightly later
                    setTimeout(() => {
                        const minH = (this.computeSize? this.computeSize()[1] : 100) + this.galleryGrid.parentElement.offsetHeight + 15;
                        this.setSize([Math.max(this.size[0], 240), Math.max(this.size[1], minH)]);
                        app.graph.setDirtyCanvas(true, true);
                    }, 50);
                };

                this.notifyOutputs = function() {
                    // No dynamic output management needed for static Python node
                };

                // Clear previous custom draw
                nodeType.prototype.onDrawBackground = function() {};
                
                setTimeout(() => {
                    this.reloadGallery();
                    this.notifyOutputs();
                }, 200);

                if (filesWidget) {
                    const oldCallback = filesWidget.callback;
                    filesWidget.callback = (v) => {
                        if (oldCallback) oldCallback.apply(filesWidget, [v]);
                        if (this.reloadGallery) this.reloadGallery();
                    };
                }

                return r;
            };
        }
        
        // --- IMAGE ROLE SELECTOR DELETED (NOW STATIC IN PYTHON) ---
    }
});
