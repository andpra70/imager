/* Fast pairwise nearest neighbor based algorithm for multilevel thresholding
Copyright (C) 2004-2019 Mark Tyler and Dmitry Groshev
Copyright (c) 2018-2023 Miller Cy Chan
* error measure; time used is proportional to number of bins squared - WJ */

/* Generalized Hilbert ("gilbert") space-filling curve for rectangular domains of arbitrary (non-power of two) sizes.
Copyright (c) 2022 - 2023 Miller Cy Chan
* A general rectangle with a known orientation is split into three regions ("up", "right", "down"), for which the function calls itself recursively, until a trivial path can be produced. */

(function(){
	function GilbertCurve(opts) {
		this.opts = opts;
		this.qPixels = [];
	}
	
	function gammaToLinear(channel)
	{
		var c = channel / 255.0;
		return c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	}
	
	function Y_Diff(R, G, B, R2, G2, B2)
	{
		function color2Y(R, G, B) {
			var sr = gammaToLinear(R);
			var sg = gammaToLinear(G);
			var sb = gammaToLinear(B);
			return sr * 0.2126 + sg * 0.7152 + sb * 0.0722;
		}

		var y = color2Y(R, G, B);
		var y2 = color2Y(R2, G2, B2);
		return Math.abs(y2 - y) * 100;
	}
		
	function ErrorBox(pixel) {
		var r = (pixel & 0xff),
			g = (pixel >>> 8) & 0xff,
			b = (pixel >>> 16) & 0xff,
			a = (pixel >>> 24) & 0xff;
		this.yDiff = 0;
		this.p = [r, g, b, a];
	}
	
	var ditherFn, getColorIndex, width, height, pixels, palette, saliencies, nMaxColors;
	
	var qPixels;
	var errorq = [];
	var weights = [];
	var lookup;

	var DITHER_MAX = 9, ditherMax, sortedByYDiff, margin, thresold;
	var BLOCK_SIZE = 343.0;
	
	function ditherPixel(x, y)
	{
		var bidx = x + y * width;
		var pixel = pixels[bidx];
		var error = new ErrorBox(pixel);
		var i = sortedByYDiff ? weights.length - 1 : 0;
		var maxErr = DITHER_MAX - 1;
		for(var c = 0; c < errorq.length; ++c) {
			var eb = errorq[c];
			if(i < 0 || i >= weights.length)
				break;

			for(var j = 0; j < eb.p.length; ++j) {
				error.p[j] += eb.p[j] * weights[i];
				if(error.p[j] > maxErr)
					maxErr = error.p[j];
			}
			i += sortedByYDiff ? -1 : 1;
		}

		var r_pix = Math.clamp(error.p[0], 0, 0xff) | 0;
		var g_pix = Math.clamp(error.p[1], 0, 0xff) | 0;
		var b_pix = Math.clamp(error.p[2], 0, 0xff) | 0;
		var a_pix = Math.clamp(error.p[3], 0, 0xff) | 0;

		var r0 = (pixel & 0xff),
			g0 = (pixel >>> 8) & 0xff,
			b0 = (pixel >>> 16) & 0xff;

		var c2 = (a_pix << 24) | (b_pix << 16) | (g_pix <<  8) | r_pix;
		if(nMaxColors <= 32 && a_pix > 0xF0) {
			var offset = getColorIndex(a_pix, r_pix, g_pix, b_pix);
			if (lookup[offset] == 0)
				lookup[offset] = ditherFn(palette, c2, bidx) + 1;
			qPixels[bidx] = lookup[offset] - 1;
			
			if(saliencies != null && Y_Diff(r0, g0, b0, r_pix, g_pix, b_pix) > nMaxColors - margin) {
				var strength = 1 / 3.0;
				c2 = new BlueNoise({weight: 1 / saliencies[bidx]}).diffuse(pixel, palette[qPixels[bidx]], strength, x, y);
				qPixels[bidx] = ditherFn(palette, c2, bidx);
			}
		}
		else
			qPixels[bidx] = ditherFn(palette, c2, bidx);

		if(errorq.length >= DITHER_MAX)
			errorq.shift();
		else if(errorq.length > 0)
			initWeights(errorq.length);

		c2 = palette[qPixels[bidx]];
		var r2 = (c2 & 0xff),
			g2 = (c2 >>> 8) & 0xff,
			b2 = (c2 >>> 16) & 0xff,
			a2 = (c2 >>> 24) & 0xff;

		error.p[0] = r_pix - r2;
		error.p[1] = g_pix - g2;
		error.p[2] = b_pix - b2;
		error.p[3] = a_pix - a2;

		var denoise = palette.length > 2;
		var diffuse = TELL_BLUE_NOISE[bidx & 4095] > thresold;
		error.yDiff = sortedByYDiff ? Y_Diff(r0, g0, b0, r_pix, g_pix, b_pix) : 1;
		var illusion = !diffuse && TELL_BLUE_NOISE[((error.yDiff * 4096) | 0) & 4095] > thresold;

		var errLength = denoise ? error.p.length - 1 : 0;
		for(var j = 0; j < errLength; ++j) {
			if(Math.abs(error.p[j]) >= ditherMax) {
				if (diffuse)
					error.p[j] = Math.fround(Math.tanh(error.p[j] / maxErr * 20)) * (ditherMax - 1);
				else if(illusion)
					error.p[j] = Math.fround(error.p[j] / maxErr * error.yDiff) * (ditherMax - 1);
				else
					error.p[j] /= Math.fround(1 + Math.sqrt(ditherMax));
			}
		}

		errorq.push(error);
		if(sortedByYDiff)
			errorq.sort(function(o1, o2) {
				return Math.sign(o1.yDiff - o2.yDiff); // descending order
			});
	}

	function generate2d(x, y, ax, ay, bx, by) {
		var w = Math.abs(ax + ay);
		var h = Math.abs(bx + by);
		var dax = Math.sign(ax);
		var day = Math.sign(ay);
		var dbx = Math.sign(bx);
		var dby = Math.sign(by);

		if (h == 1) {
			for (var i = 0; i < w; ++i){
				ditherPixel(x, y);
				x += dax;
				y += day;
			}
			return;
		}

		if (w == 1) {
			for (var i = 0; i < h; ++i){
				ditherPixel(x, y);
				x += dbx;
				y += dby;
			}
			return;
		}

		var ax2 = (ax / 2) | 0;
		var ay2 = (ay / 2) | 0;
		var bx2 = (bx / 2) | 0;
		var by2 = (by / 2) | 0;

		var w2 = Math.abs(ax2 + ay2);
		var h2 = Math.abs(bx2 + by2);

		if (2 * w > 3 * h) {
			if ((w2 % 2) != 0 && w > 2) {
				ax2 += dax;
				ay2 += day;
			}
			generate2d(x, y, ax2, ay2, bx, by);
			generate2d(x + ax2, y + ay2, ax - ax2, ay - ay2, bx, by);
			return;
		}

		if ((h2 % 2) != 0 && h > 2) {
			bx2 += dbx;
			by2 += dby;
		}

		generate2d(x, y, bx2, by2, ax2, ay2);
		generate2d(x + bx2, y + by2, ax, ay, bx - bx2, by - by2);
		generate2d(x + (ax - dax) + (bx2 - dbx), y + (ay - day) + (by2 - dby), -bx2, -by2, -(ax - ax2), -(ay - ay2));
	}
	
	function processImagePixels() {
		var qPixel32s = new Uint32Array(qPixels.length);
		for (var i = 0; i < qPixels.length; ++i)
			qPixel32s[i] = palette[qPixels[i]];

		return qPixel32s;
	}

	function initWeights(size)
	{
		/* Dithers all pixels of the image in sequence using
		* the Gilbert path, and distributes the error in
		* a sequence of pixels size.
		*/
		var weightRatio = Math.fround(Math.pow(BLOCK_SIZE + 1.0, 1.0 / (size - 1.0)));
		var weight = 1.0, sumweight = 0.0;
		weights = new Array(size);
		for(var c = 0; c < size; ++c) {
			errorq.push(new ErrorBox(0));
			sumweight += (weights[size - c - 1] = weight);
			weight /= weightRatio;
		}

		weight = 0.0; /* Normalize */
		for(var c = 0; c < size; ++c) {
			weights[c] = Math.fround(weights[c] / sumweight);
			weight += weights[c];
		}
		weights[0] += Math.fround(1.0 - weight);
	}

	GilbertCurve.prototype.dither = function()
	{
		errorq = [];
		var hasAlpha = this.opts.weight < 0;
		this.opts.weight = Math.abs(this.opts.weight);
		margin = this.opts.weight < .0025 ? 12 : 6;
		sortedByYDiff = this.opts.palette.length >= 128 && (hasAlpha ? this.opts.weight < .18 : this.opts.weight >= .04);
		
		DITHER_MAX = this.opts.weight < .01 ? (this.opts.weight > .0025) ? 25 : 16 : 9;
		var edge = hasAlpha ? 1 : Math.exp(this.opts.weight) - .25;
		ditherMax = (hasAlpha || DITHER_MAX > 9) ? Math.pow((Math.sqrt(DITHER_MAX) + edge), 2) : DITHER_MAX;
		var density = this.opts.palette.length > 16 ? 3200 : 1500;
		if(this.opts.palette.length / this.opts.weight > 5000 && (this.opts.weight > .045 || (this.opts.weight > .01 && this.opts.palette.length <= 64)))
			ditherMax = Math.pow(5 + edge, 2);
		else if(this.opts.palette.length / this.opts.weight < density && this.opts.palette.length >= 16 && this.opts.palette.length < 128)
			ditherMax = Math.pow(5 + edge, 2);
		thresold = DITHER_MAX > 9 ? -112 : -64;
		weights = [];
		lookup = new Uint32Array(65536);

		ditherFn = this.opts.ditherFn;
		getColorIndex = this.opts.getColorIndex;
		width = this.opts.width;
		height = this.opts.height;
		pixels = this.opts.pixels;
		palette = this.opts.palette;
		saliencies = this.opts.saliencies;
		nMaxColors = palette.length;
		qPixels = nMaxColors > 256 ? new Uint16Array(pixels.length) : new Uint8Array(pixels.length);

		if(!sortedByYDiff)
			initWeights(DITHER_MAX);

		if (width >= height)
			generate2d(0, 0, width, 0, 0, height);
		else
			generate2d(0, 0, 0, height, width, 0);
		
		this.opts.indexedPixels = this.qPixels = qPixels;

		if(!this.opts.dithering)
			return qPixels;
		
		return processImagePixels();
	}
	
	GilbertCurve.prototype.getIndexedPixels = function getIndexedPixels() {
		return this.qPixels;
	};
	
	GilbertCurve.prototype.getResult = function getResult() {
		var hc = this;
		return new Promise(function(resolve, reject) {
			if(hc.opts.dithering)
				resolve({ img8: hc.dither(), indexedPixels: hc.getIndexedPixels() });
			else
				resolve({ indexedPixels: hc.dither() });
		});
	};

	// expose
	globalThis.GilbertCurve = GilbertCurve;

	// expose to commonJS
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = GilbertCurve;
	}

}).call(globalThis);



