//The main emulator which ties everything together

(function(){
	if(typeof(NEScript) === "undefined"){
		window.NEScript = {};
	}

	/*******************************CONSTANTS*******************************/
	var NTSC_CPU_RATE = 1789773; //Ya better have a fast browser ;)
	var DBG_CPU_RATE =  1200000;


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

	}

	Emulator.prototype.ejectROM = function(){
		if(typeof(this._mainLoopID) === "undefined"){
			return;
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
		//var LIMIT = Math.floor(NTSC_CPU_RATE / 20);
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
					this.PPU.ctick(true);
					var PPU_LIMIT = ppuCycles * 3;
					for(ppuCounter = 1; ppuCounter < PPU_LIMIT; ppuCounter++){
						this.PPU.ctick(false);
					}
				}
			}
			//console.log("completed main loop pass");
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