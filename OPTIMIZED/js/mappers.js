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
	var Mapper = NEScript.Mapper = function(refBus){
		this.refBus = refBus;
		this.RAM = refBus.MM;
		this.VRAM = refBus.VM;

		this.currentROM = undefined;

		//Most mappers will require a workspace for their internal 
		//registers
		this._workspace = {};

		//Most mappers will also require a proc to be run every CPU cycle, 
		//which will usually monitor writes to certain addresses. Also, 
		//note that the R/W value should remain on the bus, as it will be removed
		//by the PPU
		this._internalMapperProc = function(){};
	}

	//@ROM - an instance of NEScript.ROM
	Mapper.prototype.loadROM = function(ROM){
		_MMC_MAP[ROM.mapperID].call(this, ROM)
	}

	//The emulator runs this after every CPU cycle.
	//Emulates the console's responses to reads/writes to specific addresses in main memory
	Mapper.prototype.monitorProc = function(){
		monitorController.call(this);

		//Don't care if address is <$8000 (bit 15 must be set)
		if (this.refBus.lastMMwrite & 0x8000){
			//Pass the byte that was written to the mapper
			var lastByte = this.RAM[this.refBus.lastMMwrite];
			this._internalMapperProc(lastByte, this.refBus.lastMMwrite);
		}
	}

	//0x1000 worth of data
	Mapper.prototype.loadBank4KB = function(startAddr, data, dst){
		for(var i = 0; i < 4096; i++){
			dst[startAddr + i] = data[i];
		}
	}

	//0x2000 worth of data
	Mapper.prototype.loadBank8KB = function(startAddr, data, dst){
		for(var i = 0; i < 8192; i++){
			dst[startAddr + i] = data[i];
		}
	}

	//0x4000 worth of data
	Mapper.prototype.loadBank16KB = function(startAddr, data, dst){
		for(var i = 0; i < 16384; i++){
			dst[startAddr + i] = data[i];
		}
	}



	/**********************IMPLEMENTATION*******************/

	//The mapper function that corresponds to the iNES mapper ID
	var _MMC_MAP = {
		0x00: _NROM, //Same as not using an MMC; default behavior
		0x01: _MMC1
	}

	function _NROM(ROM){
		//Mirror at $C000 if 1 bank (16kb) only PRG-ROM, otherwise
		//load both banks sequentially.
		//Load 1 bank CHR-ROM into VRAM pattern tables.

		if(ROM.numBanksPRG_ROM === 2){
			this.loadBank16KB(ADDR_PRG_ROM_LOWER_BANK, ROM.slice(0x10, 0x4010), this.RAM);
			this.loadBank16KB(ADDR_PRG_ROM_UPPER_BANK, ROM.slice(0x4010, 0x8010), this.RAM);
			this.loadBank8KB(0, ROM.slice(0x8010, 0xA010), this.VRAM);
		} else {
			this.loadBank16KB(ADDR_PRG_ROM_LOWER_BANK, ROM.slice(0x10, 0x4010), this.RAM);
			this.loadBank16KB(ADDR_PRG_ROM_UPPER_BANK, ROM.slice(0x10, 0x4010), this.RAM);
			this.loadBank8KB(0, ROM.slice(0x8010, 0xA010), this.VRAM);
		}

		//coerce bool to number -> 0: horizontal mirroring; 1: vertical mirroring
		this.LOADED_MIRROR_TYPE = ROM.verticalMirroring + 0;

		//No internal proc
		this._internalMapperProc = function(){};
	}

	function _MMC1(ROM){
		var finalBankOffset = (0x4000 * (ROM.numBanksPRG_ROM - 1)) + 0x10;

		//On reset, load PRG bank 0 into $8000, and the last is loaded into $C000.
		this.loadBank16KB(ADDR_PRG_ROM_LOWER_BANK, ROM.slice(0x10, 0x4010), this.RAM);
		this.loadBank16KB(ADDR_PRG_ROM_UPPER_BANK, ROM.slice(finalBankOffset, finalBankOffset + 0x4000), this.RAM);
	
		//Docs suggest that CHR is left blank on reset/power on, but here we'll
		//opt to load in the first CHR bank into the pattern tables

		//TODO: figure out CHR-RAM stuff (i.e. this condition is false)
		if(ROM.numBanksCHR_ROM > 0){
			this.loadBank8KB(0, ROM.slice(finalBankOffset + 0x4000, finalBankOffset + 0x6000), this.VRAM);
		}

		//internal vars for this mapper
		this._workspace.regShift = 0;
		this._workspace.numShifts = 0;
		this._workspace.regCtrl = 0; //$8000 - $9FFF
		this._workspace.regChrZero = 0; //$A000 - $BFFF
		this._workspace.regChrOne = 0; //$C000 - $DFFF
		this._workspace.regPrg = 0; //$E000 - $FFFF
		this._workspace.shouldSwitchChr8kb = true;
		this._workspace.shouldSwapLoPrg = true;
		this._workspace.PrgSizeIs32KB = true;
		this._workspace.ChrLoSelect = 0;
		this._workspace.ChrHiSelect = 0;
		this._workspace.PrgSelect = 0;
		this._workspace.finalPrgBankOffset = finalBankOffset;
		this.currentROM = ROM;


		//MMC1 is weird :/ It uses a 5 bit internal shift register which is written
		//to one bit at a time by writing to $8000 - $FFFF and, depending on the
		//address of the last write, sends that 5 bit value to one of four 
		//internal control registers which determine the banks loaded into
		//main memory and VRAM.
		this._internalMapperProc = function(lastByte, lastWrite){
			var regSelect, tmpVal, tmpPrg, tmpChr, prgLoOffset, prgHiOffset, 
					chrLoOffset, chrHiOffset, chrHiSelect, tmpChrHi;

			var ROM = this.currentROM;

			//Reset the shift register and num shifts if bit 7 of the address is set
			if(lastByte & 128){
				this._workspace.regShift = 0;
				this._workspace.numShifts = 0;
				//Some sources say to reset this register, others do not
				this._workspace.regCtrl = 0;
				return;
			}

			if(this._workspace.numShifts < 4){
				//Read into shift reg 1 bit at a time
				tmpVal = (lastByte & 1) ? 0x10 : 0;
				this._workspace.regShift >>= 1;
				this._workspace.regShift |= tmpVal;
				this._workspace.numShifts++;
				return;

				//On the 5th write...
			} else {
				//First we read the last bit into the shift reg
				tmpVal = (lastByte & 1) ? 0x10 : 0;
				this._workspace.regShift >>= 1;
				this._workspace.regShift |= tmpVal;

				//isolate address bits 13 and 14 to determine register

				regSelect = (lastWrite & (0x6000)) >> 0xD;

				switch(regSelect){
					case 0: //$8000 - $9FFF
						//In reality there are more mirroring types than this controls
						this.refBus.PPU.REGISTERS.mirroringType = (this._workspace.regShift & 1) ? 0 : 1;
						
						if(!(this._workspace.regShift & 0x8)){
							this._workspace.PrgSizeIs32KB = true;
						} else {
							this._workspace.PrgSizeIs32KB = false;
							this._workspace.shouldSwapLoPrg = (this._workspace.regShift & 0x4) ? true : false;
						}

						this._workspace.shouldSwitchChr8kb = (this._workspace.regShift & 0x10) ? false : true;
						break;

					case 1: //$A000 - $BFFF
						this._workspace.ChrLoSelect = this._workspace.regShift;
						break;

					case 2: //$C000 - $DFFF
						this._workspace.ChrHiSelect = this._workspace.regShift;
						break;

					case 3: //$E000 - $FFFF
						this._workspace.PrgSelect = this._workspace.regShift & 0xFF;
						break;

					default:
						break;
				}

				//Don't swap on regCtrl, which is only used to SELECT
				//a bank
				if(regSelect === 0){
					this._workspace.regShift = 0;
					this._workspace.numShifts = 0;
					return;
				}

				//There is definitely a faster way to do this, but since we are currently
				//not using ptrs to mem, we have to reload the banks each time :/
				if(this._workspace.PrgSizeIs32KB){
					//ignore lo bit if switching 32
					tmpPrg = this._workspace.PrgSelect & 0xFE;
					prgLoOffset = (0x4000 * tmpPrg) + 0x10;
					prgHiOffset = (0x4000 * (tmpPrg+1)) + 0x10;

					this.loadBank16KB(ADDR_PRG_ROM_LOWER_BANK, ROM.slice(prgLoOffset, prgLoOffset + 0x4000), this.RAM);
					this.loadBank16KB(ADDR_PRG_ROM_UPPER_BANK, ROM.slice(prgHiOffset, prgHiOffset + 0x4000), this.RAM);
				} else {
					tmpPrg = this._workspace.PrgSelect;
					prgLoOffset = (0x4000 * tmpPrg) + 0x10;
					
					if(this._workspace.shouldSwapLoPrg){
						this.loadBank16KB(ADDR_PRG_ROM_LOWER_BANK, ROM.slice(prgLoOffset, prgLoOffset + 0x4000), this.RAM);
					} else {
						this.loadBank16KB(ADDR_PRG_ROM_UPPER_BANK, ROM.slice(prgLoOffset, prgLoOffset + 0x4000), this.RAM);
					}
				}

				if(ROM.numBanksCHR_ROM > 0){ //CHR-RAM doesn't bankswitch
					if(this._workspace.shouldSwitchChr8kb){
						tmpChr = this._workspace.ChrLoSelect & 0xFE
						chrLoOffset = (0x4000 * tmpChr) + this._workspace.finalPrgBankOffset + 0x8000;
						this.loadBank8KB(0, ROM.slice(chrLoOffset, chrLoOffset + 0x2000), this.VRAM);
					} else {
						tmpChr = this._workspace.ChrLoSelect;
						tmpChrHi = this._workspace.ChrHiSelect;

						chrLoOffset = (0x4000 * tmpChr) + this._workspace.finalPrgBankOffset + 0x4000;
						chrHiOffset = (0x4000 * tmpChrHi) + this._workspace.finalPrgBankOffset + 0x4000;

						this.loadBank4KB(0, ROM.slice(chrLoOffset, chrLoOffset + 0x1000), this.VRAM);
						this.loadBank4KB(0x1000, ROM.slice(chrHiOffset, chrHiOffset + 0x1000), this.VRAM);
					}
				}

				//Finally, we reset the shift register and the num writes
				this._workspace.regShift = 0;
				this._workspace.numShifts = 0;
			}
		}
	}

	function monitorController(){
		if(this.refBus.lastMMwrite === 0x4016){
			this.refBus.Controller.receiveSignal(this.RAM[0x4016]); //Don't use utility functions b/c we don't want to record the read
		
			//Reset the lastWrite (and lastRead), otherwise the value will stay on the "bus" too long;
			//i.e. Write a 1 to $4016, but the next instruction does not write to memory 
			//at all. Mapper would erroneously interpret this as two subsequent writes of 1
			//to $4016, which would mean that writing a 0 to $4016 next would NOT trigger controller 
			//strobe. But otherwise we leave it INTACT for the PPU
			this.refBus.lastMMwrite = null;
			//this.RAM.lastRead = null;
		}

	}

})();