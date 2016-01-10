//The main emulator which ties everything together

(function(){
	if(typeof(NEScript) === "undefined"){
		window.NEScript = {};
	}

	/*******************************CONSTANTS*******************************/
	var NTSC_CPU_RATE = 1789773; //Ya better have a fast browser ;)


	/******************************INTERFACE*********************************/
	var Emulator = NEScript.Emulator = function(){
		var Bus = this.Bus = new NEScript.Bus();
		this.CPU = new NEScript.CPU(Bus);
		this.PPU = new NEScript.PPU(Bus);
		this.Controller = new NEScript.Controller(Bus);
		this.Mapper = new NEScript.Mapper(Bus);

		Bus.connect(this.CPU, this.PPU, this.Controller, this.Mapper);
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
		this.CPU.regPC = this.CPU.MM[NEScript.VECTOR_RESET] | ((this.CPU.MM[NEScript.VECTOR_RESET+1]) << 8);
		simpleLoop.call(this);

		// this.CPU._regPC[0] = 0xC000;
		// this.CPU._regs[4] = 0xFD;
		// this.CPU.pToFlags(0x24);
		// var LIMIT = TESTDATA.length

		// for(var i = 0; i < LIMIT; i++){
		// 	var tmp = TESTDATA[i];
		// 	if(i === 3347){
		// 		this.CPU.executeNext();
		// 		//this.CPU.popWord();
		// 		this.CPU._regPC[0] = 0xF9AA
		// 		console.log(this.CPU.readByte(0xF9AA).toString(16))
		// 		console.log(this.CPU.readByte(0xF9AB).toString(16))
		// 		console.log(this.CPU._regPC[0].toString(16))
		// 		console.log(this.CPU.readWord(this.CPU._regs[4] + 0x100 - 1).toString(16))
		// 		continue;
		// 	}
		// 	if(i === 3348 || i === 3349){
		// 		this.CPU.executeNext();
		// 		console.log(this.CPU._regPC[0].toString(16))
		// 		continue;
		// 	}

		// 	if(i === 5003 || i === 5004 || i === 5005){
		// 		this.CPU._regPC[0] += 2
		// 		continue
		// 	}

		// 	if(i > 5003){
		// 		console.log("i: " + i)
		// 		console.log(this.CPU._regPC[0].toString(16))
		// 	}


		// 	if(this.CPU._regPC[0] !== tmp.PC){
		// 		throw new Error("Wrong PC counter " + this.CPU._regPC[0].toString(16) + " at line " + i + "; should be " + tmp.PC.toString(16));
		// 	}
		// 	if(this.CPU._regs[0] !== tmp.A){
		// 		throw new Error("Wrong A " + this.CPU._regs[0].toString(16) + " at line " + i + "; should be " + tmp.A.toString(16));
		// 	}
		// 	if(this.CPU._regs[1] !== tmp.X){
		// 		throw new Error("Wrong X " + this.CPU._regs[1].toString(16) + " at line " + i + "; should be " + tmp.X.toString(16));
		// 	}
		// 	if(this.CPU._regs[2] !== tmp.Y){
		// 		throw new Error("Wrong Y " + this.CPU._regs[2].toString(16) + " at line " + i + "; should be " + tmp.Y.toString(16));
		// 	}
		// 	if(this.CPU.flagsToP() !== tmp.P){
		// 		throw new Error("Wrong P " + this.CPU.flagsToP().toString(16) + " at line " + i + "; should be " + tmp.P.toString(16));
		// 	}
		// 	if(this.CPU._regs[4] !== tmp.SP){
		// 		throw new Error("Wrong SP " + this.CPU._regs[4].toString(16) + " at line " + i + "; should be " + tmp.SP.toString(16));
		// 	}
		// 	// if(this.CPU._regPC[0] === 0xc7eb){
		// 	// 	debugger
		// 	// }
		// 	this.CPU.executeNext();
		// }
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
		var LIMIT = Math.floor(NTSC_CPU_RATE / 20);
		this._mainLoopID = setInterval(function(){
			if(NEScript.IS_RUNNING){
				//Execute x CPU cycles every second, where x = CPU clock speed in Hz
				for(cpuCounter = 0; cpuCounter < LIMIT; ){
				//Execute next instruction, then do 3 PPU cycles for every cycle the CPU took
					var ppuCycles = this.CPU.executeNext();

					//Note that the actual instruction takes multiple cycles
					cpuCounter += ppuCycles;

					//Check for R/W to registers before invoking the PPU
					this.Mapper.monitorProc();
					this.Controller.tick();
					//Only have the PPU check on the first tick of the group
					this.PPU.tick(true);
					var PPU_LIMIT = ppuCycles * 3;
					for(ppuCounter = 1; ppuCounter < PPU_LIMIT; ppuCounter++){
						this.PPU.tick(false);
					}
				}
			}
			console.log("completed main loop pass");
		}.bind(this), 50) //Make this a smaller number so we don't block the main event queue as much
	}

	Emulator.prototype.makePass = function(){
		var LIMIT = Math.floor(NTSC_CPU_RATE / 20);
		if(NEScript.IS_RUNNING){
			//Execute x CPU cycles every second, where x = CPU clock speed in Hz
			for(cpuCounter = 0; cpuCounter < LIMIT; cpuCounter++){
			//Execute next instruction, then do 3 PPU cycles for every cycle the CPU took
				var ppuCycles = this.CPU.executeNext();
				//Check for R/W to registers before invoking the PPU
				this.Mapper.monitorProc();
				//Only have the PPU check on the first tick of the group
				this.PPU.tick(true);
				var PPU_LIMIT = ppuCycles * 3;
				for(ppuCounter = 1; ppuCounter < PPU_LIMIT; ppuCounter++){
					this.PPU.tick(false);
				}
			}
		}
		console.log("completed main loop pass");
	}

	Emulator.prototype.step = function(){
		var ppuCycles = this.CPU.executeNext();
		//Check for R/W to registers before invoking the PPU
		this.Mapper.monitorProc();
		//Only have the PPU check on the first tick of the group
		this.PPU.tick(true);
		var PPU_LIMIT = ppuCycles * 3;
		for(ppuCounter = 1; ppuCounter < PPU_LIMIT; ppuCounter++){
			this.PPU.tick(false);
		}
	}

})()