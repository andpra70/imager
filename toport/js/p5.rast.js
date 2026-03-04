

function log(msg) { console.log(msg); }


function myCallback(sliderValue) {
    console.log("New value: " + value)
}

// loadImage(url, fn(img) )
function loadImage(url, callback) {
    if (!url || url == "") {
        img = null;
    }
    let img = document.createElement("img");
    img.src = url;
    var that = this;
    img.onload = function () {
        console.log("Image loaded, size: " + img.width + "x" + img.height);
        if (callback) {
            callback(this);
        }
    };
    img.onerror = function () {
        console.log("error loading the image:" + url);
    }
}
function convertCanvasToImage(canvas, fn) {
    // let canvas = document.getElementById("canvas");
    let image = new Image();
    theimg.onload = function () {
        fn(theimg);
    }
    image.src = canvas.toDataURL();
    return image;
}
function convertImageToP5Image(img) {
    this.w = img.width;
    this.h = img.height;
    this.layer = p5.createGraphics(img.width, img.height);
    this.layer.clear();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    const spix = ctx.getImageData(0, 0, w, h).data;
    this.img = createImage(this.w, this.h);
    const dpix = img.loadPixels();
    for (var y = 0; y < height; y++) {
        for (var x = 0; x < width; x++) {
            var i = (x + y * width) * 4;
            dpix[i] = spix[i];
            dpix[i + 1] = spix[i + 1];
            dpix[i + 2] = spix[i + 2];
            dpix[i + 3] = spix[i + 3];
        }
    }
    this.img.updatePixels();
    this.layer.image(this.img, 0, 0, img.width, img.height);
}
function convertP5ImageToImage(p5img, fn) {
    var tempCanvas = document.createElement("canvas");
    var tempCtx = tempCanvas.getContext("2d");
    tempCanvas.width = p5img.width;
    tempCanvas.height = p5img.height;

    p5img.loadPixels();
    var spix = p5img.pixels;
    if (spix) {
        var imgData = tempCtx.getImageData(0, 0, p5img.width, p5img.height);
        for (let i = 0; i < imgData.data.length; i += 4) {
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


// RASTER
class Rast {
    w = 0;
    h = 0;
    ready = false;
    img = null;
    layer = null;
    pixels = null;

    constructor() {
    }

    load(name, fn) {
        if (name) {
            log('Rast ' + name);
            let img = p5.loadImage(name, ready => {
                this.w = img.width;
                this.h = img.height;
                this.img = img;
                this.layer = createGraphics(img.width, img.height);
                this.layer.clear();
                // this.layer.colorMode(HSB, 360, 100, 100, 100);
                this.layer.rectMode(CENTER);
                this.layer.fill(0);
                this.layer.noStroke();
                this.layer.image(this.img, 0, 0, img.width, img.height);
                this.ready = true;
                this.pixels = this.img.loadPixels();
                if (fn) fn(this);
            });
        }
    }

    create(w, h) {
        this.layer = createGraphics(w, h);
        this.ready = true;
    }

    clone() {
        let ret = new Rast();
        ret.w = this.w;
        ret.h = this.h;
        ret.layer = createGraphics(this.w, this.h);
        ret.ready = true;
        ret.layer.loadPixels();
        ret.layer.updatePixels();
        ret.img = createImage(this.w, this.h);
        ret.layer.image(this.layer, 0, 0, this.w, this.h);
        return ret;
    }

    transform() {
        this.input.img.loadPixels();
        let spix = this.input.pixels;
        let dpix = this.output.pixels;
        for (var y = 0; y < height; y++) {
            for (var x = 0; x < width; x++) {
                var i = (x + y * width) * 4;
                dpix[i + 0] = spix[0];
                dpix[i + 1] = spix[i + 1];
                dpix[i + 2] = spix[i + 2];
                dpix[i + 3] = spix[i + 3];
            }
        }
        this.output.img.updatePixels();
        this.output.layer.image(this.output.img, 0, 0, this.output.img.width, this.output.img.height);
    }
}



// funzione 
class RastOp {
    input;  // raster in
    output; // raster out
    spix = null;
    dpix = null;

    constructor(input) {
        this.input = input;
        this.output = input.clone();
    }

    precompute() {
    }

    loadPixels() {
        this.input.img.loadPixels();
        this.spix = this.input.pixels;
        this.dpix = this.output.pixels;
    }

    updatePixels() {
        this.output.img.updatePixels();
        this.output.layer.image(this.output.img, 0, 0, this.output.img.width, this.output.img.height);
    }

    transform() {
        for (var y = 0; y < height; y++) {
            for (var x = 0; x < width; x++) {
                var i = (x + y * width) * 4;
                dpix[i + 0] = spix[0];
                dpix[i + 1] = spix[i + 1];
                dpix[i + 2] = spix[i + 2];
                dpix[i + 3] = spix[i + 3];
            }
        }
    }
}


// gray
class OpGray extends RastOp {
    luminance = true;

    constructor(input) {
        super(input);
        this.output = input.clone();
    }

    transform() {
        this.loadPixels();
        let spix = this.spix;
        let dpix = this.dpix;
        for (var y = 0; y < height; y++) {
            for (var x = 0; x < width; x++) {
                var i = (x + y * width) * 4;
                if (this.luminance) {
                    var luma = spix[i] * .299 + spix[i + 1] * .587 + spix[i + 2] * .0114;
                    dpix[i + 0] = luma;
                    dpix[i + 1] = luma;
                    dpix[i + 2] = luma;
                    dpix[i + 3] = spix[i + 3];
                } else {
                    let gray = (spix[i] + spix[i + 1] + spix[i + 2]) / 3;
                    dpix[i + 0] = gray;
                    dpix[i + 1] = gray;
                    dpix[i + 2] = gray;
                    dpix[i + 3] = spix[i + 3];

                }
            }
        }
        this.updatePixels();
    }
}

// thresh
class OpHistogram extends RastOp {
    min;
    max;
    delta;

    constructor(input) {
        super(input);
        this.compute();
    }

    compute() {
        let min = 255;
        let max = 0;
        let sum = 0;

        this.input.img.loadPixels();
        let spix = this.input.img.pixels;
        for (var y = 0; y < height; y++) {
            for (var x = 0; x < width; x++) {
                var i = (x + y * width) * 4;
                let gray = (spix[i] + spix[i + 1] + spix[i + 2]) / 3;
                sum += gray;
                if (gray < min) min = gray;
                if (gray > max) max = gray;
            }
        }
        sum = sum / (width * height);
        let dx = max - min;
        this.max = max;
        this.min = min;
        this.delta = dx;
        this.t = (this.max + this.min) / 2;
        console.log("t=" + this.t + " avg=" + sum);
    }

    transform() {
    }
}

// thresh
class OpThreshold extends RastOp {
    t = 122;
    min;
    max;
    delta;

    constructor(input) {
        super(input);
    }

    transform() {
        this.loadPixels();
        let spix = this.spix;
        let dpix = this.dpix;
        for (var y = 0; y < height; y++) {
            for (var x = 0; x < width; x++) {
                var i = (x + y * width) * 4;
                let gray = (spix[i] + spix[i + 1] + spix[i + 2]) / 3;
                if (gray <= this.t) {
                    dpix[i + 0] = 0
                    dpix[i + 1] = 0;
                    dpix[i + 2] = 0;
                    dpix[i + 3] = spix[i + 3];
                } else {
                    dpix[i + 0] = 255;
                    dpix[i + 1] = 255;
                    dpix[i + 2] = 255;
                    dpix[i + 3] = spix[i + 3];
                }
            }
        }
        this.updatePixels();
    }
}


// blur
class OpBlur extends RastOp {
    boxBlur = [[1, 1, 1],
    [1, 1, 1],
    [1, 1, 1]
    ];

    gaussianBlur = [[1, 2, 1],
    [2, 4, 2],
    [1, 2, 1]
    ];

    constructor(input) {
        super(input);
    }

    transform() {
        this.output.img.filter(BLUR, 7);
        /*
        var k1 = this.gaussianBlur;
        this.input.img.loadPixels();
        this.output.img.loadPixels();
        let spix = this.input.img.pixels;
        let dpix = this.output.img.pixels;
        var w = this.input.img.width;
        var h = this.input.img.height;
        for (var x = 0; x < w; x++) {
            for (var y = 0; y < h; y++) {
                var ul = ((x - 1 + w) % w + w * ((y - 1 + h) % h)) * 4; // location of the UPPER LEFT
                var uc = ((x - 0 + w) % w + w * ((y - 1 + h) % h)) * 4; // location of the UPPER CENTER
                var ur = ((x + 1 + w) % w + w * ((y - 1 + h) % h)) * 4; // location of the UPPER RIGHT
                var ml = ((x - 1 + w) % w + w * ((y + 0 + h) % h)) * 4; // location of the LEFT
                var mc = ((x - 0 + w) % w + w * ((y + 0 + h) % h)) * 4; // location of the CENTER PIXEL
                var mr = ((x + 1 + w) % w + w * ((y + 0 + h) % h)) * 4; // location of the RIGHT
                var ll = ((x - 1 + w) % w + w * ((y + 1 + h) % h)) * 4; // location of the LOWER LEFT
                var lc = ((x - 0 + w) % w + w * ((y + 1 + h) % h)) * 4; // location of the LOWER CENTER
                var lr = ((x + 1 + w) % w + w * ((y + 1 + h) % h)) * 4; // location of the LOWER RIGHT

                var p0 = spix[ul] * k1[0][0]; // upper left
                var p1 = spix[uc] * k1[0][1]; // upper mid
                var p2 = spix[ur] * k1[0][2]; // upper right
                var p3 = spix[ml] * k1[1][0]; // left
                var p4 = spix[mc] * k1[1][1]; // center pixel
                var p5 = spix[mr] * k1[1][2]; // right
                var p6 = spix[ll] * k1[2][0]; // lower left
                var p7 = spix[lc] * k1[2][1]; // lower mid
                var p8 = spix[lr] * k1[2][2]; // lower right
                var red = (p0 + p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8) / 9;

                p0 = spix[ul + 1] * k1[0][0]; // upper left
                p1 = spix[uc + 1] * k1[0][1]; // upper mid
                p2 = spix[ur + 1] * k1[0][2]; // upper right
                p3 = spix[ml + 1] * k1[1][0]; // left
                p4 = spix[mc + 1] * k1[1][1]; // center pixel
                p5 = spix[mr + 1] * k1[1][2]; // right
                p6 = spix[ll + 1] * k1[2][0]; // lower left
                p7 = spix[lc + 1] * k1[2][1]; // lower mid
                p8 = spix[lr + 1] * k1[2][2]; // lower right
                var green = (p0 + p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8) / 9;

                p0 = spix[ul + 2] * k1[0][0]; // upper left
                p1 = spix[uc + 2] * k1[0][1]; // upper mid
                p2 = spix[ur + 2] * k1[0][2]; // upper right
                p3 = spix[ml + 2] * k1[1][0]; // left
                p4 = spix[mc + 2] * k1[1][1]; // center pixel
                p5 = spix[mr + 2] * k1[1][2]; // right
                p6 = spix[ll + 2] * k1[2][0]; // lower left
                p7 = spix[lc + 2] * k1[2][1]; // lower mid
                p8 = spix[lr + 2] * k1[2][2]; // lower right
                var blue = (p0 + p1 + p2 + p3 + p4 + p5 + p6 + p7 + p8) / 9;

                dpix[mc] = red;
                dpix[mc + 1] = green;
                dpix[mc + 2] = blue;
                dpix[mc + 3] = spix[lc + 3];
            }
        }
        this.output.img.updatePixels();
        */
        this.output.layer.image(this.output.img, 0, 0, this.output.img.width, this.output.img.height);
    }
}







