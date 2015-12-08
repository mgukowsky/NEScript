//The main emulator which ties everything together

(function(){
	if(typeof(NEScript) === "undefined"){
		window.NEScript = {};
	}

	/*******************************CONSTANTS*******************************/
	var NTSC_CPU_RATE = 1789773; //Ya better have a fast browser ;)


	/******************************INTERFACE*********************************/
	var Emulator = NEScript.Emulator = function(){
		this.CPU = new NEScript.CPU();
		this.PPU = new NEScript.PPU(this.CPU._mainMemory, this.CPU);
		this.Controller = new NEScript.Controller(this.CPU._mainMemory);
		this.Mapper = new NEScript.Mapper(this.CPU._mainMemory, this.PPU._VRAM, this.Controller);
	}

	//Should be invoked after the user loads a *.nes file into the browser.
	//@raw - a Uint8Array filled with the contents of a ROM
	Emulator.prototype.startROM = function(raw){
		this.Controller.connect();
		this.currentROM = new NEScript.ROM(raw);
		this.Mapper.loadROM(this.currentROM);

		//Tell PPU how we will be mirroring by using the evaluated constant from the Mapper
		this.PPU.REGISTERS.mirroringType = this.Mapper.LOADED_MIRROR_TYPE;

		//Point PC to the appropriate address
		this.CPU._regPC[0] = this.CPU.readWord(NEScript.VECTOR_RESET);
		simpleLoop.call(this);

		// c1 = document.getElementById("vram-visualizer");

		// c1.width = 8;
		// c1.height = 8;

		// c2 = c1.getContext("2d");

		// c2.imageSmoothingEnabled = false;
  //   c2.mozImageSmoothingEnabled = false;
  //   c2.webkitImageSmoothingEnabled = false;
  //   c2.msImageSmoothingEnabled = false;
	
		// v1 = c2.createImageData(8, 8);
		// this.PPU.blitTile(v1.data, 0, {1: 0x00, 2: 0x10, 3: 0x20});

		// c2.putImageData(v1, 0, 0);

		// this.PPU.blitTileToCtx(0, 0, 0x1010, {'01': 0x00, '10': 0x10, '11': 0x20})
		// this.PPU.presentBuffer();
		// for(var i = 0; i < 0x3C0; i++){
		// 	this.PPU.writeByte(0x2000 + i, 1);
		// }

		// for(var i = 0; i < 0x40; i++){
		// 	this.PPU.writeByte(0x23C0 + i, parseInt("11100100", 2));
		// }

		// this.PPU._OAM.writeByte(0, 255);
		// this.PPU._OAM.writeByte(1, parseInt("00000101", 2));
		// this.PPU._OAM.writeByte(2, parseInt("10000000", 2));
		// this.PPU._OAM.writeByte(3, 4);

		// this.CPU.writeByte(0x2000, parseInt("00111000", 2));
		// this.PPU.writeByte(0x3F00, 0x2F);
		// this.PPU.writeByte(0x3F01, 0x23);
		// this.PPU.writeByte(0x3F02, 0x2C);
		// this.PPU.writeByte(0x3F03, 0x2E);
		// this.PPU.writeByte(0x3F05, 0x24);
		// this.PPU.writeByte(0x3F06, 0x25);
		// this.PPU.writeByte(0x3F07, 0x26);
		// this.PPU.writeByte(0x3F09, 0x27);
		// this.PPU.writeByte(0x3F0A, 0x28);
		// this.PPU.writeByte(0x3F0B, 0x29);
		// this.PPU.writeByte(0x3F0D, 0x2A);
		// this.PPU.writeByte(0x3F0E, 0x2B);
		// this.PPU.writeByte(0x3F0F, 0x2D);
		// this.PPU.writeByte(0x3F11, 0x16);
		// this.PPU.writeByte(0x3F12, 0x16);
		// this.PPU.writeByte(0x3F13, 0x16);
		// this.PPU.tick();

		// this.PPU.blitNameTable();
		// this.PPU.blitSprite(0);
		// this.PPU.presentBuffer();

	}

	Emulator.prototype.ejectROM = function(){
		if(typeof(this._mainLoopID) === "undefined"){
			throw new Error("NEScript is not currently running")
		} else {
			clearInterval(this._mainLoopID);
			this._mainLoopID = undefined;
			this.CPU.totalReset();
			this.PPU.totalReset();
			this.Controller.disconnect();
		}
	}


	/******************************IMPLEMENTATION*********************************/
	function simpleLoop(){
		NEScript.IS_RUNNING = true;
		var cpuCounter, ppuCounter;

		//Have to use setInterval, b/c a while loop would block on the page.
		//Could use a worker, but we would lose access to the global namespace, and PPU 
		//would lose the ability to manipulate the DOM and update the canvas.
		//Downside is that a backlog within the callback WILL block on the page :/
		this._mainLoopID = setInterval(function(){
			if(NEScript.IS_RUNNING){
				//Execute x CPU cycles every second, where x = CPU clock speed in Hz
				for(cpuCounter = 0; cpuCounter < Math.floor(NTSC_CPU_RATE / 20); cpuCounter++){
				//Execute next instruction, then do 3 PPU cycles for every cycle the CPU took
					var ppuCycles = this.CPU.executeNext();
					//Check for R/W to registers before invoking the PPU
					this.Mapper.monitorProc();
					//Only have the PPU check on the first tick of the group
					this.PPU.tick(true);
					for(ppuCounter = 1; ppuCounter < ppuCycles * 3; ppuCounter++){
						this.PPU.tick(false);
					}
				}
			}
			console.log("completed main loop pass");
		}.bind(this), 50) //Make this a smaller number so we don't block the main event queue as much
	}

})()