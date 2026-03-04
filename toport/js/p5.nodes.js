var testImg=null;
var test=loadImage("../img/car1.jpg", img=>{testImg=img;});

var tempCanvas = document.createElement("canvas");
var tempCtx = tempCanvas.getContext("2d");

function convertP5ImageToImage(p5img, fn) {
    document.body.append(tempCanvas);

    tempCanvas.width = p5img.width;
    tempCanvas.height = p5img.height;

    p5img.loadPixels();
    var spix = p5img.pixels;
    if (spix) {
        console.log( 'read image data p5 '+p5img.width, p5img.height);
        var imgData = tempCtx.getImageData(0, 0, p5img.width, p5img.height);
        for (let i = 0; i < imgData.data.length; i +=4) {
            imgData.data[i] = spix[i];
            imgData.data[i + 1] = spix[i + 1];
            imgData.data[i + 2] = spix[i + 2];
            imgData.data[i + 3] = spix[i + 3];
        }
        tempCtx.putImageData(imgData, 0, 0);
        var theImg = new Image();
        theImg.onload = function () {
            fn(theImg);
        }
        theImg.src = tempCanvas.toDataURL();
    }
}

////////////////////////////////////////////////////////////////////////////////////////////
//
// GRAPH NODES
//
////////////////////////////////////////////////////////////////////////////////////////////
class RastP5 {
    p5;
    pg;
    title = "RastP5 view";
    desc = "RastP5 view";
    w = 256;
    h = 256;

    constructor() {
        let that = this;
        this.pos = [700, 100];
        this.size = [this.w, this.h];
        let sketch = function (p) {
            that.p5 = p;
            p.setup = function () {
                that.setup(p);
            };

            p.draw = function () {
                that.draw(p);
            };
        };

        this.p5 = new p5(sketch, 'container');
    }

    onDrawBackground(ctx) {
        if (this.pg) {
            if( true && testImg ) {
                ctx.drawImage(testImg, 0, 0, this.size[0], this.size[1]);
            }
            convertP5ImageToImage(this.pg, (img) => {
                ctx.drawImage(img, 0, 0, this.size[0], this.size[1]);
            });
        }
    }

    setup(p5) {
        let canvas=p5.createCanvas(this.w, this.h);
        this.pg = p5.createGraphics(this.w, this.h, canvas);
        this.pg.background(0);
        this.pg.fill(255);
        this.p5.strokeWeight(1);
        // this.p5.noLoop();
    }

    draw(p5) {
        if (p5.mouseIsPressed) {
            this.pg.fill(255);
            this.pg.stroke(255);
        } else {
            this.pg.fill(0);
            this.pg.stroke(0);
        }
        this.pg.ellipse(p5.mouseX, p5.mouseY, 15, 15, 10);
        // p5.imageMode(CORNER);
        p5.image(this.pg, 0, 0, this.w, this.h);
    }
}
LiteGraph.registerNodeType("rast/p5", RastP5);


// widgets example 
class RastFrame {
    title = "Widgets sample";
    desc = "Frame viewerew";
    widgets = [
        { name: "slider", text: "slider", type: "slider", value: 0, options: { precision: 0.1, min: 0, max: 100, step: 1 } },
        { name: "number", text: "number", type: "number", value: 0, options: { precision: 1, min: 0, max: 100, step: 1 } },
        { name: "text", text: "text", type: "text", value: 'a' },
        { name: "combo", text: "combo", type: "combo", value: 'a', options: { values: ['a', 'b', 'c'] } },
        { name: "toggle", text: "toggle", type: "toggle", value: true, options: { values: ['a', 'b', 'c'] } },

        { name: "Apply", text: "View Image", type: "button", callback: function () { console.log('click!'); } },
    ];
    options = {

    }
    constructor() {
        this.addInput("", "image,canvas");
        this.size = [200, 300];
        this.properties = {
            level: 5,
            name: 'ciao',
            number: 17
        }
    }
    onDrawBackground(ctx, a, canvas) {
        if (this.frame && !this.flags.collapsed) {
            ctx.drawImage(this.frame, 0, 0, this.size[0], this.size[1]);

        }
    }

    onPropertyChanged(name, value) {
        console.log(name + '=' + value)
        this.properties[name] = value;
        return true;
    }

