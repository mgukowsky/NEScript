(function(){
	//Emulates 2C02 PPU
	//Responsible for most interactions with a <canvas>

	if(typeof(NEScript) === "undefined"){
		window.NEScript = {};
	}

	/* SOURCEMAP
	/			-CONSTANTS
	/			-INTERFACE
	/			-VBUFFER MANIPULATION
	/			-SCANLINE LOGIC
	/			-REGISTER I/O
	/
	*/

/****************************CONSTANTS*****************************/

	//Register addresses in main memory
	//The bits in each register serve various functions
	var PPUCTRL = 0x2000, PPUMASK = 0x2001, PPUSTATUS = 0x2002, 
			OAMADDR = 0x2003, OAMDATA = 0x2004, PPUSCROLL = 0x2005,
			PPUADDR = 0x2006, PPUDATA = 0x2007, OAMDMA = 0x4014;

	//PPU addresses to watch
	var UNIVERSAL_BACKGROUND_ADDR = 0x3F00, BACKGROUND_PALETTE_ZERO = 0x3F01,
			BACKGROUND_PALETTE_ONE = 0x3F05, BACKGROUND_PALETTE_TWO = 0x3F09,
			BACKGROUND_PALETTE_THREE = 0x3F0D, SPRITE_PALETTE_ZERO = 0x3F11,
			SPRITE_PALETTE_ONE = 0x3F15, SPRITE_PALETTE_TWO = 0x3F19,
			SPRITE_PALETTE_THREE = 0x3F1D;

	var SCANLINE_LIMIT = 262, PIXEL_LIMIT = 341, SPRITE_LIMIT = 64,
			NAMETABLE_SIZE = 960, //Nametable size is 32x30 tiles, or 256 * 240 pixels
			NAMETABLE_SIZE_X = 32, NAMETABLE_SIZE_Y = 30;

	var MIRROR_HORIZONTAL = 0, MIRROR_VERTICAL = 1;

	//CPU constant 
	//TODO: define this on the CPU class so we do not have to redefine it here
	var INTERRUPT_NMI = 2

	var TRANSPARENT = 0, OPAQUE = 0xFF,
			BEHIND_BACKGROUND = 0xAB, //Magic number for the opacity of sprites that go behind the background
			IS_SPRITE_ZERO = 0xCD, IS_OPAQUE_BACKGROUND = 0xEF,
			IS_SPRITE_ZERO_BEHIND_BACKGROUND = 0x89,
			OPAQUE_UBC = 0x67;

	var BITMASKS = [0x80, 0x40, 0x20, 0x10, 0x08, 0x04, 0x02, 0x01];

	//The NES color palette, contains RGB values
	var _NES_COLOR_PALETTE = {
		0x00: {r: 0x75, g: 0x75, b: 0x75}, //dark gray
		0x01: {r: 0x27, g: 0x1B, b: 0x8F}, //dark blue
		0x02: {r: 0x00, g: 0x00, b: 0xAB}, //med blue
		0x03: {r: 0x47, g: 0x00, b: 0x9F}, //deep purple
		0x04: {r: 0x8F, g: 0x00, b: 0x77}, //dark purple
		0x05: {r: 0xAB, g: 0x00, b: 0x13}, //dark red
		0x06: {r: 0xA7, g: 0x00, b: 0x00}, //dark orange
		0x07: {r: 0x7F, g: 0x0B, b: 0x00}, //brown
		0x08: {r: 0x43, g: 0x2F, b: 0x00}, //dark brown
		0x09: {r: 0x00, g: 0x47, b: 0x00}, //dark green
		0x0A: {r: 0x00, g: 0x51, b: 0x00}, //med green
		0x0B: {r: 0x00, g: 0x3F, b: 0x17}, //deep green
		0x0C: {r: 0x1B, g: 0x3F, b: 0x5F}, //blue gray
		0x0D: {r: 0x00, g: 0x00, b: 0x00}, //black
		0x0E: {r: 0x00, g: 0x00, b: 0x00}, 
		0x0F: {r: 0x00, g: 0x00, b: 0x00},

		0x10: {r: 0xBC, g: 0xBC, b: 0xBC}, //med gray
		0x11: {r: 0x00, g: 0x73, b: 0xEF}, //med blue
		0x12: {r: 0x23, g: 0x3B, b: 0xEF}, //med blue
		0x13: {r: 0x83, g: 0x00, b: 0xF3}, //indigo
		0x14: {r: 0xBF, g: 0x00, b: 0xBF}, //med purple
		0x15: {r: 0xE7, g: 0x00, b: 0x5B}, //watermelon
		0x16: {r: 0xDB, g: 0x2B, b: 0x00}, //med orange
		0x17: {r: 0xCB, g: 0x4F, b: 0x0F}, //orange brown
		0x18: {r: 0x8B, g: 0x73, b: 0x00}, //pickle
		0x19: {r: 0x00, g: 0x97, b: 0x00}, //med green
		0x1A: {r: 0x00, g: 0xAB, b: 0x00}, //med green
		0x1B: {r: 0x00, g: 0x93, b: 0x3B}, //med green
		0x1C: {r: 0x00, g: 0x83, b: 0x8B}, //teal
		0x1D: {r: 0x00, g: 0x00, b: 0x00}, 
		0x1E: {r: 0x00, g: 0x00, b: 0x00},
		0x1F: {r: 0x00, g: 0x00, b: 0x00},

		0x20: {r: 0xFF, g: 0xFF, b: 0xFF}, //white
		0x21: {r: 0x3F, g: 0xBF, b: 0xFF}, //cyan
		0x22: {r: 0x5F, g: 0x97, b: 0xFF}, //med blue
		0x23: {r: 0xA7, g: 0x8B, b: 0xFD}, //indigo
		0x24: {r: 0xF7, g: 0x7B, b: 0xFF}, //indigo
		0x25: {r: 0xFF, g: 0x77, b: 0xB7}, //pink
		0x26: {r: 0xFF, g: 0x77, b: 0x63}, //rose
		0x27: {r: 0xFF, g: 0x9B, b: 0x3B}, //light orange
		0x28: {r: 0xF3, g: 0xBF, b: 0x3F}, //light orange
		0x29: {r: 0x83, g: 0xD3, b: 0x13}, //sea green
		0x2A: {r: 0x4F, g: 0xDF, b: 0x4B}, //light green
		0x2B: {r: 0x58, g: 0xF8, b: 0x98}, //light green
		0x2C: {r: 0x00, g: 0xEB, b: 0xDB}, //light blue
		0x2D: {r: 0x00, g: 0x00, b: 0x00},
		0x2E: {r: 0x00, g: 0x00, b: 0x00},
		0x2F: {r: 0x00, g: 0x00, b: 0x00},

		0x30: {r: 0xFF, g: 0xFF, b: 0xFF},
		0x31: {r: 0xAB, g: 0xE7, b: 0xFF}, //sky blue
		0x32: {r: 0xC7, g: 0xD7, b: 0xFF}, //light blue
		0x33: {r: 0xD7, g: 0xCB, b: 0xFF}, //light purple
		0x34: {r: 0xFF, g: 0xC7, b: 0xFF}, //light pink
		0x35: {r: 0xFF, g: 0xC7, b: 0xDB}, //light pink
		0x36: {r: 0xFF, g: 0xBF, b: 0xB3}, //light orange
		0x37: {r: 0xFF, g: 0xDB, b: 0xAB}, //light yellow
		0x38: {r: 0xFF, g: 0xE7, b: 0xA3}, //light yellow
		0x39: {r: 0xE3, g: 0xFF, b: 0xA3}, //light green
		0x3A: {r: 0xAB, g: 0xF3, b: 0xBF}, //light green
		0x3B: {r: 0xB3, g: 0xFF, b: 0xCF}, //light green
		0x3C: {r: 0x9F, g: 0xFF, b: 0xF3}, //light blue
		0x3D: {r: 0x00, g: 0x00, b: 0x00},
		0x3E: {r: 0x00, g: 0x00, b: 0x00},
		0x3F: {r: 0x00, g: 0x00, b: 0x00},
	};

	var SCANLINE_PHASE_PROC_MAP = {};

	//First 256 PPU cycles are used to fetch the data which will be sent out.
	// for(var i = 0; i < 256; i++){
	// 	SCANLINE_PHASE_PROC_MAP[i] = fetchResolveBlitPixel;
	// }

	// //The 2C02 spends hBlank doing various fetches from memory. Since these are done during
	// //the blitting process, we don't have to do anything during hblank :)
	// for(var i = 256; i < 340; i++){
	// 	SCANLINE_PHASE_PROC_MAP[i] = hBlankProc;
	// }

	// //341st is the last for the scanline. On the 2C02 this is a dummy scanline,
	// //but in our case we use this opportunity to reload the sprite workspace, which is similar 
	// //to the actual behavior of the 2C02.
	// SCANLINE_PHASE_PROC_MAP[340] = endHBlank;

/****************************INTERFACE***************************/

	var PPU = NEScript.PPU = function(refBus){
		this.refBus = refBus;
		this.VM = refBus.VM;
		this.OAM = refBus.OAM;

		//Reference to a CPU's main memory
		this.MM = refBus.MM;

		//We also need a reference to the CPU itself (for posting interrupts)

		//Hack for CPU to read palette vals, see CPU#readByte
		NEScript.__PPU__ = this;

		this.pixelCounter = 0;
		this.scanlineCounter = 0;
		this.scanlineOffsetY = 0;

		this.REGISTERS = {
			nameTableBaseAddr: 0x2000,
			patternTableOffset: 0,
			spritePatternTableOffset: 0,
			spriteSizeIs8x8: true,
			mirroringType: MIRROR_HORIZONTAL,
			vramIncrement: 1,
			shouldGenerateNMI: false,
			shouldShowBackground: true,
			shouldShowSprites: true,
			shouldShowLeftmostBackground: true,
			shouldShowLeftmostSprites: true,
			usePPUSCROLLX: true, //$2005 toggle
			usePPUADDRHI: true,	 //$2006 toggle
			fineXOffset: 0,
			fineYOffset: 0,
			currentPPUAddress: 0,
			ppuaddrBuffer: 0

		}

		//Special internal registers to be read by the PPU.
		//This is the most efficient way for the CPU to respond to 
		//writes to PPUDATA.
		// Object.defineProperty(this._mainMemory, 'ppuAddr', {
		// 	configurable: true,
		// 	enumerable: false,
		// 	writeable: true,
		// 	value: 0
		// })

		// Object.defineProperty(this._mainMemory, 'ppuIncr', {
		// 	configurable: true,
		// 	enumerable: false,
		// 	writeable: true,
		// 	value: 1
		// })

		this.REGISTERS.ppuAddr = 0;
		this.REGISTERS.ppuIncr = 1;
		this.REGISTERS.ppudataBuff = 0;

		// this._INTERNALS = {
		// 	scanlinePhaseCounter: 0,
		// 	scanlineOffsetY: 0
		// };

		//PPU controls initialization of the <canvas>.
		//FYI: the || is included for debugging purposes when working outside the DOM.
		this.canvasEl = document.getElementById("canvas") || document.createElement("canvas");

		//Set the internal dimensions of the canvas
		//if (NEScript.FORMAT === "PAL"){
			this.canvasEl.width = 256;
			this.canvasEl.height = 240;
		// } else { //default to NTSC
		// 	this.canvasEl.width = 256;
		// 	this.canvasEl.height = 224;
		// }

		this.ctx = this.canvasEl.getContext("2d");
	
		//This array is an internal buffer representing the pixels of the 
		//screen. Every 4 bytes represents and RGBA value.
		//CAUTION: this is a Uint8ClampedArray
		this._vbuffer = this.ctx.createImageData(this.canvasEl.width, this.canvasEl.height);
		this._vbData = this._vbuffer.data;

		this.spriteWorkspace = this.ctx.createImageData(this.canvasEl.width, this.canvasEl.height);
		//NTs at $2000, $2400, $2800, and $2C00
		this.nameTableWorkspaceA = this.ctx.createImageData(this.canvasEl.width, this.canvasEl.height);
		this.nameTableWorkspaceB = this.ctx.createImageData(this.canvasEl.width, this.canvasEl.height);
		this.nameTableWorkspaceC = this.ctx.createImageData(this.canvasEl.width, this.canvasEl.height);
		this.nameTableWorkspaceD = this.ctx.createImageData(this.canvasEl.width, this.canvasEl.height);

		clearInternalWorkspace(this.spriteWorkspace.data);
		clearInternalWorkspace(this.nameTableWorkspaceA.data);
		clearInternalWorkspace(this.nameTableWorkspaceB.data);
		clearInternalWorkspace(this.nameTableWorkspaceC.data);
		clearInternalWorkspace(this.nameTableWorkspaceD.data);

		//Create direct reference for efficiency
		this.IspriteRAM = this.spriteWorkspace.data;

		this.clearScreen();
	}

	//Does NOT affect this._mainMemory, this.canvasEl, or this.ctx
	PPU.prototype.totalReset = function(){
		this.VM = new NEScript.RAM(0x4000);
		this.OAM = new NEScript.RAM(0x100);
		this._vbuffer = this.ctx.createImageData(this.canvasEl.width, this.canvasEl.height);
		var vbLimit = this._vbuffer.data.length;

		for(var i = 0; i < vbLimit; i += 4){
			this._vbuffer.data[i] = 0;
			this._vbuffer.data[i + 1] = 0;
			this._vbuffer.data[i + 2] = 0;
			this._vbuffer.data[i + 3] = 0xFF;
		}

		this.pixelCounter = 0;
		this.scanlineCounter = 0;
		this.scanlineOffsetY = 0;

		this.REGISTERS = {
			nameTableBaseAddr: 0x2000,
			patternTableOffset: 0,
			spritePatternTableOffset: 0,
			spriteSizeIs8x8: true,
			mirroringType: MIRROR_HORIZONTAL,
			vramIncrement: 1,
			shouldGenerateNMI: false,
			shouldShowBackground: true,
			shouldShowSprites: true,
			shouldShowLeftmostBackground: true,
			shouldShowLeftmostSprites: true,
			usePPUSCROLLX: true,
			usePPUADDRHI: true,
			fineXOffset: 0,
			fineYOffset: 0,
			currentPPUAddress: 0,
			ppuaddrBuffer: 0

		}

		this.REGISTERS.ppuAddr = 0;
		this.REGISTERS.ppuIncr = 1;
		this.REGISTERS.ppudataBuff = 0;
	}

	//R/W functions need to coerce any requested address to range $0000 to $3FFF
	PPU.prototype.readByte = function(addr){
		addr = coercePPUAddress(addr);		
		return this.VM[addr];
	}

	PPU.prototype.writeByte = function(addr, val){
		addr = coercePPUAddress(addr);
		this.VM[addr] = val;
	}

	//Need extra logic to wrap a word at $3FFF

	//***IMPORTANT*** do NOT write words to mirror boundaries. A word written to $3FFF will wrap 
	//correctly (hi will be at $0), but words written to the boundaries of the inner mirrors,
	//namely $2FFF, $3FFF, and $3F1F will not wrap correctly!
	PPU.prototype.readWord = function(addr){
		var coercedAddr = addr % 0x4000;
		if(coercedAddr === 0x3FFF){
			var lobyte = this.VM.readByte(coercedAddr);
			var hibyte = this.VM.readByte(0);
			return lobyte + (hibyte << 8); 
		} else {
			return this.VM.readWord(coercedAddr);
		}
	}

	PPU.prototype.writeWord = function(addr, val){
		var coercedAddr = addr % 0x4000;
		if(coercedAddr === 0x3FFF){
			this.VM.writeByte(coercedAddr, val & 0xFF);
			this.VM.writeByte(0, (val & 0xFF00) >> 8);
		} else {
			this.VM.writeWord(coercedAddr, val);
		}
	}

	//Draws the contents of the vbuffer to the canvas
	PPU.prototype.presentBuffer = function(){
		this.ctx.putImageData(this._vbuffer, 0, 0);
	}

	//Write an RGBA pixel to this._vbuffer
	PPU.prototype.blitPixel = function(x, y, r, g, b, alpha, options){
		options = options || {};

		//Making the default destination this._vbData seems to break the reference to _vbuffer.data
		var destination = options.destination || this._vbuffer.data;

		var vIdx = this.cartesianToIdx(x, y);
		destination[vIdx] = r;
		destination[vIdx + 1] = g;
		destination[vIdx + 2] = b;
		//Catch if alpha === 0
		destination[vIdx + 3] = (typeof(alpha) === "undefined") ? 0xFF : alpha;
	}

	//Draw an 8x8 tile; used primarily for debugging.
	//Will NOT correctly draw to this.ctx!!!
	//Context must be an 8x8 canvas.
	//@buffer - the video buffer to write to
	//@address - the starting address in VRAM of the tile
	//@palette - an object containing indices into _NES_COLOR_PALETTE. Must have keys 1, 2, and 3
	PPU.prototype.blitTile = function(buffer, address, palette){
		//Ignore bits 6 and 7 of palette ID
		var universalBackgroundColorID = this.readByte(UNIVERSAL_BACKGROUND_ADDR) & 0x3F;
		var universalBackgroundColor = _NES_COLOR_PALETTE[universalBackgroundColorID];

 		for(var i = 0; i < 8; i++){
 			for(var j = 0; j < 8; j++){
 				var tmpPx = resolveTilePixel.call(this, address + i, BITMASKS[j]);

 				if(tmpPx === '00'){
 					buffer[(((i * 8) + j) * 4)] = universalBackgroundColor.r;
 					buffer[(((i * 8) + j) * 4) + 1] = universalBackgroundColor.g;
 					buffer[(((i * 8) + j) * 4) + 2] = universalBackgroundColor.b;
 					buffer[(((i * 8) + j) * 4) + 3] = OPAQUE;
 				} else {
 					var tmpColor = _NES_COLOR_PALETTE[palette[tmpPx]];

 					buffer[(((i * 8) + j) * 4)] = tmpColor.r;
 					buffer[(((i * 8) + j) * 4) + 1] = tmpColor.g;
 					buffer[(((i * 8) + j) * 4) + 2] = tmpColor.b;
 					buffer[(((i * 8) + j) * 4) + 3] = OPAQUE;
 				}
 			}
 		}
	}

	//Same as PPU#blitTile, except blits to this.ctx
	PPU.prototype.blitTileToCtx = function(x, y, address, palette, options){
		options = options || {};
		var universalBackgroundColorID = this.readByte(UNIVERSAL_BACKGROUND_ADDR) & 0x3F;
 		var UBC = _NES_COLOR_PALETTE[universalBackgroundColorID];
 		var blitProc = flipTypeProcMap[options.flipType] || blitTileNoFlip;

 		blitProc.call(this, x, y, address, palette, options, UBC);
	}

	var flipTypeProcMap = {
		'00': blitTileNoFlip,
		'01': blitTileFlipHorizontal,
		'10': blitTileFlipVertical,
		'11': blitTileFlipHorizontalAndVertical
	}

	PPU.prototype.blitNameTableBackgroundEntry = function(x, y, address, destination){
		var tileAddr = nameTableToTileAddress.call(this, address);
		var paletteID = retrieveNameTableAttributes.call(this, address);
		var paletteBaseAddr = baseBackgroundPaletteAddrMap[paletteID];

		var colorOne = (this.readByte(paletteBaseAddr)) & 0x3F, //Highest two bits are garbage
				colorTwo = (this.readByte(paletteBaseAddr + 1)) & 0x3F,
				colorThree = (this.readByte(paletteBaseAddr + 2)) & 0x3F;

		var currentPalette = {
			'01': colorOne,
			'10': colorTwo,
			'11': colorThree
		}

		this.blitTileToCtx(x, y, tileAddr, currentPalette, {destination: destination});
	}

	var baseBackgroundPaletteAddrMap = {
		0: BACKGROUND_PALETTE_ZERO,
		1: BACKGROUND_PALETTE_ONE,
		2: BACKGROUND_PALETTE_TWO,
		3: BACKGROUND_PALETTE_THREE
	};

	PPU.prototype.blitNameTable = function(destination){
		var nameTableAddr = this.REGISTERS.nameTableBaseAddr;
		for(var i = 0; i < NAMETABLE_SIZE_Y; i++){
			for(var j = 0; j < NAMETABLE_SIZE_X; j++){
				this.blitNameTableBackgroundEntry(j * 8, i * 8, nameTableAddr, destination);
				nameTableAddr += 1;
			}
		}
	}

	//@spriteID - ID of 4-byte sprite info in OAM, range 0 to 63
	PPU.prototype.blitSprite = function(spriteID, destination){
		var spriteAddr = spriteID * 4;
		var xPos = this.OAM[spriteAddr + 3];
		//Sprite Y is stored minus 1
		var yPos = (this.OAM[spriteAddr] + 1) & 0xFF;
		//Get absolute address of tile in VRAM
		if(this.REGISTERS.spriteSizeIs8x8){
			var tileAddr = (this.OAM[spriteAddr + 1] * 16) + this.REGISTERS.spritePatternTableOffset;
		} else {
			var rawTileAddr = this.OAM[spriteAddr + 1];
			//Even address means use pattern table at $1000
			var tmpOffset = (rawTileAddr & 0x01) ? 0x1000 : 0;
			var tileAddr = (((rawTileAddr & 0xFE) >> 1) * 16) + tmpOffset;
		}

		var spriteAttrs = this.OAM[spriteAddr + 2];

		var paletteID = spriteAttrs & 0x03;
		var paletteBaseAddr = baseSpritePaletteAddrMap[paletteID];

		var colorOne = (this.readByte(paletteBaseAddr)) & 0x3F,
				colorTwo = (this.readByte(paletteBaseAddr + 1)) & 0x3F,
				colorThree = (this.readByte(paletteBaseAddr + 2)) & 0x3F;

		var currentPalette = {
			'01': colorOne,
			'10': colorTwo,
			'11': colorThree
		}

		//0 means in FRONT of background
		var isPriority = (spriteAttrs & 0x20) ? false : true;
		var flipHorizontal = (spriteAttrs & 0x40) ? true : false;
		var flipVertical = (spriteAttrs & 0x80) ? true : false;

		var flipType = generateFlipType.call(this, flipHorizontal, flipVertical);
		var isSpriteZero = (spriteID === 0) ? true : false;

		var options = {
				isSprite: true,
				isSpriteZero: isSpriteZero,
				isPriority: isPriority,
				flipType: flipType,
				destination: destination
			}

		if(this.REGISTERS.spriteSizeIs8x8){
			this.blitTileToCtx(xPos, yPos, tileAddr, currentPalette, options);
		} else {
			//blit top tile, then bottom tile for 8x16, but reverse order if flipping vertically
			if(flipVertical){
				var topTileAddr = tileAddr + 16;
				var bottomTileAddr = tileAddr;
			} else {
				var topTileAddr = tileAddr;
				var bottomTileAddr = tileAddr + 16;
			}

			this.blitTileToCtx(xPos, yPos, topTileAddr, currentPalette, options);
			this.blitTileToCtx(xPos, yPos + 8, bottomTileAddr, currentPalette, options);
		}
	}

	var baseSpritePaletteAddrMap = {
		0: SPRITE_PALETTE_ZERO,
		1: SPRITE_PALETTE_ONE,
		2: SPRITE_PALETTE_TWO,
		3: SPRITE_PALETTE_THREE
	};

	//In general, the CPU renders 1 pixel per PPU clock cycle, which is 3x CPU clock speed
	//@shouldCall - for efficiency's sake, only run the monitor procedure after IMMEDIATELY
	//after a CPU cycle; not after another PPU tick (the monitor proc only cares about CPU writes)
	PPU.prototype.tick = function(shouldCall){
		if (shouldCall){
			ppuMonitorProc.call(this);
		}
		incrementCounters.call(this);
	}

	PPU.prototype.clearScreen = function(){
		var vbLimit = this._vbData.length;

		for(var i = 0; i < vbLimit; i += 4){
			this._vbuffer.data[i] = 0;
			this._vbuffer.data[i + 1] = 0;
			this._vbuffer.data[i + 2] = 0;
			this._vbuffer.data[i + 3] = 0xFF;
		}

		this.presentBuffer();
	}


/************************VBUFFER MANIPULATION*********************/
	PPU.prototype.cartesianToIdx = function(x, y){
		return ((y * this.canvasEl.width) + x) * 4;
	}

	//Takes an address in VRAM, then adds the desired bit at address and address + 8 to get
	//the low two bits of a pixel nibble

	function resolveTilePixel(address, mask){
		var lobyte = this.readByte(address);
		var lobit = (lobyte & mask) ? '1' : '0';

		var hibyte = this.readByte(address + 8);
		var hibit = (hibyte & mask) ? '1' : '0';

		return hibit + lobit;
	}

	//Takes the address of a name table entry in VRAM, and returns the address
	//of the corresponding pattern table entry in VRAM
	function nameTableToTileAddress(nameTableAddr){
		var tileID = this.readByte(nameTableAddr) * 16; //New tile every 16 bytes
		var resolvedAddress = tileID + this.REGISTERS.patternTableOffset;
		return resolvedAddress;
	}

	//Returns the index of which palette to use (in range 0 to 3)
	function retrieveNameTableAttributes(nameTableAddr){
		//First, we coerce the offset of the name table entry to an index into the attribute table
		//Since 32 tiles are in 1 row, and each byte maps to 4x4 tiles, every 128 tiles maps to
		//one row of the attribute table
		var entryOffset = nameTableAddr - this.REGISTERS.nameTableBaseAddr;
		var attribOffset = ((Math.floor(entryOffset / 128)) * 8) + Math.floor(((entryOffset % 32) / 4));
		var attribAddr = this.REGISTERS.nameTableBaseAddr + 0x3C0 + attribOffset;
		var attribByte = this.readByte(attribAddr);

		//Then, we have to figure out which quadrant the entry will use:
		//We check if bit 6 is set (tile is on the bottom), and if bit 1 is set (tile is on the right).
		//Using the result, we can determine how to mask the byte we retrieved from the attribute table.
		var locationInfo = entryOffset & 0x42; //01000010
		var tmpInfo = locationMap[locationInfo];
		return (attribByte & tmpInfo.mask) >> tmpInfo.shift;
	}

	var locationMap = {};
	locationMap[0x00] = {mask: 0x03, shift: 0}; //Top left
	locationMap[0x02] = {mask: 0x0C, shift: 2}; //Top right
	locationMap[0x40] = {mask: 0x30, shift: 4}; //Bottom left
	locationMap[0x42] = {mask: 0xC0, shift: 6}; //Bottom right


	function generateFlipType(flipHorizontal, flipVertical){
		var lobit = (flipHorizontal) ? '1' : '0';
		var hibit = (flipVertical) ? '1': '0';
		return hibit + lobit;
	}

	//For uber-DRYness
	//TODO: map some of this logic to a table
	function blitTilePixel(x, y, address, palette, options, UBC, i, j, xOffset, yOffset){
		var tmpPx = resolveTilePixel.call(this, address + i, BITMASKS[j]);

		if(tmpPx === '00'){
			//If we are blitting a sprite, we let the background show through. Otherwise, use the UBC
			if(!(options.isSprite)){
				//TODO: May need to mark these as OPAQUE_UBC, if multiplexer needs to know
				//to priority 0 sprites on top of it
				this.blitPixel(x + xOffset, (y + yOffset), UBC.r, UBC.g, UBC.b, OPAQUE, options);
			} 
			//If it is a transparent sprite pixel, don't draw anything

		} else {
			var tmpColor = _NES_COLOR_PALETTE[palette[tmpPx]];
			if (options.isSprite && options.isSpriteZero && !(options.isPriority)){
				//We need to know if it is sprite zero, but also if we draw it behind the background
				this.blitPixel(x + xOffset, (y + yOffset), tmpColor.r, tmpColor.g, tmpColor.b, IS_SPRITE_ZERO_BEHIND_BACKGROUND, options);
			} else if (options.isSprite && options.isSpriteZero){
				//We need to track where the opaque pixels of sprite 0 are for collision detection
				this.blitPixel(x + xOffset, (y + yOffset), tmpColor.r, tmpColor.g, tmpColor.b, IS_SPRITE_ZERO, options);
			} else if (!(options.isSprite)){ 
				//We also need to know where opaque backgrounds are for collision
				this.blitPixel(x + xOffset, (y + yOffset), tmpColor.r, tmpColor.g, tmpColor.b, IS_OPAQUE_BACKGROUND, options);			
			} else if (options.isSprite && (!(options.isPriority))){
				//Give a magic number to the opacity of sprites that go behind the background
				//TODO: May not want to have this override already drawn sprites when reloading 
				//sprite workspace
				this.blitPixel(x + xOffset, (y + yOffset), tmpColor.r, tmpColor.g, tmpColor.b, BEHIND_BACKGROUND, options);
			} else {
				this.blitPixel(x + xOffset, (y + yOffset), tmpColor.r, tmpColor.g, tmpColor.b, OPAQUE, options);
			}
		}
	}

	function blitTileNoFlip(x, y, address, palette, options, UBC){
		var xOffset = 0, yOffset = 0;
		for(var i = 0; i < 8; i++){
			xOffset = 0;
 			for(var j = 0; j < 8; j++){
 				blitTilePixel.call(this, x, y, address, palette, options, UBC, i, j, xOffset, yOffset);
 				xOffset++;
 			}
 			yOffset++;
 		}
	}

	//Manipulations of the 'i' and 'j' counters make the flip magic happen.
	//TODO: DRY these up a bit (if possible)

	function blitTileFlipHorizontal(x, y, address, palette, options, UBC){
		var xOffset = 0, yOffset = 0;
		for(var i = 0; i < 8; i++){
			xOffset = 0;
 			for(var j = 7; j > -1; j--){
 				blitTilePixel.call(this, x, y, address, palette, options, UBC, i, j, xOffset, yOffset);
 				xOffset++;
 			}
 			yOffset++;
 		}
	}

	function blitTileFlipVertical(x, y, address, palette, options, UBC){
		var xOffset = 0, yOffset = 0;
		for(var i = 7; i > -1; i--){
			xOffset = 0;
 			for(var j = 0; j < 8; j++){
 				blitTilePixel.call(this, x, y, address, palette, options, UBC, i, j, xOffset, yOffset);
 				xOffset++;
 			}
 			yOffset++;
 		}
	}

	function blitTileFlipHorizontalAndVertical(x, y, address, palette, options, UBC){
		var xOffset = 0, yOffset = 0;
		for(var i = 7; i > -1; i--){
			xOffset = 0;
 			for(var j = 7; j > -1; j--){
 				blitTilePixel.call(this, x, y, address, palette, options, UBC, i, j, xOffset, yOffset);
 				xOffset++;
 			}
 			yOffset++;
 		}
	}

	//Makes all pixels TRANSPARENT
	function clearInternalWorkspace(workspaceRef){
		var LIMIT = workspaceRef.length;
		for(var i = 0; i < LIMIT; i += 4){
			workspaceRef[i] = 0;
			workspaceRef[i + 1] = 0;
			workspaceRef[i + 2] = 0;
			workspaceRef[i + 3] = TRANSPARENT;
		}
	}


/************************SCANLINE LOGIC*********************/
//Don't draw anything; for Vblank mainly
	function renderDummy(){
		//TODO: put memory fetching logic here
	}

	function incrementCounters(){
		if(this.scanlineCounter > 0 && this.scanlineCounter < 241){
			//executeScanlineTick.call(this);
		}

		if(this.pixelCounter > 340){
			this.pixelCounter = 0;
			this.scanlineCounter++;

			if(this.scanlineCounter > 261){
				this.scanlineCounter = 0;
				for(var i = 63; i > -1; i--){
					this.blitSprite(i, this.IspriteRAM);
				}
			} else if(this.scanlineCounter === 0){
				//draw sprites
				for(var i = 63; i > -1; i--){
					this.blitSprite(i, this.IspriteRAM);
				}
			} else if (this.scanlineCounter === 1){
				//Turn off vblank flag
				this.MM[PPUSTATUS] &= 0x7F;
			} else if(this.scanlineCounter === 241){
				if(this.REGISTERS.shouldGenerateNMI){
					this.refBus.CPU.postInterrupt(INTERRUPT_NMI);
				}
				//Set vblank flag
				this.MM[PPUSTATUS] |= 0x80;
				/*************/
				this.blitNameTable();
				for(var i = 63; i > -1; i--){
					
					this.blitSprite(i);
				}
				/********************/
				this.presentBuffer();
			}

		} else {
			this.pixelCounter++;
		}
	}

	function executeScanlineTick(){
		//var tmpPhase = this.scanlineCounter;
		//SCANLINE_PHASE_PROC_MAP[this.scanlineCounter].call(this);
		if(this.pixelCounter < 256){
			this.fetchResolveBlitPixel();
		}
	}

	//The process of rendering a scanline takes 341 PPU cycles. 

	//The process is not emulated exactly here, as there is no way to emulate all
	//the circuitry efficiently.

	//The first 256 ticks on the scanline draw a pixel to the screen.
	//A pixel is taken from name table and sprite internal buffers,
	//run through a multiplexer to resolve which pixel should be on top
	//and set the collision flag if necessary, then the pixel is drawn to
	//the screen.

	PPU.prototype.fetchResolveBlitPixel = function(){
		var ntPixel = this.getPixelNT();
		var sprPixel = this.getPixelSPR();

		var resolvedPixel = this._multiplex(ntPixel, sprPixel);

		this.blitPixel(this.scanlineCounter, 
									 this.scanlineOffsetY,
									 resolvedPixel.r,
									 resolvedPixel.g,
									 resolvedPixel.b,
									 OPAQUE);
	}

	//We don't have to do anything here; the 2C02 performs various fetches from memory
	//during hBlank, but since fetchResolveBlitPixel does this for us, we don't 
	//have to do anything.
	function hBlankProc(){
		//Let the emulator rest and relax ;)
	}

	//The final tick reloads the sprite workspace, which is similar to the actual behavior of the 
	//2C02
	function endHBlank(){
		for(var i = 63; i > -1; i--){

		}
	}

	//After the first 256 ticks, we spend the remaining cycles -1 in hBlank
	//The actual 2C02 spends these cycles

	PPU.prototype.getPixelNT = function(){
		if(!this.REGISTERS.shouldShowBackground){
			return {r: 0, g: 0, b: 0, a: 0};
		}

		var ntInfo = getCorrectNT.call(this);
		var baseIdx = this.cartesianToIdx(ntInfo.x, ntInfo.y);
		var tmpRAMref = ntInfo.nt;
		var r = tmpRAMref[baseIdx];
		var g = tmpRAMref[baseIdx + 1];
		var b = tmpRAMref[baseIdx + 2];
		var a = tmpRAMref[baseIdx + 3];

		return {r: r, g: g, b: b, a: a};
	}

	//Big function inlined for speed
	function getCorrectNT(){
		var activeNT = this.REGISTERS.nameTableBaseAddr,
				result, currentNT,
				pastXBoundary = (this.pixelCounter + this.REGISTERS.fineXOffset) > 255,
				pastYBoundary = ((this.scanlineCounter-1) + this.REGISTERS.fineYOffset) > 239,

				currentX = (this.pixelCounter + this.REGISTERS.fineXOffset) & 0xFF,
				currentY = ((this.scanlineCounter-1) + this.REGISTERS.fineYOffset) & 0xFF,

				nameTableWorkspaceA = this.nameTableWorkspaceA.data,
				nameTableWorkspaceB = this.nameTableWorkspaceB.data,
				nameTableWorkspaceC = this.nameTableWorkspaceC.data,
				nameTableWorkspaceD = this.nameTableWorkspaceD.data;

		//wrap x, extend y
		if(this.REGISTERS.mirroringType === MIRROR_HORIZONTAL){

			switch(activeNT){
				case 0x2000:
					currentNT = (pastYBoundary) ? nameTableWorkspaceC : nameTableWorkspaceA;
					break;

				case 0x2400:
					currentNT = (pastYBoundary) ? nameTableWorkspaceC : nameTableWorkspaceA;
					break;

				case 0x2800:
					currentNT = (pastYBoundary) ? nameTableWorkspaceA : nameTableWorkspaceC;
					break;

				case 0x2C00:
					currentNT = (pastYBoundary) ? nameTableWorkspaceA : nameTableWorkspaceC;
					break;
			}

			//extend x, wrap y
		} else if (this.REGISTERS.mirroringType === MIRROR_VERTICAL) {

			switch(activeNT){
				case 0x2000:
					currentNT = (pastXBoundary) ? nameTableWorkspaceB : nameTableWorkspaceA;
					break;

				case 0x2400:
					currentNT = (pastXBoundary) ? nameTableWorkspaceA : nameTableWorkspaceB;
					break;

				case 0x2800:
					currentNT = (pastXBoundary) ? nameTableWorkspaceB : nameTableWorkspaceA;
					break;

				case 0x2C00:
					currentNT = (pastXBoundary) ? nameTableWorkspaceA : nameTableWorkspaceB;
					break;
			}

		} else { //TODO: 4 way & no mirroring

		}

		return {x: currentX, y: currentY, nt: currentNT};
	}

	PPU.prototype.getPixelSPR = function(){
		// var baseIdx = cartesianToIdx.call(this, this.scanlineCounter, this.scanlineOffsetY);
		// var r = this._INTERNALS.spriteWorkspace.data[baseIdx];
		// var g = this._INTERNALS.spriteWorkspace.data[baseIdx + 1];
		// var b = this._INTERNALS.spriteWorkspace.data[baseIdx + 2];
		// var a = this._INTERNALS.spriteWorkspace.data[baseIdx + 3];

		// return {r: r, g: g, b: b, a: a};

		//var baseIdx = cartesianToIdx.call(this, this.scanlineCounter, this.scanlineOffsetY);
		if(!this.REGISTERS.shouldShowSprites){
			return {r: 0, g: 0, b: 0, a: 0};
		}

		var baseIdx = this.cartesianToIdx(this.pixelCounter, this.scanlineCounter);
		var tmpRAMref = this.IspriteRAM;
		var r = tmpRAMref[baseIdx];
		var g = tmpRAMref[baseIdx + 1];
		var b = tmpRAMref[baseIdx + 2];
		var a = tmpRAMref[baseIdx + 3];

		return {r: r, g: g, b: b, a: a};
	}

	//Decides which pixel should be drawn, and sets collision flag if applicable
	PPU.prototype._multiplex = function(ntPixel, sprPixel){
		if(sprPixel.a === OPAQUE){
			return sprPixel;
		} else if (sprPixel.a === BEHIND_BACKGROUND){
			return ntPixel;
		}	else if (ntPixel.a === IS_OPAQUE_BACKGROUND && (sprPixel.a === IS_SPRITE_ZERO || sprPixel.a === IS_SPRITE_ZERO_BEHIND_BACKGROUND)){ 
			//Set collision flag!
			return handleSpriteCollision.call(this, ntPixel, sprPixel);
		}	else {
			return ntPixel;
		}
	}

	function handleSpriteCollision(ntPixel, sprPixel){
		this.MM[PPUSTATUS] |= 0x40;
		if(sprPixel.a === IS_SPRITE_ZERO){
			return sprPixel;
		} else {
			return ntPixel;
		}
	}

	function beginVBlank(){
		this.scanlineOffsetY = 0;

		// //Reload sprite workspace
		// for(var i = SPRITE_LIMIT; i > 0; i--){

		// }


	}

	function endVblank(){
		//Reload sprite workspace
		for(var i = 63; i > 0; i--){
			this.blitSprite(i, this.IspriteRAM);
		}
	}

	/************************REGISTER I/O*********************/

	

	//Listens for writes to specific addresses. Should be checked at the 
	//start of each tick.
	function ppuMonitorProc(){
		// var tmpProc = PPU_MONITOR_PROC_MAP[this.refBus.lastMMwrite]
		// if(tmpProc){
		// 	tmpProc.call(this);
		// }

		var r = this.refBus.lastMMread;
		var w = this.refBus.lastMMwrite;

		var cr = r & 0xF000;
		var cw = w & 0xF000;

		if((cr === 0x2000)){
			switch(r){
				case 0x2002:
					//Reset bit 7 of PPUSTATUS if it was just read from.
					//TODO: documentation is unclear if this also resets PPUSCROLL and PPUADDR?			
					this.MM[0x2002] = this.MM[0x2002] & 0x7F;
					//Reset PPU toggle
					this.REGISTERS.usePPUADDRHI = true;
					this.REGISTERS.usePPUSCROLLX = true;
					break;

				case 0x2007:
					//A read to PPUDATA needs to be handled as a special case

					var coercedAddr = this.REGISTERS.ppuAddr & 0x3FFF;
					var returnVal;

					//Return the data in the VRAM buffer, then update the VRAM buffer
					if (coercedAddr < 0x3F00){
						returnVal = this.REGISTERS.ppudataBuff;
						this.REGISTERS.ppudataBuff = this.readByte(this.REGISTERS.ppuAddr);
					} else {
						//The exception is a palette entry, which is returned immediately
						returnVal = this.readByte(this.REGISTERS.ppuAddr);
						this.REGISTERS.ppudataBuff = returnVal;
					}

					//Increment PPU's VRAM address by 1 or 32 on a read to PPUDATA
					this.REGISTERS.ppuAddr += this.REGISTERS.ppuIncr;
					this.REGISTERS.ppuAddr &= 0xFFFF;

					return returnVal;
					break;
			}
		}

		if((cw === 0x2000) || (cw === 0x4000)){
			switch(w){
				case PPUCTRL: 
					this.checkPPUCTRL();
					break;
				case PPUMASK:
					this.checkPPUMASK();
					break;
				case OAMDATA:
					this.readOAMDATA();
					break;
				case PPUSCROLL:
					this.checkPPUSCROLL();
					break;
				case PPUADDR:
					this.checkPPUADDR();
					break;
				case PPUDATA:
					this.checkPPUDATA();
					break;
				case OAMDMA:
					this.postDMA();
					break;
			}
		}

		//Make sure we do not erroneously respond to it again next cycle; take value off the"bus"
		this.refBus.lastMMwrite = null;
		this.refBus.lastMMread = null;
	}

	PPU.prototype.checkPPUCTRL = function(){
		var ppuctrlVal = this.MM[PPUCTRL];

		this.REGISTERS.nameTableBaseAddr = resolveNameTableBaseAddr(ppuctrlVal);

		this.REGISTERS.spriteSizeIs8x8 = (ppuctrlVal & 0x20) ? false : true;
		this.REGISTERS.patternTableOffset = (ppuctrlVal & 0x10) ? 0x1000 : 0;
		this.REGISTERS.spritePatternTableOffset = (ppuctrlVal & 0x08) ? 0x1000 : 0;
		this.REGISTERS.ppuIncr = (ppuctrlVal & 0x04) ? 32 : 1;
		this.REGISTERS.shouldGenerateNMI = (ppuctrlVal & 0x80) ? true : false;
	}

	PPU.prototype.checkPPUMASK = function(){
		var ppumaskVal = this.MM[PPUMASK];

		this.REGISTERS.shouldShowLeftmostBackground = (ppumaskVal & 0x02) ? true : false;
		this.REGISTERS.shouldShowLeftmostSprites = (ppumaskVal & 0x04) ? true : false;
		this.REGISTERS.shouldShowBackground = (ppumaskVal & 0x08) ? true : false;
		this.REGISTERS.shouldShowSprites = (ppumaskVal & 0x10) ? true : false;
	}

	PPU.prototype.checkPPUSCROLL = function(){
		var ppuscrollVal = this.MM[PPUSCROLL];
		var shouldChangeX = this.REGISTERS.usePPUSCROLLX;

		if(shouldChangeX){
			this.REGISTERS.fineXOffset = ppuscrollVal;
		} else {
			this.REGISTERS.fineYOffset = ppuscrollVal;
		}

		this.REGISTERS.usePPUSCROLLX = !shouldChangeX;
	}

	PPU.prototype.checkPPUADDR = function(){
		var ppuaddrVal = this.MM[PPUADDR];
		var shouldWriteHI = this.REGISTERS.usePPUADDRHI;

		if(shouldWriteHI){
			//The masking w/ 0xFF is to clear out the bits in the number hi
			this.REGISTERS.ppuAddr = (this.REGISTERS.ppuAddr & 0xFF) | (ppuaddrVal << 8);
		} else {
			this.REGISTERS.ppuAddr = (this.REGISTERS.ppuAddr & 0xFF00) | ppuaddrVal;
		}


		this.REGISTERS.usePPUADDRHI = !shouldWriteHI;
	}

	PPU.prototype.checkPPUDATA = function(){
		var ppuaddrVal = this.REGISTERS.ppuAddr;
		var ppudataVal = this.MM[PPUDATA];
		var currentNT, currentX, currentY;

		currentX = ppuaddrVal & 0x1F;
		currentY = Math.floor((ppuaddrVal & 0x3FF) / 30);

		switch(this.nameTableBaseAddr){
			case 0x2000:
				currentNT = this.nameTableWorkspaceA.data;
				break;
			case 0x2400:
				currentNT = this.nameTableWorkspaceB.data;
				break;
			case 0x2800:
				currentNT = this.nameTableWorkspaceC.data;
				break;
			case 0x2C00:
				currentNT = this.nameTableWorkspaceD.data;
				break;
		}

		this.writeByte(ppuaddrVal, ppudataVal);

		this.REGISTERS.ppuAddr += this.REGISTERS.ppuIncr;

		this.blitNameTableBackgroundEntry(currentX, currentY, ppuaddrVal, currentNT);
	}

	function resolveNameTableBaseAddr(value){
		var lobit = (value & 0x01) ? 1 : 0;
		var hibit = (value & 0x02) ? 2 : 0;

		return nameTableBaseAddrDict[hibit + lobit];
	}

	var nameTableBaseAddrDict = [0x2000, 0x2400, 0x2800, 0x2C00];

	PPU.prototype.readOAMDATA = function(){
		var dataToCopy = this.MM[OAMDATA];
		var destination = this.MM[OAMADDR];
		this.OAM[destination] = dataToCopy;
		this.MM[OAMADDR] += 1;
	}

	PPU.prototype.postDMA = function(){
		var dmaStartAddr = this.MM[OAMDMA] * 0x100;
		this.refBus.CPU.startDMA(dmaStartAddr);

	}

	//Implements PPU mirroring within range
	function coercePPUAddress(addr){
		//Mirror $0 to $3FFF
		addr &= 0x3FFF; //Mask to 14 bits; same as addr %= 4000

		//Mirror $2000 to $2EFF
		if(addr > 0x2FFF && addr < 0x3F00){
			return addr - 0x1000;
		} else if (addr > 0x3EFF && addr < 0x4000){
			addr = (addr & 0x1F) + 0x3F00; //Don't return yet; this area is mirrored even further...
			var fineMirror = finePPUMirrors[addr];

			if(fineMirror){
				return fineMirror;
			} else {
				return addr;
			}

		} else {
			return addr;
		}
	}

	//These 4 addresses are mirrors of the address 0x10 bytes lower
	var finePPUMirrors = {};
	finePPUMirrors[0x3F10] = 0x3F00;
	finePPUMirrors[0x3F14] = 0x3F04;
	finePPUMirrors[0x3F18] = 0x3F08;
	finePPUMirrors[0x3F1C] = 0x3F0C;

})();