(function(){
	if(!Math.clamp) {
		Math.clamp = function(a,b,c){
			return this.max(b, this.min(c, a));
		};
	}
	
	function PnnQuant(opts) {
		this.opts = opts;
		this.hasSemiTransparency = false;
		this.m_transparentPixelIndex = -1;
		this.m_transparentColor = 0xffffff;
		this.palette = [];
		this.qPixels = [];
	}
		
	
	var alphaThreshold = 0xF, hasAlpha = false, hasSemiTransparency = false, transparentColor;
	var PR = 0.299, PG = 0.587, PB = 0.114, PA = .3333;
	var ratio = .5;
	var closestMap = new Map(), nearestMap = new Map();
	
	var coeffs = [
		[0.299, 0.587, 0.114],
		[-0.14713, -0.28886, 0.436],
		[0.615, -0.51499, -0.10001]
	];
	
	function PnnBin() {
		this.ac = this.rc = this.gc = this.bc = 0;
		this.cnt = this.err = 0.0;
		this.nn = this.fw = this.bk = this.tm = this.mtm = 0;
	}
	
	function getARGBIndex(a, r, g, b, hasSemiTransparency, hasTransparency) {
		if (hasSemiTransparency)
			return (a & 0xF0) << 8 | (r & 0xF0) << 4 | (g & 0xF0) | (b >> 4);
		if (hasTransparency)
			return (a & 0x80) << 8 | (r & 0xF8) << 7 | (g & 0xF8) << 2 | (b >> 3);
		return (r & 0xF8) << 8 | (g & 0xFC) << 3 | (b >> 3);
	}
	
	function sqr(value) {
		return value * value;
	}
	
	function find_nn(bins, idx) {
		var nn = 0;
		var err = 1e100;

		var bin1 = bins[idx];
		var n1 = bin1.cnt;
		var wa = bin1.ac;
		var wr = bin1.rc;
		var wg = bin1.gc;
		var wb = bin1.bc;
		
		var start = 0;
		if(TELL_BLUE_NOISE[idx & 4095] > -88)
			start = (PG < coeffs[0][1]) ? coeffs.length : 1;
		
		for (var i = bin1.fw; i != 0; i = bins[i].fw)
		{
			var n2 = bins[i].cnt, nerr2 = (n1 * n2) / (n1 + n2);
			if (nerr2 >= err)
				continue;
			
			var nerr = 0.0;
			if(hasSemiTransparency) {
				start = 1;
				nerr += nerr2 * (1 - ratio) * PA * sqr(bins[i].ac - wa);
				if (nerr >= err)
					continue;
			}
			
			nerr += nerr2 * (1 - ratio) * PR * sqr(bins[i].rc - wr);
			if (nerr >= err)
				continue;

			nerr += nerr2 * (1 - ratio) * PG * sqr(bins[i].gc - wg);
			if (nerr >= err)
				continue;

			nerr += nerr2 * (1 - ratio) * PB * sqr(bins[i].bc - wb);
			if (nerr >= err)
				continue;
			
			for (var j = start; j < coeffs.length; ++j) {
				nerr += nerr2 * ratio * sqr(coeffs[j][0] * (bins[i].rc - wr));
				if (nerr >= err)
					break;
				
				nerr += nerr2 * ratio * sqr(coeffs[j][1] * (bins[i].gc - wg));
				if (nerr >= err)
					break;
				
				nerr += nerr2 * ratio * sqr(coeffs[j][2] * (bins[i].bc - wb));
				if (nerr >= err)
					break;
			}
			
			err = nerr;
			nn = i;
		}
		bin1.err = Math.fround(err);
		bin1.nn = nn;
	}
	
	function getQuanFn(nMaxColors, quan_rt) {
		if (quan_rt > 0) {
			if (nMaxColors < 64)
				return function(cnt) { return Math.fround(Math.sqrt(cnt)); };
			return function(cnt) { return Math.sqrt(cnt) | 0; };
		}
		if (quan_rt < 0)
			return function(cnt) { return Math.cbrt(cnt) | 0; };
		return function(cnt) { return cnt; };
	}
	
	PnnQuant.prototype.pnnquan = function pnnquan(pixels, nMaxColors) {
		closestMap.clear();
		nearestMap.clear();
		var quan_rt = 1;
		var bins = new Array(65536);

		/* Build histogram */
		for (var i = 0; i < pixels.length; ++i)
		{
			var r = pixels[i] & 0xff,
			g = (pixels[i] >>> 8) & 0xff,
			b = (pixels[i] >>> 16) & 0xff,
			a = (pixels[i] >>> 24) & 0xff;
			
			if (a <= alphaThreshold) {
				r = this.m_transparentColor & 0xff,
				g = (this.m_transparentColor >>> 8) & 0xff,
				b = (this.m_transparentColor >>> 16) & 0xff,
				a = (this.m_transparentColor >>> 24) & 0xff;
			}
			
			var index = getARGBIndex(a, r, g, b, this.hasSemiTransparency, nMaxColors < 64 || this.m_transparentPixelIndex >= 0);
			if (bins[index] == null)
				bins[index] = new PnnBin();
			var tb = bins[index];
			tb.ac += a;
			tb.rc += r;
			tb.gc += g;
			tb.bc += b;
			tb.cnt += 1.0;
		}

		/* Cluster nonempty bins at one end of array */
		var maxbins = 0;
		for (var i = 0; i < bins.length; ++i)
		{
			if (bins[i] == null)
				continue;

			var d = 1.0 / bins[i].cnt;
			bins[i].ac *= d;
			bins[i].rc *= d;
			bins[i].gc *= d;
			bins[i].bc *= d;

			bins[maxbins++] = bins[i];
		}
		
		if(nMaxColors < 16)
			quan_rt = -1;
		
		var weight = this.opts.weight = Math.min(0.9, nMaxColors * 1.0 / maxbins);
		if (weight > .003 && weight < .005)
			quan_rt = 0;
		if (weight < .03 && PG >= coeffs[0][1]) {
			PR = PG = PB = PA = 1;
			if (nMaxColors >= 64)
				quan_rt = 0;
		}
		
		var quanFn = getQuanFn(nMaxColors, quan_rt);
		
		var j = 0;
		for (; j < maxbins - 1; ++j)
		{
			bins[j].fw = j + 1;
			bins[j + 1].bk = j;
			bins[j].cnt = quanFn(bins[j].cnt);
		}
		bins[j].cnt = quanFn(bins[j].cnt);

		var h, l, l2;
		/* Initialize nearest neighbors and build heap of them */
		var heap = new Uint32Array(bins.length + 1);
		for (var i = 0; i < maxbins; ++i)
		{
			find_nn(bins, i);
			/* Push slot on heap */
			var err = bins[i].err;
			for (l = ++heap[0]; l > 1; l = l2)
			{
				l2 = l >> 1;
				if (bins[h = heap[l2]].err <= err)
					break;
				heap[l] = h;
			}
			heap[l] = i;
		}

		/* Merge bins which increase error the least */
		var extbins = maxbins - nMaxColors;
		for (var i = 0; i < extbins;)
		{
			var tb;
			/* Use heap to find which bins to merge */
			for (; ; )
			{
				var b1 = heap[1];
				tb = bins[b1]; /* One with least error */
				/* Is stored error up to date? */
				if ((tb.tm >= tb.mtm) && (bins[tb.nn].mtm <= tb.tm))
					break;
				if (tb.mtm == 0xFFFF) /* Deleted node */
					b1 = heap[1] = heap[heap[0]--];
				else /* Too old error value */
				{
					find_nn(bins, b1);
					tb.tm = i;
				}
				/* Push slot down */
				var err = bins[b1].err;
				for (l = 1; (l2 = l + l) <= heap[0]; l = l2)
				{
					if ((l2 < heap[0]) && (bins[heap[l2]].err > bins[heap[l2 + 1]].err))
						++l2;
					if (err <= bins[h = heap[l2]].err)
						break;
					heap[l] = h;
				}
				heap[l] = b1;
			}

			/* Do a merge */
			var nb = bins[tb.nn];
			var n1 = tb.cnt;
			var n2 = nb.cnt;
			var d = Math.fround(1.0 / (n1 + n2));
			tb.ac = d * Math.round(n1 * tb.ac + n2 * nb.ac);
			tb.rc = d * Math.round(n1 * tb.rc + n2 * nb.rc);
			tb.gc = d * Math.round(n1 * tb.gc + n2 * nb.gc);
			tb.bc = d * Math.round(n1 * tb.bc + n2 * nb.bc);
			tb.cnt += n2;
			tb.mtm = ++i;

			/* Unchain deleted bin */
			bins[nb.bk].fw = nb.fw;
			bins[nb.fw].bk = nb.bk;
			nb.mtm = 0xFFFF;
		}

		/* Fill palette */
		this.palette = new Uint32Array(extbins > 0 ? nMaxColors : maxbins);
		var k = 0;
		for (var i = 0; ; ++k)
		{
			var a = Math.clamp(bins[i].ac, 0, 0xff) | 0,
			r = Math.clamp(bins[i].rc, 0, 0xff) | 0,
			g = Math.clamp(bins[i].gc, 0, 0xff) | 0,
			b = Math.clamp(bins[i].bc, 0, 0xff) | 0;

			this.palette[k] = (a << 24) | (b << 16) | (g << 8) | r;
			if (this.m_transparentPixelIndex >= 0 && a == 0) {
				var temp = this.palette[0];
				this.palette[0] = this.m_transparentColor;
				this.palette[k] = temp;
			}

			if ((i = bins[i].fw) == 0)
				break;
		}
	};
	
	function nearestColorIndex(palette, pixel, pos) {
		var k = 0;
		var a = (pixel >>> 24) & 0xff;
		if (a <= alphaThreshold) {
			pixel = transparentColor;
			a = (pixel >>> 24) & 0xff;
		}

		var nearest = nearestMap.get(pixel);
		if (nearest != null)
			return nearest;

		if(palette.length > 2 && hasAlpha && a > alphaThreshold)
			k = 1;

		var r = (pixel & 0xff),
		g = (pixel >>> 8) & 0xff,
		b = (pixel >>> 16) & 0xff;

		var pr = PR, pg = PG, pb = PB;
		if(palette.length > 2 && TELL_BLUE_NOISE[pos & 4095] > -88) {
			pr = coeffs[0][0]; pg = coeffs[0][1]; pb = coeffs[0][2];
		}

		var mindist = 1e100;
		for (var i = k; i < palette.length; i++)
		{
			var r2 = (palette[i] & 0xff),
			g2 = (palette[i] >>> 8) & 0xff,
			b2 = (palette[i] >>> 16) & 0xff,
			a2 = (palette[i] >>> 24) & 0xff;
			var curdist = PA * sqr(a2 - a);
			if (curdist > mindist)
				continue;
			
			curdist += pr * sqr(r2 - r);
			if (curdist > mindist)
				continue;

			curdist += pg * sqr(g2 - g);
			if (curdist > mindist)
				continue;

			curdist += pb * sqr(b2 - b);
			if (curdist > mindist)
				continue;

			mindist = curdist;
			k = i;
		}
		nearestMap.set(pixel, k);
		return k;
	}
	
	function closestColorIndex(palette, pixel, pos) {
		var a = (pixel >>> 24) & 0xff;
		if (a <= alphaThreshold)
			return nearestColorIndex(palette, pixel, pos);
		
		var r = (pixel & 0xff),
		g = (pixel >>> 8) & 0xff,
		b = (pixel >>> 16) & 0xff;

		var closest = closestMap.get(pixel);
		if (!closest)
		{
			closest = new Array(4);
			closest[2] = closest[3] = 0xFFFF;
			
			var pr = PR, pg = PG, pb = PB;
			if(TELL_BLUE_NOISE[pos & 4095] > -88) {
				pr = coeffs[0][0]; pg = coeffs[0][1]; pb = coeffs[0][2];
			}

			for (var k = 0; k < palette.length; ++k)
			{
				var r2 = (palette[k] & 0xff),
				g2 = (palette[k] >>> 8) & 0xff,
				b2 = (palette[k] >>> 16) & 0xff,
				a2 = (palette[k] >>> 24) & 0xff;
				
				var err = pr * sqr(r2 - r);
				if (err >= closest[3])
					continue;
				
				err += pg * sqr(g2 - g);
				if (err >= closest[3])
					continue;
				
				err += pb * sqr(b2 - b);
				if (err >= closest[3])
					continue;
				
				if(hasSemiTransparency)
					err += PA * sqr(a2 - a);
				
				if (err < closest[2])
				{
					closest[1] = closest[0];
					closest[3] = closest[2];
					closest[0] = k;
					closest[2] = err | 0;
				}
				else if (err < closest[3])
				{
					closest[1] = k;
					closest[3] = err | 0;
				}
			}

			if (closest[3] == 0xFFFF)
				closest[1] = closest[0];
			
			closestMap.set(pixel, closest);
		}

		var MAX_ERR = palette.length << 2;
		var idx = (pos + 1) % 2;
		if (closest[3] * .67 < (closest[3] - closest[2]))
			idx = 0;
		else if (closest[0] > closest[1])
			idx = pos % 2;
			
		if(closest[idx + 2] >= MAX_ERR || (hasAlpha && closest[idx + 2] == 0))
			return nearestColorIndex(palette, pixel, pos);
		return closest[idx];
	}
	
	function CalcDitherPixel(a, r, g, b, clamp, rowerr, cursor, noBias)
	{
		var ditherPixel = new Int32Array(4);
		if (noBias) {
			ditherPixel[0] = clamp[((rowerr[cursor] + 0x1008) >> 4) + r];
			ditherPixel[1] = clamp[((rowerr[cursor + 1] + 0x1008) >> 4) + g];
			ditherPixel[2] = clamp[((rowerr[cursor + 2] + 0x1008) >> 4) + b];
			ditherPixel[3] = clamp[((rowerr[cursor + 3] + 0x1008) >> 4) + a];
			return ditherPixel;
		}

		ditherPixel[0] = clamp[((rowerr[cursor] + 0x2010) >> 5) + r];
		ditherPixel[1] = clamp[((rowerr[cursor + 1] + 0x1008) >> 4) + g];
		ditherPixel[2] = clamp[((rowerr[cursor + 2] + 0x2010) >> 5) + b];
		ditherPixel[3] = a;
		return ditherPixel;
	}
	
	PnnQuant.prototype.quantize_image = function quantize_image(pixels, nMaxColors, width, height, dither) {
		var qPixels = nMaxColors > 256 ? new Uint16Array(pixels.length) : new Uint8Array(pixels.length);
		var pixelIndex = 0;
		if (dither)
		{
			const DJ = 4, BLOCK_SIZE = 256, DITHER_MAX = 20;
			var err_len = (width + 2) * DJ;
			var clamp = new Int32Array(DJ * BLOCK_SIZE);
			var limtb = new Int32Array(2 * BLOCK_SIZE);

			for (var i = 0; i < BLOCK_SIZE; ++i)
			{
				clamp[i] = 0;
				clamp[i + BLOCK_SIZE] = i;
				clamp[i + BLOCK_SIZE * 2] = 0xff;
				clamp[i + BLOCK_SIZE * 3] = 0xff;

				limtb[i] = -DITHER_MAX;
				limtb[i + BLOCK_SIZE] = DITHER_MAX;
			}
			for (var i = -DITHER_MAX; i <= DITHER_MAX; ++i)
				limtb[i + BLOCK_SIZE] = i;

			var noBias = this.hasSemiTransparency || nMaxColors < 64;
			var dir = 1;
			var row0 = new Int32Array(err_len);
			var row1 = new Int32Array(err_len);
			var lookup = new Int32Array(65536);
			for (var i = 0; i < height; ++i)
			{
				if (dir < 0)
					pixelIndex += width - 1;

				var cursor0 = DJ, cursor1 = width * DJ;
				row1[cursor1] = row1[cursor1 + 1] = row1[cursor1 + 2] = row1[cursor1 + 3] = 0;
				for (var j = 0; j < width; ++j)
				{
					var r = (pixels[pixelIndex] & 0xff),
					g = (pixels[pixelIndex] >>> 8) & 0xff,
					b = (pixels[pixelIndex] >>> 16) & 0xff,
					a = (pixels[pixelIndex] >>> 24) & 0xff;

					var ditherPixel = CalcDitherPixel(a, r, g, b, clamp, row0, cursor0, noBias);
					var r_pix = ditherPixel[0];
					var g_pix = ditherPixel[1];
					var b_pix = ditherPixel[2];
					var a_pix = ditherPixel[3];

					var c1 = (a_pix << 24) | (b_pix << 16) | (g_pix <<  8) | r_pix;
					if(noBias) {
						var offset = getARGBIndex(a_pix, r_pix, g_pix, b_pix, this.hasSemiTransparency, this.m_transparentPixelIndex >= 0);
						if (lookup[offset] == 0)
							lookup[offset] = (a == 0) ? 1 : nearestColorIndex(this.palette, c1, i + j) + 1;
						qPixels[pixelIndex] = lookup[offset] - 1;
					}
					else 
						qPixels[pixelIndex] = (a == 0) ? 0 : nearestColorIndex(this.palette, c1, i + j);

					var c2 = this.palette[qPixels[pixelIndex]];
					var r2 = (c2 & 0xff),
					g2 = (c2 >>> 8) & 0xff,
					b2 = (c2 >>> 16) & 0xff,
					a2 = (c2 >>> 24) & 0xff;

					r_pix = limtb[r_pix - r2 + BLOCK_SIZE];
					g_pix = limtb[g_pix - g2 + BLOCK_SIZE];
					b_pix = limtb[b_pix - b2 + BLOCK_SIZE];
					a_pix = limtb[a_pix - a2 + BLOCK_SIZE];

					var k = r_pix * 2;
					row1[cursor1 - DJ] = r_pix;
					row1[cursor1 + DJ] += (r_pix += k);
					row1[cursor1] += (r_pix += k);
					row0[cursor0 + DJ] += (r_pix + k);

					k = g_pix * 2;
					row1[cursor1 + 1 - DJ] = g_pix;
					row1[cursor1 + 1 + DJ] += (g_pix += k);
					row1[cursor1 + 1] += (g_pix += k);
					row0[cursor0 + 1 + DJ] += (g_pix + k);

					k = b_pix * 2;
					row1[cursor1 + 2 - DJ] = b_pix;
					row1[cursor1 + 2 + DJ] += (b_pix += k);
					row1[cursor1 + 2] += (b_pix += k);
					row0[cursor0 + 2 + DJ] += (b_pix + k);

					k = a_pix * 2;
					row1[cursor1 + 3 - DJ] = a_pix;
					row1[cursor1 + 3 + DJ] += (a_pix += k);
					row1[cursor1 + 3] += (a_pix += k);
					row0[cursor0 + 3 + DJ] += (a_pix + k);

					cursor0 += DJ;
					cursor1 -= DJ;
					pixelIndex += dir;
				}
				if ((i % 2) == 1)
					pixelIndex += width + 1;

				dir *= -1;
				var temp = row0; row0 = row1; row1 = temp;
			}
			
			this.qPixels = qPixels;
			return this.qPixels;
		}

		for (var i = 0; i < qPixels.length; ++i)
			qPixels[i] = this.getDitherFn()(this.palette, pixels[i], i);

		this.qPixels = qPixels;
		return this.qPixels;
	};
	
	function processImagePixels(palette, qPixels) {
		var qPixel32s = new Uint32Array(qPixels.length);
		for (var i = 0; i < qPixels.length; ++i)
			qPixel32s[i] = palette[qPixels[i]];

		return qPixel32s;
	}
	
	PnnQuant.prototype.quantizeImage = function quantizeImage() {
		var pixels = this.opts.pixels, width = this.opts.width, height = this.opts.height,
			nMaxColors = this.opts.colors, dither = this.opts.dithering;
		if(this.opts.alphaThreshold)
			alphaThreshold = this.opts.alphaThreshold;

		closestMap.clear();
		nearestMap.clear();

		hasAlpha = false;
		var semiTransCount = 0;
		for (var i = 0; i < pixels.length; ++i) {
			var a = (pixels[i] >>> 24) & 0xff;
			
			if (a < 0xE0)
			{
				if (a == 0) {
					this.m_transparentPixelIndex = i;
					hasAlpha = true;
					if(nMaxColors > 2)
						this.m_transparentColor = pixels[i];
					else
						pixels[i] = this.m_transparentColor;
				}
				else if(a > alphaThreshold)
					++semiTransCount;
			}
		}
		
		this.hasSemiTransparency = hasSemiTransparency = semiTransCount > 0;

		if (nMaxColors <= 32)
			PR = PG = PB = PA = 1;
		else {
			PR = coeffs[0][0]; PG = coeffs[0][1]; PB = coeffs[0][2];
		}

		transparentColor = this.m_transparentColor; 
		
		this.palette = new Uint32Array(nMaxColors);
		if (nMaxColors > 2)
			this.pnnquan(pixels, nMaxColors);
		else {
			if (this.m_transparentPixelIndex >= 0)
			{
				this.palette[0] = this.m_transparentColor;
				this.palette[1] = (0xff << 24);
			}
			else
			{
				this.palette[0] = (0xff << 24);
				this.palette[1] = 0xffffffff;
			}
		}

		if(!this.opts.dithering)
			this.opts.weightB = 1.0;

		if (hasSemiTransparency)
			this.opts.weight *= -1;

		if (this.m_transparentPixelIndex >= 0 && this.palette.length > 2)
		{
			var k = this.getDitherFn()(this.palette, pixels[this.m_transparentPixelIndex], this.m_transparentPixelIndex);
			this.palette[k] = this.m_transparentColor;
		}
		
		if(this.opts.paletteOnly) {
			this.opts.ditherFn = this.getDitherFn();
			this.opts.getColorIndex = this.getColorIndex;
			this.opts.palette = this.palette;
			return this.palette;
		}

		this.qPixels = this.quantize_image(pixels, nMaxColors, width, height, dither);
		return processImagePixels(this.palette, this.qPixels);
	};
	
	PnnQuant.prototype.getIndexedPixels = function getIndexedPixels() {
		return this.qPixels;
	};
	
	PnnQuant.prototype.getPalette = function getPalette() {
		return this.palette.buffer;
	};
	
	PnnQuant.prototype.getImgType = function getImgType() {
		return this.opts.colors > 256 || this.hasSemiTransparency ? "image/png" : "image/gif";
	};
	
	PnnQuant.prototype.getTransparentIndex = function getTransparentIndex() {
		return this.m_transparentPixelIndex > -1 ? 0 : -1;
	};
	
	PnnQuant.prototype.getDitherFn = function getDitherFn() {
		return this.opts.dithering ? nearestColorIndex : closestColorIndex;
	};
	
	PnnQuant.prototype.getColorIndex = function getColorIndex(a, r, g, b) {
		return getARGBIndex(a, r, g, b, this.hasSemiTransparency, this.m_transparentPixelIndex >= 0);
	};
	
	PnnQuant.prototype.getResult = function getResult() {
		var quant = this;
		return new Promise(function(resolve, reject) {
			var result = quant.quantizeImage();
			if(quant.opts.paletteOnly)
				resolve({ pal8: result, indexedPixels: quant.getIndexedPixels(), transparent: quant.getTransparentIndex(), type: quant.getImgType() });
			else
				resolve({ img8: result, pal8: quant.getPalette(), indexedPixels: quant.getIndexedPixels(), transparent: quant.getTransparentIndex(), type: quant.getImgType() });
		});
	};

	// expose
	globalThis.PnnQuant = PnnQuant;

	// expose to commonJS
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = PnnQuant;
	}

}).call(globalThis);
