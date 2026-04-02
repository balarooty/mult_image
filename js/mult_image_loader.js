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
                
                // Keep track of loaded images for drawing on canvas
                this.imgs = [];

                // Hide the raw string input
                const filesWidget = this.widgets.find(w => w.name === "uploaded_images");
                if (filesWidget) {
                    filesWidget.type = "hidden";
                    filesWidget.computeSize = () => [0,-4]; // Hide it gracefully
                }
                
                // Add "Upload Images" button
                this.addWidget("button", "Upload Images", null, () => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.multiple = true;
                    input.accept = "image/jpeg,image/png,image/webp";
                    input.onchange = async (e) => {
                        const files = e.target.files;
                        if (!files.length) return;
                        
                        let uploadedNames = [];
                        for (let file of files) {
                            const body = new FormData();
                            body.append("image", file);
                            const resp = await api.fetchApi("/upload/image", {
                                method: "POST",
                                body: body,
                            });
                            const data = await resp.json();
                            uploadedNames.push(data.name);
                        }
                        
                        // Set the hidden widget
                        if (filesWidget) {
                            filesWidget.value = uploadedNames.join(",");
                        }
                        
                        this.reloadCanvasImages();
                        this.notifyOutputs();
                    };
                    input.click();
                });
                
                // Load initial images if the node was just loaded from a workflow
                setTimeout(() => {
                    this.reloadCanvasImages();
                    // Don't violently notify outputs on load, 
                    // allow graph to build first
                    setTimeout(() => { this.notifyOutputs() }, 500);
                }, 100);
                
                return r;
            };

            nodeType.prototype.reloadCanvasImages = function() {
                const filesWidget = this.widgets?.find(w => w.name === "uploaded_images");
                if (!filesWidget || (!filesWidget.value && filesWidget.value !== "")) return;
                
                this.imgs = [];
                const names = filesWidget.value.split(",").filter(n => n.trim() !== "");
                for(let name of names) {
                    const img = new Image();
                    img.src = `/view?filename=${encodeURIComponent(name)}&type=input`;
                    this.imgs.push(img);
                }
                this.setDirtyCanvas(true);
            };

            nodeType.prototype.notifyOutputs = function() {
                if (this.outputs && this.outputs.length && this.outputs[0].links) {
                    for (let linkId of this.outputs[0].links) {
                        const link = app.graph.links[linkId];
                        if (link) {
                            const targetNode = app.graph.getNodeById(link.target_id);
                            if (targetNode && targetNode.type === "ImageRoleSelector") {
                                targetNode.updateWidgetsFromParent();
                            }
                        }
                    }
                }
            };

            const onDrawBackground = nodeType.prototype.onDrawBackground;
            nodeType.prototype.onDrawBackground = function (ctx) {
                if (onDrawBackground) onDrawBackground.apply(this, arguments);
                if (!this.imgs || !this.imgs.length) return;
                
                const padding = 10;
                const top_offset = 50; 
                const cols = 2;
                const rows = Math.ceil(this.imgs.length / cols);
                const w = (this.size[0] - padding * (cols + 1)) / cols;
                const h = 80;
                
                let i = 0;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (i >= this.imgs.length) break;
                        const img = this.imgs[i];
                        if (img.complete) {
                            const x = padding + c * (w + padding);
                            const y = top_offset + r * (h + padding);
                            ctx.drawImage(img, x, y, w, h);
                            
                            // Draw label
                            ctx.fillStyle = "rgba(0,0,0,0.6)";
                            ctx.fillRect(x, y, w, 20);
                            ctx.fillStyle = "white";
                            ctx.font = "12px Arial";
                            ctx.fillText(`Img ${i+1}`, x+5, y+14);
                        }
                        i++;
                    }
                }
                
                // Adjust node size to fit images
                const expectedHeight = top_offset + rows * (h + padding) + 20;
                if (this.size[1] < expectedHeight) {
                    this.size[1] = expectedHeight;
                }
            };
        }
        
        // --- IMAGE ROLE SELECTOR (NODE 2) ---
        if (nodeData.name === "ImageRoleSelector") {
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info) {
                if (onConnectionsChange) onConnectionsChange.apply(this, arguments);
                
                // If INPUT connection changes (we connect or disconnect from MultiImageLoader)
                if (type === LiteGraph.INPUT && index === 0) {
                    if (connected) {
                        this.updateWidgetsFromParent();
                    } else {
                        this.syncRoleWidgets(0); // cleared
                    }
                }
            };
            
            nodeType.prototype.updateWidgetsFromParent = function() {
                const parentNode = this.getInputNode(0);
                let imgCount = 0;
                if (parentNode && parentNode.widgets) {
                    const filesWidget = parentNode.widgets.find(w => w.name === "uploaded_images");
                    if (filesWidget && filesWidget.value) {
                         imgCount = filesWidget.value.split(",").filter(v => v.trim() !== "").length;
                    }
                }
                
                this.syncRoleWidgets(imgCount);
            };

            nodeType.prototype.syncRoleWidgets = function(count) {
                // Clear existing dynamic widgets for roles
                const keepWidgets = [];
                for(let w of this.widgets || []) {
                    if (!w.name.startsWith("role_img_")) {
                        keepWidgets.push(w);
                    }
                }
                this.widgets = keepWidgets;
                
                // Standard roles you requested
                const roles = ["None", "Character Reference", "Background", "Object", "Additional Character 1", "Additional Character 2"];
                
                // We add exactly one widget per image
                for(let i=0; i<count; i++) {
                    const wName = `role_img_${i+1}`;
                    // Default behavior: 1st image = Character Reference. The rest are None.
                    const defaultValue = (i === 0) ? "Character Reference" : "None";
                    
                    this.addWidget("combo", wName, defaultValue, (v) => {
                        this.updateOutputs();
                    }, { values: roles });
                }
                
                // Set the correct height
                this.size[1] = this.computeSize()[1];
                this.updateOutputs();
            };

            nodeType.prototype.updateOutputs = function() {
                // Determine what active roles we have across all widgets
                const activeRoles = [];
                for(let w of this.widgets || []) {
                    if (w.name.startsWith("role_img_") && w.value !== "None") {
                         if (!activeRoles.includes(w.value)) activeRoles.push(w.value);
                    }
                }
                
                // Set the hidden output_roles widget so Python knows what we want
                let hiddenWidget = this.widgets.find(w => w.name === "output_roles");
                if (hiddenWidget) {
                    hiddenWidget.value = activeRoles.join(",");
                }
                
                // Remove outputs that are no longer active
                for(let i=(this.outputs?this.outputs.length-1:-1); i>=0; i--) {
                    if (!activeRoles.includes(this.outputs[i].name)) {
                        this.removeOutput(i);
                    }
                }
                
                // Add new outputs in order
                for(let role of activeRoles) {
                    if (!this.outputs || !this.outputs.find(o => o.name === role)) {
                        this.addOutput(role, "IMAGE");
                    }
                }
                
                // Update node size immediately so wires don't detach visually
                this.size[1] = this.computeSize()[1];
            }
        }
    }
});
