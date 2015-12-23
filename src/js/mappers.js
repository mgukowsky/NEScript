//The various MMC techniques. These would typically be included on the 
//cartridge, but we have to emulate them. These MMCs (a.k.a. mappers) allow
//for, among other things, RAM expansions, which means more graphics. In this
//implementation, the MMC is also responsible for loading a ROM into memory.

(function(){

	if(typeof(NEScript) === "undefined"){
		window.NEScript = {};
	}

	/***********************CONSTANTS**********************/

	var ADDR_HEADER = 0, ADDR_BANK_ONE = 0x10,
			ADDR_PRG_ROM_LOWER_BANK = 0x8000, ADDR_PRG_ROM_UPPER_BANK = 0xC000,
			PRG_ROM_BANK_SIZE = 0x4000, CHR_ROM_BANK_SIZE = 0x2000;

	/***********************INTERFACE**********************/

	//@RAM - a reference to a NEScript.CPU's _mainMemory
	//@VRAM - a reference to a NEScript.PPU's _VRAM
	var Mapper = NEScript.Mapper = function(RAM, VRAM, Controller){
		this.RAM = RAM;
		this.VRAM = VRAM;
		this.Controller = Controller;
	}

	//@ROM - an instance of NEScript.ROM
	Mapper.prototype.loadROM = function(ROM){
		_MMC_MAP[ROM.mapperID].call(this, ROM)
	}

	//The emulator runs this after every CPU cycle (TODO: should be after CPU and PPU?).
	//Emulates the console's responses to reads/writes to specific addresses in main memory
	Mapper.prototype.monitorProc = function(){
		monitorController.call(this);
	}



	/**********************IMPLEMENTATION*******************/

	//The mapper function that corresponds to the iNES mapper ID
	var _MMC_MAP = {
		0x00: _NROM //Same as not using an MMC; default behavior
	}

	function _NROM(ROM){
		//Mirror at $C000 if 1 bank (16kb) only PRG-ROM, otherwise
		//load both banks sequentially.
		//Load 1 bank CHR-ROM into VRAM pattern tables.

		if(ROM.numBanksPRG_ROM === 2){
			this.RAM.loadBank16KB(ADDR_PRG_ROM_LOWER_BANK, ROM._DATA.slice(0x10, 0x4010));
			this.RAM.loadBank16KB(ADDR_PRG_ROM_UPPER_BANK, ROM._DATA.slice(0x4010, 0x8010));
			this.VRAM.loadBank8KB(0, ROM._DATA.slice(0x8010, 0xA010));
		} else {
			this.RAM.loadBank16KB(ADDR_PRG_ROM_LOWER_BANK, ROM._DATA.slice(0x10, 0x4010));
			this.RAM.loadBank16KB(ADDR_PRG_ROM_UPPER_BANK, ROM._DATA.slice(0x10, 0x4010));
			this.VRAM.loadBank8KB(0, ROM._DATA.slice(0x8010, 0xA010));
		}

		//coerce bool to number -> 0: horizontal mirroring; 1: vertical mirroring
		this.LOADED_MIRROR_TYPE = ROM.verticalMirroring + 0;
	}

	function monitorController(){
		if(this.RAM.lastWrite === 0x4016){
			this.Controller.receiveSignal(this.RAM._memory[0x4016]); //Don't use utility functions b/c we don't want to record the read
		
			//Reset the lastWrite (and lastRead), otherwise the value will stay on the "bus" too long;
			//i.e. Write a 1 to $4016, but the next instruction does not write to memory 
			//at all. Mapper would erroneously interpret this as two subsequent writes of 1
			//to $4016, which would mean that writing a 0 to $4016 next would NOT trigger controller 
			//strobe. But otherwise we leave it INTACT for the PPU
			this.RAM.lastWrite = null;
			this.RAM.lastRead = null;
		}

	}

})();