    onExecute() {
        this.frame = this.getInputData(0);
        this.setDirtyCanvas(true);
    }

    onWidget(e, widget) {
        if (widget.name == "resize" && this.frame) {
            var width = this.frame.width;
            var height = this.frame.height;

            if (!width && this.frame.videoWidth != null) {
                width = this.frame.videoWidth;
                height = this.frame.videoHeight;
            }

            if (width && height) {
                this.size = [width, height];
            }
            this.setDirtyCanvas(true, true);
        } else if (widget.name == "view") {
            this.show();
        }
    }

    show() {
        // var str = this.canvas.toDataURL("image/png");
        if (showElement && this.frame) {
            showElement(this.frame);
        }
    }
}
LiteGraph.registerNodeType("rast/frame", RastFrame);


// a rast image
class RastImage {
    title = "Image";
    desc = "Image loader";
    widgets = [
        { name: "url", text: "Url", type: "text", options: { property: 'url' } },
        { name: "load", text: "Load", type: "button", options: { property: 'url' } }
    ];
    supported_extensions = ["jpg", "jpeg", "png", "gif"];
    properties = {
        url: "https://i.pinimg.com/474x/7f/ab/28/7fab28bc91db456652f624028237f8fd.jpg"
    };
    rast = new Rast();

    constructor() {
        this.addOutput("frame", "image");
    }

    onAdded() {
        if (this.properties["url"] != "" && this.img == null) {
            this.loadImage(this.properties["url"]);
        }
    }

    onDrawBackground(ctx) {
        if (this.flags.collapsed) {
            return;
        }
        if (this.img && this.size[0] > 5 && this.size[1] > 5 && this.img.width) {
            ctx.drawImage(this.img, 0, 0, this.size[0], this.size[1]);
        }
    }

    onExecute() {
        if (!this.img) {
            this.boxcolor = "#000";
        }
        if (this.img && this.img.width) {
            this.setOutputData(0, this.img);
        } else {
            this.setOutputData(0, null);
        }
        if (this.img && this.img.dirty) {
            this.img.dirty = false;
        }
    }

    onPropertyChanged(name, value) {
        this.properties[name] = value;
        if (name == "url" && value != "") {
            this.loadImage(value);
        }

        return true;
    }
    loadImage(url) {
        if (!url || url == "") {
            this.img = null;
            return;
        }
        loadImage(url, img => {
            this.scale = 3;
            this.img = img;
            this.dirty = true;
            this.size[0] = img.width / this.scale;
            this.size[1] = img.height / this.scale; //(img.height / img.width) * this.size[0];
            this.boxcolor = "#9F9";
            this.setDirtyCanvas(true);
        });
    }

    onWidgetChanged(name, value) {
        console.log('widget = ' + widget.name);
        if (widget.name == "load") {
            this.loadImage(this.properties["url"]);
        }
    }

    onDropFile(file) {
        var that = this;
        if (this._url) {
            URL.revokeObjectURL(this._url);
        }
        this._url = URL.createObjectURL(file);
        this.properties.url = this._url;
        this.loadImage(this._url);
    }
}
LiteGraph.registerNodeType("rast/image", RastImage);

//
class RastBlend {
    title = "Rast Blend"
    rastOp = new RastGray();
    constructor() {
        this.addInput("A", "image");
        this.addInput("B", "image");
        this.addOutput("A+B", "image");
        this.properties = { precision: 1 };
    }
    onExecute() {
        var A = this.getInputData(0);
        if (A === undefined)
            A = 0;
        var B = this.getInputData(1);
        if (B === undefined)
            B = 0;
        this.setOutputData(0, A);
    }
}
//register in the system
LiteGraph.registerNodeType("rast/blend", RastBlend);

//
class RastGray {
    title = "RastGray"
    constructor() {
        this.addInput("A", "image");
        this.addOutput("Gray", "image");
        this.properties = { precision: 1 };
    }
    onExecute() {
        var A = this.getInputData(0);
        if (A === undefined)
            A = 0;
        else {

        }
        this.setOutputData(0, A);
    }
}
//register in the system
LiteGraph.registerNodeType("rast/gray", RastGray);




