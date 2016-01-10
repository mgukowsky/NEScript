(function(){
	//Emulates MOS-6502 CPU

	if(typeof(NEScript) === "undefined"){
		window.NEScript = {};
	}

	/*SOURCEMAP:
	/
	/		-CONSTANTS
	/		-INTERFACE
	/		-IMPLEMENTATION
	/		-MACHINE CYCLE MAP
	/		-OPCODE IMPLEMENTATION
	/		-ADDRESSING MODE LOGIC
	/		-MISC
	/
	*/

	/*
		OPTIMIZATIONS:
			-Registers are defined directly on the instance
			-Constants are replaced with literals
			-Each instruction is responsible for determining the
			 number of cycles to return
			 		-Switch statements exist inside each opcode, with addressing modes
			 		 which occur more frequently receive priority
			-All functions are made public
			-Helper functions (i.e. pushByte, genericBranch) have been inlined
	*/

	/**************************CONSTANTS****************************/

	//Indices of registers in the CPU regs array (enum)
	var regPC = 0, regA = 0, regX = 1, regY = 2, regP = 3, //regP = flags register; not used in this implementation
			regSP = 4;

	//Addressing modes (enum)
	var ACCUMULATOR = 0, IMMEDIATE = 1, ZERO_PAGE = 2, 
			ZERO_PAGE_X = 3, ZERO_PAGE_Y = 4, ABSOLUTE = 5,
			ABSOLUTE_X = 6, ABSOLUTE_Y = 7, IMPLIED = 8,
			RELATIVE = 9, INDIRECT_X = 10, INDIRECT_Y = 11, 
			ABSOLUTE_INDIRECT = 12,

			//Addressing modes specific to this implementation, 
			//which force the addressing function to return only the
			//resolved address and not the final operand
			ACCUMULATOR_ADDR = 13, ZERO_PAGE_ADDR = 14,
			ZERO_PAGE_X_ADDR = 15, ZERO_PAGE_Y_ADDR = 16,
			ABSOLUTE_ADDR = 17, ABSOLUTE_X_ADDR = 18,
			ABSOLUTE_Y_ADDR = 19, INDIRECT_X_ADDR = 20,
			INDIRECT_Y_ADDR = 21;

	var STACK_OFFSET = 0x100;

	var INTERRUPT_NONE = 0, INTERRUPT_IRQ = 1, 
			INTERRUPT_NMI = 2, INTERRUPT_RESET = 3,
			//Not really an interrupt, but used to signal we are in DMA
			INTERRUPT_DMA = 4;

	var VECTOR_NMI = 0xFFFA, VECTOR_RESET = NEScript.VECTOR_RESET = 0xFFFC, VECTOR_IRQ = 0xFFFE;

	var DMA_LIMIT = 256;

	/**************************INTERFACE******************************/

	var CPU = NEScript.CPU = function(refBus){
		this.refBus = refBus;
		this.MM = refBus.MM;

		//8 bit registers
		this.regA = 0;
		this.regX = 0;
		this.regY = 0;

		//Not used in this implementation
		this.regP = 0x20;

		this.regSP = 0xFF;

		//Only one 16 bit register
		this.regPC = 0;

		//Store the flags separately for efficiency
		this.flagN = false;
		this.flagV = false;
		this.flagTrash = true; //Bit 5 in 6502 P register. Not used, but should always be on.
		this.flagB = false;
		this.flagD = false;
		this.flagI = false;
		this.flagZ = false;
		this.flagC = false;

		//Implementation-specific
		this.regExtraCycles = 0;
		this.regCurrentAddressingMode = null;
		this.regInterrupt = INTERRUPT_NONE;
		this.regPageCross = 1;

		this.DMACounter = 0;
		this.DMAAddress = 0;

		//Since we don't have to wrap them, the most efficient way
		//to store the flags is as individual bools (will be coerced into
		//0 or 1 where appropriate)
		// this.flagN = false;
		// this.flagV = false;
		// this.flagTrash = true; //Bit 5 in 6502 P register. Not used, but should always be on.
		// this.flagB = false;
		// this.flagD = false;
		// this.flagI = false;
		// this.flagZ = false;
		// this.flagC = false;
	}

	CPU.prototype.dumpRegs = function(){
		var output =  {
			A: this.regA,
			X: this.regX,
			Y: this.regY,
			P: this.flagsToP(),
			SP: this.regSP,
			PC: this.regPC
		}

		return output;
	}

	CPU.prototype.totalReset = function(){
		this.refBus.reset();

		this.regA = 0;
		this.regX = 0;
		this.regY = 0;
		this.regP = 0x20;
		this.regSP = 0xFF;
		this.regPC = 0;

		this.flagN = false;
		this.flagV = false;
		this.flagTrash = true;
		this.flagB = false;
		this.flagD = false;
		this.flagI = false;
		this.flagZ = false;
		this.flagC = false;

		this.regExtraCycles = 0;
		this.regCurrentAddressingMode = null;
		this.regInterrupt = INTERRUPT_NONE;
		this.regPageCross = 0;

		this.DMACounter = 0;
		this.DMAAddress = 0;
	}

	//Interrupt and cycle handling takes place here
	CPU.prototype.executeNext = function(){
		var extraCycles = 0;
		if(this.regInterrupt){ //anything but zero means an interrupt
			extraCycles = this.handleInterrupt();
			//Block CPU from executing on DMA
			if(this.regInterrupt === INTERRUPT_DMA){
				return extraCycles;
			}
		}
		//Execute the opcode at PC (PC will have likely been moved if an interrupt
		//took place)
		var opcode = this.MM[this.regPC];
		return this.execute(opcode) + extraCycles;
	}

	//Decodes an opcode into an ALU operation, addressing mode, and cycle group, then executes it.
	//Returns the # of cycles taken.
	CPU.prototype.execute = function(opcode){
		var opinfo = this.procMap[opcode];
		var addrMode = opinfo[1];

		var operand, extraCycles = 0;

		//Note that an extra cycle is added for page crosses on certain opcodes in addressing
		//modes ABSOLUTE_X, ABSOLUTE_Y, and INDIRECT_Y
		switch(addrMode){
			case ACCUMULATOR:
				operand = this.accumulatorOperand();
				break;

			case IMMEDIATE:
				operand = this.immediateOperand();
				break;

			case IMPLIED:
				operand =  this.impliedOperand();
				break;

			case ZERO_PAGE:
				operand = this.zeroPageOperand();
				break; 

			case ABSOLUTE:
				operand = this.absoluteOperand();
				operand = this.coerceAddress(operand);
				break;

			case RELATIVE:
				operand = this.relativeOperand();
				break;

			case ZERO_PAGE_X:
				operand = this.zeroPageIndexedXOperand();
				break; 
			
			case ABSOLUTE_X:
				operand = this.absoluteIndexedXOperand();
				if(this.regExtraCycles && pageCrossOpcodes[opcode]){
					extraCycles = this.regExtraCycles;
				}
				operand = this.coerceAddress(operand);
				break;

			case ABSOLUTE_Y:
				operand = this.absoluteIndexedYOperand();
				if(this.regExtraCycles && pageCrossOpcodes[opcode]){
					extraCycles = this.regExtraCycles;
				}
				operand = this.coerceAddress(operand);
				break;
			 
			case INDIRECT_X:
				operand = this.indirectIndexedXOperand();
				operand = this.coerceAddress(operand);
				break;

			case INDIRECT_Y:
				operand = this.indirectIndexedYOperand();
				if(this.regExtraCycles && pageCrossOpcodes[opcode]){
					extraCycles = this.regExtraCycles;
				}
				operand = this.coerceAddress(operand);
				break 
			
			case ZERO_PAGE_Y:
				operand = this.zeroPageIndexedYOperand();
				break;

			case ABSOLUTE_INDIRECT:
				operand = this.absoluteIndirectOperand();
				operand = this.coerceAddress(operand);
				break;

			default:
				throw new Error("Invalid Addressing mode: " + addrMode);
		}

		var tmpProc = this[opinfo[0]];
		var cyclesTaken = tmpProc.call(this, operand, addrMode);
		return cyclesTaken + extraCycles;
	}


	//TODO: ************MOVE THIS LOGIC TO PPU, SINCE WE HAVE THE BUS***************
	//It would be nice to have omnibus R/W functions, but we need the granularity for byte vs. word
	//Note that these functions take care of address mirroring
	CPU.prototype.readByte = function(address){
		address = _coerceAddress.call(this, address);
		tmp = this.MM[address];
		switch(address){
			case 0x2002:
				//Reset bit 7 of PPUSTATUS if it was just read from.
				//TODO: documentation is unclear if this also resets PPUSCROLL and PPUADDR?			
				this._mainMemory._memory[0x2002] = tmp & 0x7F;
				//Reset PPU toggle
				NEScript.__PPU__.REGISTERS.usePPUADDRHI = true;
				NEScript.__PPU__.REGISTERS.usePPUSCROLLX = true;
				break;
			case 0x2007:
				//A read to PPUDATA needs to be handled as a special case

				var coercedAddr = this._mainMemory.ppuAddr & 0x3FFF;
				var returnVal;

				//Return the data in the VRAM buffer, then update the VRAM buffer
				if (coercedAddr < 0x3F00){
					returnVal = this._mainMemory.ppudataBuff;
					this._mainMemory.ppudataBuff = NEScript.__PPU__.readByte(this._mainMemory.ppuAddr);
				} else {
					//The exception is a palette entry, which is returned immediately
					returnVal = NEScript.__PPU__.readByte(this._mainMemory.ppuAddr);
					this._mainMemory.ppudataBuff = returnVal;
				}

				//Increment PPU's VRAM address by 1 or 32 on a read to PPUDATA
				this._mainMemory.ppuAddr += this._mainMemory.ppuIncr;
				this._mainMemory.ppuAddr &= 0xFFFF;

				return returnVal;
				break;
			//Read from $4016 advances controller strobe
			case 0x4016:
				NEScript.__Controller__.shouldStrobe = true;
				break;
		}
		return tmp;
	}

	//Functions that combine the flags into 1 byte (a.k.a. the P register)
	//and take apart that byte into the separate flags.
	//https://github.com/bfirsh/jsnes/blob/master/source/cpu.js
	//	line 441
	CPU.prototype.flagsToP = function(){
		var tmp = (this.flagC) |
							(this.flagZ << 1) |
							(this.flagI << 2) |
							(this.flagD << 3) |
							(this.flagB << 4) |
							(this.flagTrash << 5) |
							(this.flagV << 6) |
							(this.flagN << 7);
		return tmp;			
	}

	CPU.prototype.pToFlags = function(val){
		this.flagC = (val & 0x1) ? true : false;
		this.flagZ = (val & 0x2) ? true : false;
		this.flagI = (val & 0x4) ? true : false;
		this.flagD = (val & 0x8) ? true : false;
		this.flagB = (val & 0x10) ? true : false;
		this.flagTrash = (val & 20) ? true : false;
		this.flagV = (val & 0x40) ? true : false;
		this.flagN = (val & 0x80) ? true : false;
	}

	CPU.prototype.pushByte = function(val){
		this.writeByte(this.regSP + STACK_OFFSET, val);
		this.regSP -= 1;
	}

	CPU.prototype.popByte = function(){
		this.regSP += 1;
		var tmpVal = this.readByte(this.regSP + STACK_OFFSET);
		return tmpVal;
	}

	CPU.prototype.postInterrupt = function(type){
		//Might mask an IRQ, execute an NMI or RESET unconditionally
		if (type === INTERRUPT_IRQ && this.flagI){
			return;
		}
		this.regInterrupt = type;
	}

	CPU.prototype.startDMA =  function(startAddr, OAMRef){
		this.DMAAddress = startAddr;
		//Exact number of cycles varies by source, but most agree that this many cycles 
		//are needed. Will take 512 + 1 cycles (the check for >256 in executeDMAStep)
		this.DMACounter = 0;
		this.postInterrupt(INTERRUPT_DMA);
	}

	CPU.prototype.executeDMAStep = function(){
		if(this.DMACounter >= 256){
			this.postInterrupt(INTERRUPT_NONE);
			//Only scenario where 1 cycle is returned by a call to executeNext
			return 1;
		}

		var dataToSend = this.MM[this.DMAAddress];
		this.refBus.OAM[this.DMACounter] = dataToSend;

		this.DMAAddress++;
		this.DMACounter++;

		return 2;
	}

	CPU.prototype.handleInterrupt = function(){
		if (this.regInterrupt === INTERRUPT_NMI){
			var tmpPC = this.regPC;
			this.MM[this.regSP+0x100] = (tmpPC & 0xFF00) >> 8;
			this.regSP = (this.regSP-1) & 0xFF;
			this.MM[this.regSP+0x100] = tmpPC & 0xFF;
			this.regSP = (this.regSP-1) & 0xFF;

			var tmp = this.flagsToP();
			this.MM[this.regSP+0x100] = tmp;
			this.regSP = (this.regSP-1) & 0xFF;

			this.flagI = true;
			this.regPC = this.MM[VECTOR_NMI] | (this.MM[VECTOR_NMI+1] << 8);

		} else if (this.regInterrupt === INTERRUPT_DMA){
			//Exit prematurely if in DMA
			return this.executeDMAStep();

		} else if(this.regInterrupt === INTERRUPT_IRQ){
			var tmpPC = this.regPC;
			this.MM[this.regSP+0x100] = (tmpPC & 0xFF00) >> 8;
			this.regSP = (this.regSP-1) & 0xFF;
			this.MM[this.regSP+0x100] = tmpPC & 0xFF;
			this.regSP = (this.regSP-1) & 0xFF;

			var tmp = this.flagsToP();
			tmp |= 0x10 //Set flagB in the version of the flags we push (as per CPU manual)
			this.MM[this.regSP+0x100] = tmp;
			this.regSP = (this.regSP-1) & 0xFF;

			this.flagI = true;
			this.regPC = this.MM[VECTOR_IRQ] | (this.MM[VECTOR_IRQ+1] << 8);

		} else { //reset
			this.regPC = this.MM[VECTOR_RESET] | (this.MM[VECTOR_RESET+1] << 8);
		}

		this.regInterrupt = INTERRUPT_NONE;
		return 7; //Attending to an interrupt takes an extra 7 cycles
	}

	/*********************************IMPLEMENTATION*****************************/

	CPU.prototype.coerceAddress = function(addr){
		//Implements mirroring of $0000 to $07FF at $0800 to $0FFF, 
		//$1000 to $17FF, and $18FF to $1FFF.
		if((addr > 0x7FF) && (addr < 0x2000)){
			return addr & 0x7FF; //Get last 11 bits (mod 0x800)

		//Implements mirroring of $2000 to $2007 every 8 bytes until $4000
		} else if((addr > 0x2007) && (addr < 0x4000)){
			var offset = addr & 0x07; //Get last 3 bits (mod 8)
			return offset + 0x2000;
		} else {
			return addr;
		}
	}

	//Pulls together all of the execution logic.
	//It's a little hacky, but since call cannot override the thisArg set by Function#bind, we 
	//have to pass in a final thisArg argument.
	//Returns the # of cycles taken.
	function _execute(operation, addrMode, cycleMapName, thisArg){
		thisArg.regCurrentAddressingMode = addrMode;
		//Addressing mode dicates how we get the operand
		var operand = operandRetrievers[addrMode].call(thisArg);
		operation.call(thisArg, operand);
		var cycleMap = masterCycleMap[cycleMapName]
		return cycleMap[addrMode];
	}

	//JS parsers should accept hex or dec keys; procMap[255] and
	//procMap[0xFF] should return the same value, since the hex literal
	//is converted to a dec before conversion to a string key (I guess)
	var procMap = CPU.prototype.procMap = [];
	procMap[0x00] = ["BRK", IMPLIED];
	procMap[0x01] = ["ORA", INDIRECT_X];
	procMap[0x05] = ["ORA", ZERO_PAGE];
	procMap[0x06] = ["ASL", ZERO_PAGE];
	procMap[0x08] = ["PHP", IMPLIED];
	procMap[0x09] = ["ORA", IMMEDIATE];
	procMap[0x0A] = ["ASL", ACCUMULATOR];
	procMap[0x0D] = ["ORA", ABSOLUTE];
	procMap[0x0E] = ["ASL", ABSOLUTE];

	procMap[0x10] = ["BPL", RELATIVE];
	procMap[0x11] = ["ORA", INDIRECT_Y];
	procMap[0x15] = ["ORA", ZERO_PAGE_X];
	procMap[0x16] = ["ASL", ZERO_PAGE_X];
	procMap[0x18] = ["CLC", IMPLIED];
	procMap[0x19] = ["ORA", ABSOLUTE_Y];
	procMap[0x1D] = ["ORA", ABSOLUTE_X];
	procMap[0x1E] = ["ASL", ABSOLUTE_X];

	procMap[0x20] = ["JSR", ABSOLUTE];
	procMap[0x21] = ["AND", INDIRECT_X];
	procMap[0x24] = ["BIT", ZERO_PAGE];
	procMap[0x25] = ["AND", ZERO_PAGE];
	procMap[0x26] = ["ROL", ZERO_PAGE];
	procMap[0x28] = ["PLP", IMPLIED];
	procMap[0x29] = ["AND", IMMEDIATE];
	procMap[0x2A] = ["ROL", ACCUMULATOR];
	procMap[0x2C] = ["BIT", ABSOLUTE];
	procMap[0x2D] = ["AND", ABSOLUTE];
	procMap[0x2E] = ["ROL", ABSOLUTE];
	
	procMap[0x30] = ["BMI", RELATIVE];
	procMap[0x31] = ["AND", INDIRECT_Y];
	procMap[0x35] = ["AND", ZERO_PAGE_X];
	procMap[0x36] = ["ROL", ZERO_PAGE_X];
	procMap[0x38] = ["SEC", IMPLIED];
	procMap[0x39] = ["AND", ABSOLUTE_Y];
	procMap[0x3D] = ["AND", ABSOLUTE_X];
	procMap[0x3E] = ["ROL", ABSOLUTE_X];

	procMap[0x40] = ["RTI", IMPLIED];
	procMap[0x41] = ["EOR", INDIRECT_X];
	procMap[0x45] = ["EOR", ZERO_PAGE];
	procMap[0x46] = ["LSR", ZERO_PAGE];
	procMap[0x48] = ["PHA", IMPLIED];
	procMap[0x49] = ["EOR", IMMEDIATE];
	procMap[0x4A] = ["LSR", ACCUMULATOR];
	procMap[0x4C] = ["JMP", ABSOLUTE];
	procMap[0x4D] = ["EOR", ABSOLUTE];
	procMap[0x4E] = ["LSR", ABSOLUTE];
	
	procMap[0x50] = ["BVC", RELATIVE];
	procMap[0x51] = ["EOR", INDIRECT_Y];
	procMap[0x55] = ["EOR", ZERO_PAGE_X];
	procMap[0x56] = ["LSR", ZERO_PAGE_X];
	procMap[0x58] = ["CLI", IMPLIED];
	procMap[0x59] = ["EOR", ABSOLUTE_Y];
	procMap[0x5D] = ["EOR", ABSOLUTE_X];
	procMap[0x5E] = ["LSR", ABSOLUTE_X];

	procMap[0x60] = ["RTS", IMPLIED];
	procMap[0x61] = ["ADC", INDIRECT_X];
	procMap[0x65] = ["ADC", ZERO_PAGE];
	procMap[0x66] = ["ROR", ZERO_PAGE];
	procMap[0x68] = ["PLA", IMPLIED];
	procMap[0x69] = ["ADC", IMMEDIATE];
	procMap[0x6A] = ["ROR", ACCUMULATOR];
	procMap[0x6C] = ["JMP", ABSOLUTE_INDIRECT];
	procMap[0x6D] = ["ADC", ABSOLUTE];
	procMap[0x6E] = ["ROR", ABSOLUTE];
	
	procMap[0x70] = ["BVS", RELATIVE];
	procMap[0x71] = ["ADC", INDIRECT_Y];
	procMap[0x75] = ["ADC", ZERO_PAGE_X];
	procMap[0x76] = ["ROR", ZERO_PAGE_X];
	procMap[0x78] = ["SEI", IMPLIED];
	procMap[0x79] = ["ADC", ABSOLUTE_Y];
	procMap[0x7D] = ["ADC", ABSOLUTE_X];
	procMap[0x7E] = ["ROR", ABSOLUTE_X];

	procMap[0x81] = ["STA", INDIRECT_X];
	procMap[0x84] = ["STY", ZERO_PAGE];
	procMap[0x85] = ["STA", ZERO_PAGE];
	procMap[0x86] = ["STX", ZERO_PAGE];
	procMap[0x88] = ["DEY", IMPLIED];
	procMap[0x8A] = ["TXA", IMPLIED];
	procMap[0x8C] = ["STY", ABSOLUTE];
	procMap[0x8D] = ["STA", ABSOLUTE];
	procMap[0x8E] = ["STX", ABSOLUTE];
	
	procMap[0x90] = ["BCC", RELATIVE];
	procMap[0x91] = ["STA", INDIRECT_Y];
	procMap[0x94] = ["STY", ZERO_PAGE_X];
	procMap[0x95] = ["STA", ZERO_PAGE_X];
	procMap[0x96] = ["STX", ZERO_PAGE_Y];
	procMap[0x98] = ["TYA", IMPLIED];
	procMap[0x99] = ["STA", ABSOLUTE_Y];
	procMap[0x9A] = ["TXS", IMPLIED];
	procMap[0x9D] = ["STA", ABSOLUTE_X];

	procMap[0xA0] = ["LDY", IMMEDIATE];
	procMap[0xA1] = ["LDA", INDIRECT_X];
	procMap[0xA2] = ["LDX", IMMEDIATE];
	procMap[0xA4] = ["LDY", ZERO_PAGE];
	procMap[0xA5] = ["LDA", ZERO_PAGE];
	procMap[0xA6] = ["LDX", ZERO_PAGE];
	procMap[0xA8] = ["TAY", IMPLIED];
	procMap[0xA9] = ["LDA", IMMEDIATE];
	procMap[0xAA] = ["TAX", IMPLIED];
	procMap[0xAC] = ["LDY", ABSOLUTE];
	procMap[0xAD] = ["LDA", ABSOLUTE];
	procMap[0xAE] = ["LDX", ABSOLUTE];
	
	procMap[0xB0] = ["BCS", RELATIVE];
	procMap[0xB1] = ["LDA", INDIRECT_Y];
	procMap[0xB4] = ["LDY", ZERO_PAGE_X];
	procMap[0xB5] = ["LDA", ZERO_PAGE_X];
	procMap[0xB6] = ["LDX", ZERO_PAGE_Y];
	procMap[0xB8] = ["CLV", IMPLIED];
	procMap[0xB9] = ["LDA", ABSOLUTE_Y];
	procMap[0xBA] = ["TSX", IMPLIED];
	procMap[0xBC] = ["LDY", ABSOLUTE_X];
	procMap[0xBD] = ["LDA", ABSOLUTE_X];
	procMap[0xBE] = ["LDX", ABSOLUTE_Y];

	procMap[0xC0] = ["CPY", IMMEDIATE];
	procMap[0xC1] = ["CMP", INDIRECT_X];
	procMap[0xC4] = ["CPY", ZERO_PAGE];
	procMap[0xC5] = ["CMP", ZERO_PAGE];
	procMap[0xC6] = ["DEC", ZERO_PAGE];
	procMap[0xC8] = ["INY", IMPLIED];
	procMap[0xC9] = ["CMP", IMMEDIATE];
	procMap[0xCA] = ["DEX", IMPLIED];
	procMap[0xCC] = ["CPY", ABSOLUTE];
	procMap[0xCD] = ["CMP", ABSOLUTE];
	procMap[0xCE] = ["DEC", ABSOLUTE];
	
	procMap[0xD0] = ["BNE", RELATIVE];
	procMap[0xD1] = ["CMP", INDIRECT_Y];
	procMap[0xD5] = ["CMP", ZERO_PAGE_X];
	procMap[0xD6] = ["DEC", ZERO_PAGE_X];
	procMap[0xD8] = ["CLD", IMPLIED];
	procMap[0xD9] = ["CMP", ABSOLUTE_Y];
	procMap[0xDD] = ["CMP", ABSOLUTE_X];
	procMap[0xDE] = ["DEC", ABSOLUTE_X];

	procMap[0xE0] = ["CPX", IMMEDIATE];
	procMap[0xE1] = ["SBC", INDIRECT_X];
	procMap[0xE4] = ["CPX", ZERO_PAGE];
	procMap[0xE5] = ["SBC", ZERO_PAGE];
	procMap[0xE6] = ["INC", ZERO_PAGE];
	procMap[0xE8] = ["INX", IMPLIED];
	procMap[0xE9] = ["SBC", IMMEDIATE];
	procMap[0xEA] = ["NOP", IMPLIED];
	procMap[0xEC] = ["CPX", ABSOLUTE];
	procMap[0xED] = ["SBC", ABSOLUTE];
	procMap[0xEE] = ["INC", ABSOLUTE];
	
	procMap[0xF0] = ["BEQ", RELATIVE];
	procMap[0xF1] = ["SBC", INDIRECT_Y];
	procMap[0xF5] = ["SBC", ZERO_PAGE_X];
	procMap[0xF6] = ["INC", ZERO_PAGE_X];
	procMap[0xF8] = ["SED", IMPLIED];
	procMap[0xF9] = ["SBC", ABSOLUTE_Y];
	procMap[0xFD] = ["SBC", ABSOLUTE_X];
	procMap[0xFE] = ["INC", ABSOLUTE_X];


	/**********************MACHINE CYCLE MAP******************/

	//Opcodes which add a machine cycle on a page crossing.
	//For the most part, only needed for absolute indexed and indirect indexed modes
	//STA, STX, and STY do not add cycles and are not included here;
	//some sources say they do add cycles, but most agree that they do not.
	var pageCrossOpcodes = {
		0x10: true,
		0x11: true,
		0x19: true,
		0x1D: true,
		0x30: true,
		0x31: true, //Some sources say not to do this for this opcode, I'm pretty sure that's a typo
		0x39: true,
		0x3D: true,
		0x50: true,
		0x51: true,
		0x59: true,
		0x5D: true,
		0x70: true,
		0x71: true,
		0x79: true,
		0x7D: true,
		0x90: true,
		0xB0: true,
		0xB1: true,
		0xB9: true,
		0xBC: true,
		0xBD: true,
		0xBE: true,
		0xD0: true,
		0xD1: true,
		0xD9: true,
		0xDD: true,
		0xF0: true,
		0xF1: true,
		0xF9: true,
		0xFD: true,
	}

	//The base number of cycles for an addressing mode
	//Note that a given instruction cannot necessarily be called with
	//any addressing mode in its group (esp. group 3)
	//See http://archive.6502.org/datasheets/synertek_programming_manual.pdf
	//appendix C-2

	//ADC, BIT, CPX, LDX etc.
	//Add one on page cross for ABSOLUTE_X, ABSOLUTE_Y, and INDIRECT_Y
	//NOTE: some sources say NOT to add +1 page cross for INDIRECT_Y EOR...
	var groupOneCycleMap = {};
	groupOneCycleMap[IMMEDIATE] = 2;
	groupOneCycleMap[ZERO_PAGE] = 3;
	groupOneCycleMap[ZERO_PAGE_X] = 4;
	groupOneCycleMap[ZERO_PAGE_Y] = 4;
	groupOneCycleMap[ABSOLUTE] = 4;
	groupOneCycleMap[ABSOLUTE_X] = 4;
	groupOneCycleMap[ABSOLUTE_Y] = 4;
	groupOneCycleMap[INDIRECT_X] = 6;
	groupOneCycleMap[INDIRECT_Y] = 5;

	//ASL, DEC, JSR, etc. No additional cycle logic
	var groupTwoCycleMap = {};
	groupTwoCycleMap[ACCUMULATOR] = 2;
	groupTwoCycleMap[ZERO_PAGE] = 5;
	groupTwoCycleMap[ZERO_PAGE_X] = 6;
	groupTwoCycleMap[ABSOLUTE] = 6;
	groupTwoCycleMap[ABSOLUTE_X] = 7;
	groupTwoCycleMap[ACCUMULATOR_ADDR] = 2;
	groupTwoCycleMap[ZERO_PAGE_ADDR] = 5;
	groupTwoCycleMap[ZERO_PAGE_X_ADDR] = 6;
	groupTwoCycleMap[ABSOLUTE_ADDR] = 6;
	groupTwoCycleMap[ABSOLUTE_X_ADDR] = 7;

	//BCC, CLC, JMP, NOP, etc.
	//Add one if branch taken, add one more if taking branch causes
	//page cross, RELATIVE ONLY!
	var groupThreeCycleMap = {};
	groupThreeCycleMap[RELATIVE] = 2;
	groupThreeCycleMap[IMPLIED] = 2;
	groupThreeCycleMap[ABSOLUTE] = 3;
	groupThreeCycleMap[ABSOLUTE_ADDR] = 3;
	groupThreeCycleMap[ABSOLUTE_INDIRECT] = 5;

	//PHA and PHP only. No additional cycle logic
	var groupFourCycleMap = {};
	groupFourCycleMap[IMPLIED] = 3;

	//PLA and PLP only. No additional cycle logic
	var groupFiveCycleMap = {};
	groupFiveCycleMap[IMPLIED] = 4;

	//RTI and RTS only. No additional cycle logic
	var groupSixCycleMap = {};
	groupSixCycleMap[IMPLIED] = 6;

	//BRK only. No additional cycle logic
	var groupBRKCycleMap = {};
	groupBRKCycleMap[IMPLIED] = 7;

	//STA, STX, and STY only.
	var groupSevenCycleMap = {};
	groupSevenCycleMap[ZERO_PAGE_ADDR] = 3;
	groupSevenCycleMap[ZERO_PAGE_X_ADDR] = 4;
	groupSevenCycleMap[ZERO_PAGE_Y_ADDR] = 4;
	groupSevenCycleMap[ABSOLUTE_ADDR] = 4;
	groupSevenCycleMap[ABSOLUTE_X_ADDR] = 5;
	groupSevenCycleMap[ABSOLUTE_Y_ADDR] = 5;
	groupSevenCycleMap[INDIRECT_X_ADDR] = 6;
	groupSevenCycleMap[INDIRECT_Y_ADDR] = 6;

	//The cycle group for a particular operation
	var masterCycleMap = {
		ADC: groupOneCycleMap,
		AND: groupOneCycleMap,
		ASL: groupTwoCycleMap,
		BCC: groupThreeCycleMap,
		BCS: groupThreeCycleMap,
		BEQ: groupThreeCycleMap,
		BIT: groupOneCycleMap,
		BMI: groupThreeCycleMap,
		BNE: groupThreeCycleMap,
		BPL: groupThreeCycleMap,
		BRK: groupBRKCycleMap,
		BVC: groupThreeCycleMap,
		BVS: groupThreeCycleMap,
		CLC: groupThreeCycleMap,
		CLD: groupThreeCycleMap,
		CLI: groupThreeCycleMap,
		CLV: groupThreeCycleMap,
		CMP: groupOneCycleMap,
		CPX: groupOneCycleMap,
		CPY: groupOneCycleMap,
		DEC: groupTwoCycleMap,
		DEX: groupThreeCycleMap,
		DEY: groupThreeCycleMap,
		EOR: groupOneCycleMap,
		INC: groupTwoCycleMap,
		INX: groupThreeCycleMap,
		INY: groupThreeCycleMap,
		JMP: groupThreeCycleMap,
		JSR: groupTwoCycleMap,
		LDA: groupOneCycleMap,
		LDX: groupOneCycleMap,
		LDY: groupOneCycleMap,
		LSR: groupTwoCycleMap,
		NOP: groupThreeCycleMap,
		ORA: groupOneCycleMap,
		PHA: groupFourCycleMap,
		PHP: groupFourCycleMap,
		PLA: groupFiveCycleMap,
		PLP: groupFiveCycleMap,
		ROL: groupTwoCycleMap,
		ROR: groupTwoCycleMap,
		RTI: groupSixCycleMap,
		RTS: groupSixCycleMap,
		SBC: groupOneCycleMap,
		SEC: groupThreeCycleMap,
		SED: groupThreeCycleMap,
		SEI: groupThreeCycleMap,
		STA: groupSevenCycleMap,
		STX: groupSevenCycleMap,
		STY: groupSevenCycleMap,
		TAX: groupThreeCycleMap,
		TAY: groupThreeCycleMap,
		TSX: groupThreeCycleMap,
		TXA: groupThreeCycleMap,
		TXS: groupThreeCycleMap,
		TYA: groupThreeCycleMap
	}


	/******************************OPCODE IMPLEMENTATION**************************/

	//The functions perform the fundamental ALU operations.

	//regPC is moved past the opcode and operands BEFORE 
	//any of these are called!!! This means the opcode for 
	//any of these operations in memory is at regPC - (1 + <# of bytes in operand>)
	//at the time any of these are invoked.

	//Each opcode receives an operand, which can be an address in memory or the value of a register,
	//and an addressing mode, which determines the # of cycles taken.

	//AdD memory and accumulator and Carry
	//BINARY addition
	//regA + memoryOperand + carry flag -> regA
	CPU.prototype.ADC = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		operand = this.MM[operand];

		var result = operand + this.regA + this.flagC;
		
		this.flagC = (result > 0xFF) ? true : false;

		result &= 0xFF;

		var ra = this.regA

		//Set the overflow flag when we add two numbers (each < 128), but the result > 127;
		//checks if pos + pos = neg OR neg + neg = pos
		//We would expect two positives to always sum to a positive, but the signed byte
		//may say otherwise (i.e. 64 + 65 = 129, but signed it is -127)
		this.flagV = (!((ra ^ operand) & 0x80) && ((ra ^ result) & 0x80)) ? true : false
		this.flagZ = (result === 0) ? true : false;
		this.flagN = (result & 0x80) ? true : false;

		this.regA = result;

		switch(addrMode){
			case IMMEDIATE: 
				return 2;
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			case ZERO_PAGE_X: 
				return 4;
			case ABSOLUTE_X: 
				return 4;
			case ABSOLUTE_Y: 
				return 4;
			case INDIRECT_X:
				return 6;
			case INDIRECT_Y: 
				return 5;
			default:
				return 3;
		}
	}

	//And memory with accumulator
	//regA & memoryOperand -> regA
	CPU.prototype.AND = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		operand = this.MM[operand];

		this.regA &= operand;
		var result = this.regA
		this.flagN = (result & 0x80) ? true : false;
		this.flagZ = (result === 0) ? true : false;

		switch(addrMode){
			case IMMEDIATE: 
				return 2;
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			case ZERO_PAGE_X: 
				return 4;
			case ZERO_PAGE_Y:
				return 4;
			case ABSOLUTE_X: 
				return 4;
			case ABSOLUTE_Y: 
				return 4;
			case INDIRECT_X:
				return 6;
			case INDIRECT_Y: 
				return 5;
			default:
				return 3;
		}
	}

	//Shift memory or accumulator left by one bit.
	//Can operate directly on memory
	//flagC = memory OR regA & 0x80; memory/regA <<= 1
	CPU.prototype.ASL = function(operand, addrMode){

		//Operate on regA (addr is the val of regA)
		if (addrMode === ACCUMULATOR){
			//Operand is the value of regA
			operand = operand << 1;
			this.regA = operand & 0xFF;
		} else {
			this.refBus.lastMMread = operand;
			this.refBus.lastMMwrite = operand;
			var addr = operand;
			operand = this.MM[operand];

			operand <<= 1;
			this.MM[addr] = operand;
		}

		this.flagN = (operand & 0x80) ? true : false;
		this.flagZ = ((operand & 0xFF) === 0) ? true : false;
		this.flagC = (operand > 0xFF) ? true : false;

		switch(addrMode){
			case ACCUMULATOR: 
				return 2;
			case ZERO_PAGE:
				return 5;
			case ABSOLUTE:
			 	return  6;
			case ZERO_PAGE_X:
				return 6;
			case ABSOLUTE_X: 
				return 7;
			default:
				return 3;
		}
	}

	//Branching functions
	//regPC = (condition) ? regPC + operand : regPC

	//Branch on flagC === false (Carry Clear)
	CPU.prototype.BCC = function(operand, addrMode){
		var extraCycles = 0;

		operand = this.MM[operand];
		//Convert to signed byte
		operand = (operand < 128) ? operand : operand-256;

		if(!this.flagC){
			var tmp = this.regPC + operand;
			if((this.regPC & 0xFF00) !== (tmp & 0xFF00)){
				extraCycles = 2;
			} else {
				extraCycles = 1;
			}
			this.regPC = tmp; //Don't bother masking; no program will ever go past $FFFF (interrupt vectors are always there).
		} 

		return extraCycles+2;
	}

	//Branch on flagC === true (Carry Set)
	CPU.prototype.BCS = function(operand, addrMode){
		var extraCycles = 0;

		operand = this.MM[operand];
		//Convert to signed byte
		operand = (operand < 128) ? operand : operand-256;

		if(this.flagC){
			var tmp = this.regPC + operand;
			if((this.regPC & 0xFF00) !== (tmp & 0xFF00)){
				extraCycles = 2;
			} else {
				extraCycles = 1;
			}
			this.regPC = tmp;
		} 

		return extraCycles+2;
	}

	//Branch on flagZ === true (Equals Zero)
	CPU.prototype.BEQ = function(operand, addrMode){
		var extraCycles = 0;

		operand = this.MM[operand];
		//Convert to signed byte
		operand = (operand < 128) ? operand : operand-256;

		if(this.flagZ){
			var tmp = this.regPC + operand;
			if((this.regPC & 0xFF00) !== (tmp & 0xFF00)){
				extraCycles = 2;
			} else {
				extraCycles = 1;
			}
			this.regPC = tmp;
		} 

		return extraCycles+2;
	}

	//Test bits in memory with regA
	//set flagN if bit 7 is set in operand
	//set flagV if bit 6 is set in operand
	//set flagZ if regA & operand === 0
	CPU.prototype.BIT = function(operand, addrMode){
		this.refBus.lastMMread = operand;

		operand = this.MM[operand];

		var tmp = this.regA & operand;
		this.flagN = (operand & 0x80) ? true : false;
		this.flagV = (operand & 0x40) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;

		switch(addrMode){
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE:
				return 4;
			default:
				return 3;
		}
	}

	//Branch on flagN === true (result MInus)
	CPU.prototype.BMI = function(operand, addrMode){
		var extraCycles = 0;

		operand = this.MM[operand];
		//Convert to signed byte
		operand = (operand < 128) ? operand : operand-256;

		if(this.flagN){
			var tmp = this.regPC + operand;
			if((this.regPC & 0xFF00) !== (tmp & 0xFF00)){
				extraCycles = 2;
			} else {
				extraCycles = 1;
			}
			this.regPC = tmp;
		} 

		return extraCycles+2;
	}

	//Branch on flagZ === false (Not Zero)
	CPU.prototype.BNE = function(operand, addrMode){
		var extraCycles = 0;

		operand = this.MM[operand];
		//Convert to signed byte
		operand = (operand < 128) ? operand : operand-256;

		if(!this.flagZ){
			var tmp = this.regPC + operand;
			if((this.regPC & 0xFF00) !== (tmp & 0xFF00)){
				extraCycles = 2;
			} else {
				extraCycles = 1;
			}
			this.regPC = tmp;
		} 

		return extraCycles+2;
	}

	//Branch on flagN === false (result PLus)
	CPU.prototype.BPL = function(operand, addrMode){
		var extraCycles = 0;

		operand = this.MM[operand];
		//Convert to signed byte
		operand = (operand < 128) ? operand : operand-256;

		if(!this.flagN){
			var tmp = this.regPC + operand;
			if((this.regPC & 0xFF00) !== (tmp & 0xFF00)){
				extraCycles = 2;
			} else {
				extraCycles = 1;
			}
			this.regPC = tmp;
		} 

		return extraCycles+2;
	}

	//Force an IRQ.
	//Increments PC by 2 before it is pushed on the stack, 
	//then pushes the flags onto the stack.
	//Attends to the IRQ by putting the word at $FFFE into regPC.
	//Sets flagI to show that we are attending to an IRQ.
	CPU.prototype.BRK = function(operand, addrMode){
		//Increment the PC we push to point past the current instruction, 
		//otherwise we would return to the same instruction. Also, 6502 has a 'bug'
		//where the return address skips over the byte after the BRK instruction, 
		//which is why we increment PC by 1 when we push it. 
		var tmpPC = this.regPC+1;
		this.MM[this.regSP+0x100] = (tmpPC & 0xFF00) >> 8;
		this.regSP = (this.regSP-1) & 0xFF;
		this.MM[this.regSP+0x100] = tmpPC & 0xFF;
		this.regSP = (this.regSP-1) & 0xFF;

		var tmp = this.flagsToP();
		tmp |= 0x10 //Set flagB in the version of the flags we push (as per CPU manual)
		this.MM[this.regSP+0x100] = tmp;
		this.regSP = (this.regSP-1) & 0xFF;

		this.flagI = true;
		this.regPC = this.MM[VECTOR_IRQ] | (this.MM[VECTOR_IRQ+1] << 8);

		return 7;
	}

	//Branch on flagV === false (oVerflow Clear)
	CPU.prototype.BVC = function(operand, addrMode){
		var extraCycles = 0;

		operand = this.MM[operand];
		//Convert to signed byte
		operand = (operand < 128) ? operand : operand-256;

		if(!this.flagV){
			var tmp = this.regPC + operand;
			if((this.regPC & 0xFF00) !== (tmp & 0xFF00)){
				extraCycles = 2;
			} else {
				extraCycles = 1;
			}
			this.regPC = tmp;
		} 

		return extraCycles+2;
	}

	//Branch on flagV === true (oVerflow Set)
	CPU.prototype.BVS = function(operand, addrMode){
		var extraCycles = 0;

		operand = this.MM[operand];
		//Convert to signed byte
		operand = (operand < 128) ? operand : operand-256;

		if(this.flagV){
			var tmp = this.regPC + operand;
			if((this.regPC & 0xFF00) !== (tmp & 0xFF00)){
				extraCycles = 2;
			} else {
				extraCycles = 1;
			}
			this.regPC = tmp;
		} 

		return extraCycles+2;
	}

	//CLears flagC
	CPU.prototype.CLC = function(operand, addrMode){
		this.flagC = false;
		return 2;
	}

	//CLears flagD
	CPU.prototype.CLD = function(operand, addrMode){
		this.flagD = false;
		return 2;
	}

	//CLears flagI
	CPU.prototype.CLI = function(operand, addrMode){
		this.flagI = false;
		return 2;
	}

	//CLears flagV
	CPU.prototype.CLV = function(operand, addrMode){
		this.flagV = false;
		return 2;
	}

	//Compares memory and regA
	CPU.prototype.CMP = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		operand = this.MM[operand];

		var ra = this.regA;
		var tmp = (ra - operand) & 0xFF;

		this.flagZ = (tmp === 0) ? true : false;
		this.flagN = (tmp & 0x80) ? true : false;
		this.flagC = (ra >= operand) ? true : false;

		switch(addrMode){
			case IMMEDIATE: 
				return 2;
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			case ZERO_PAGE_X: 
				return 4;
			case ABSOLUTE_X: 
				return 4;
			case ABSOLUTE_Y: 
				return 4;
			case INDIRECT_X:
				return 6;
			case INDIRECT_Y: 
				return 5;
			default:
				return 3;
		}
	}

	//Compares memory and regX
	CPU.prototype.CPX = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		operand = this.MM[operand];

		var rx = this.regX;
		var tmp = (rx - operand) & 0xFF;

		this.flagZ = (tmp === 0) ? true : false;
		this.flagN = (tmp & 0x80) ? true : false;
		this.flagC = (rx >= operand) ? true : false;

		switch(addrMode){
			case IMMEDIATE: 
				return 2;
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			default:
				return 3;
		}
	}

	//Compares memory and regY
	CPU.prototype.CPY = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		operand = this.MM[operand];

		var ry = this.regY;
		var tmp = (ry - operand) & 0xFF;

		this.flagZ = (tmp === 0) ? true : false;
		this.flagN = (tmp & 0x80) ? true : false;
		this.flagC = (ry >= operand) ? true : false;

		switch(addrMode){
			case IMMEDIATE: 
				return 2;
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			default:
				return 3;
		}
	}

	//Decrement a memory address by one
	CPU.prototype.DEC = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		this.refBus.lastMMwrite = operand;
		var addr = operand;
		operand = this.MM[operand];
		this.MM[addr] = operand-1;
		var tmp = this.MM[addr];

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;

		switch(addrMode){
			case ZERO_PAGE:
				return 5;
			case ABSOLUTE:
				return 6;
			case ZERO_PAGE_X:
				return 6;
			case ABSOLUTE_X:
				return 7;
			default:
				return 3;
		}		
	}

	//Decrement regX by one
	CPU.prototype.DEX = function(operand, addrMode){
		this.regX = (this.regX-1) & 0xFF;
		var tmp = this.regX;

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;
		
		return 2;
	}

	//Decrement regY by one
	CPU.prototype.DEY = function(operand, addrMode){
		this.regY = (this.regY-1) & 0xFF;
		var tmp = this.regY;

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;
		
		return 2;
	}

	//Exclusive OR (aka XOR) memory with regA, 
	//store result in regA
	//regA ^ operand -> regA
	CPU.prototype.EOR = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		operand = this.MM[operand];

		var tmp = this.regA ^ operand;

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;

		this.regA = tmp;

		switch(addrMode){
			case IMMEDIATE: 
				return 2;
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			case ZERO_PAGE_X: 
				return 4;
			case ABSOLUTE_X: 
				return 4;
			case ABSOLUTE_Y: 
				return 4;
			case INDIRECT_X:
				return 6;
			case INDIRECT_Y: 
				return 5;
			default:
				return 3;
		}
	}

	//INCremement a memory address by 1
	CPU.prototype.INC = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		this.refBus.lastMMwrite = operand;
		var addr = operand;
		operand = this.MM[operand];
		this.MM[addr] = operand+1;
		var tmp = this.MM[addr];

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;

		switch(addrMode){
			case ZERO_PAGE:
				return 5;
			case ABSOLUTE:
				return 6;
			case ZERO_PAGE_X:
				return 6;
			case ABSOLUTE_X:
				return 7;
			default:
				return 3;
		}
	}

	//INcrement regX by 1
	CPU.prototype.INX = function(operand, addrMode){
		this.regX = (this.regX+1) & 0xFF;
		var tmp = this.regX;

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;
		
		return 2;
	}

	//INcrement regY by 1
	CPU.prototype.INY = function(operand, addrMode){
		this.regY = (this.regY+1) & 0xFF;
		var tmp = this.regY;

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;
		
		return 2;
	}

	//Unconditional jump to anywhere in memory
	//Move the address into PC
	CPU.prototype.JMP = function(operand, addrMode){
		this.regPC = operand;

		switch(addrMode){
			case ABSOLUTE:
				return 3;
			case ABSOLUTE_INDIRECT:
				return 5;
			default:
				return 3;
		}
	}

	//Unconditional Jump and Save Return address (a.k.a. Jump to SubRoutine)
	CPU.prototype.JSR = function(operand, addrMode){
		var tmpPC = this.regPC-1;
		this.MM[this.regSP+0x100] = (tmpPC & 0xFF00) >> 8;
		this.regSP = (this.regSP-1) & 0xFF;
		this.MM[this.regSP+0x100] = tmpPC & 0xFF;
		this.regSP = (this.regSP-1) & 0xFF;

		this.regPC = operand;
		
		return 6;
	}

	//LoaD memory into regA, then set
	//flagN and flagZ accordingly
	CPU.prototype.LDA = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		operand = this.MM[operand];
		this.regA = operand;

		this.flagN = (operand & 0x80) ? true : false;
		this.flagZ = (operand === 0) ? true : false;

		switch(addrMode){
			case IMMEDIATE: 
				return 2;
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			case ZERO_PAGE_X: 
				return 4;
			case ABSOLUTE_X: 
				return 4;
			case ABSOLUTE_Y: 
				return 4;
			case INDIRECT_X:
				return 6;
			case INDIRECT_Y: 
				return 5;
			default:
				return 3;
		}
	}

	//LoaD memory into regX
	CPU.prototype.LDX = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		operand = this.MM[operand];
		this.regX = operand;

		this.flagN = (operand & 0x80) ? true : false;
		this.flagZ = (operand === 0) ? true : false;

		switch(addrMode){
			case IMMEDIATE: 
				return 2;
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			case ZERO_PAGE_Y:
				return 4;
			case ABSOLUTE_Y: 
				return 4;
			default:
				return 3;
		}
	}

	//Load memory into regY
	CPU.prototype.LDY = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		operand = this.MM[operand];
		this.regY = operand;

		this.flagN = (operand & 0x80) ? true : false;
		this.flagZ = (operand === 0) ? true : false;

		switch(addrMode){
			case IMMEDIATE: 
				return 2;
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			case ZERO_PAGE_X:
				return 4;
			case ABSOLUTE_X: 
				return 4;
			default:
				return 3;
		}
	}

	//Shift right regA or value at address by 1.
	//bit that is shifted off the end is placed in flagC.
	//Since a 0 will always be shifted into bit 7, flagN is
	//always set to false. Set flagZ if result === 0.
	CPU.prototype.LSR = function(operand, addrMode){
		var bitShiftedOff;

		if (addrMode === ACCUMULATOR){
			//operand will === regA
			bitShiftedOff = operand & 0x01;
			operand = (operand >> 1) & 0xFF;
			this.regA = operand;
		} else {
			this.refBus.lastMMread = operand;
			this.refBus.lastMMwrite = operand;
			var addr = operand;

			operand = this.MM[operand];
			bitShiftedOff = operand & 0x01;
			operand >>= 1;
			this.MM[addr] = operand;
		}

		this.flagN = false;
		this.flagZ = (operand === 0) ? true : false;
		this.flagC = (bitShiftedOff === 1) ? true : false;

		switch(addrMode){
			case ACCUMULATOR: 
				return 2;
			case ZERO_PAGE:
				return 5;
			case ABSOLUTE:
			 	return  6;
			case ZERO_PAGE_X:
				return 6;
			case ABSOLUTE_X: 
				return 7;
			default:
				return 3;
		}
	}

	//No OPeration
	CPU.prototype.NOP = function(operand, addrMode){
		//does nothing
		return 2;
	}

	//OR memory with regA, store result in regA.
	//Adjust flagN and flagZ according to result.
	CPU.prototype.ORA = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		operand = (this.MM[operand]) | this.regA;

		this.regA = operand;

		this.flagN = (operand & 0x80) ? true : false;
		this.flagZ = (operand === 0) ? true : false;

		switch(addrMode){
			case IMMEDIATE: 
				return 2;
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			case ZERO_PAGE_X: 
				return 4;
			case ABSOLUTE_X: 
				return 4;
			case ABSOLUTE_Y: 
				return 4;
			case INDIRECT_X:
				return 6;
			case INDIRECT_Y: 
				return 5;
			default:
				return 3;
		}
	}

	//PusH regA
	CPU.prototype.PHA = function(operand, addrMode){
		this.MM[this.regSP+0x100] = this.regA;
		this.regSP = (this.regSP-1) & 0xFF;

		return 3;
	}

	//PusH regP (flags)
	CPU.prototype.PHP = function(operand, addrMode){
		//The documentation for this is obscure, but the 6502 DOES set the 
		//B flag (bit 4 of P register) BEFORE pushing the flags. It is also expected
		//that bit 5 (an unused flag) will be unaffected.
		this.MM[this.regSP+0x100] = this.flagsToP() | 0x30;
		this.regSP = (this.regSP-1) & 0xFF;

		return 3;
	}

	//Pop (aka PulL) from stack, place into regA
	//set flagN and flagZ accordingly
	CPU.prototype.PLA = function(operand, addrMode){
		this.regSP = (this.regSP+1) & 0xFF;
		var tmp = this.MM[this.regSP+0x100];
		this.regA = tmp;

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;

		return 4;
	}

	//Pop (aka PulL) from stack, place into flags
	CPU.prototype.PLP = function(operand, addrMode){
		this.regSP = (this.regSP+1) & 0xFF;
		var tmp = this.MM[this.regSP+0x100];
		this.pToFlags(tmp & 0xEF);

		return 4;
	}

	//ROtate regA or memory Left
	//flagC is shifted IN to bit 0
	//Store shifted off bit in flagC
	//Adjust flagN and flagZ accordingly
	CPU.prototype.ROL = function(operand, addrMode){
		var bitShiftedOff, tmp;

		if (addrMode === ACCUMULATOR){
			bitShiftedOff = operand & 0x80;
			operand = (operand << 1) & 0xFF;
			operand |= this.flagC;
			this.regA = operand;
		} else {
			this.refBus.lastMMread = operand;
			this.refBus.lastMMwrite = operand;
			var addr = operand;

			operand = this.MM[operand];

			bitShiftedOff = operand & 0x80;
			operand = (operand << 1) & 0xFF;
			operand |= this.flagC;
			
			this.MM[addr] = operand;
		}

		this.flagC = (bitShiftedOff) ? true : false;

		this.flagN = (operand & 0x80) ? true : false;
		this.flagZ = (operand === 0) ? true : false;

		switch(addrMode){
			case ACCUMULATOR: 
				return 2;
			case ZERO_PAGE:
				return 5;
			case ABSOLUTE:
			 	return  6;
			case ZERO_PAGE_X:
				return 6;
			case ABSOLUTE_X: 
				return 7;
			default:
				return 3;
		}
	}

	//ROtate regA or memory Right
	//same logic as ROL
	CPU.prototype.ROR = function(operand, addrMode){
		var bitShiftedOff;

		if (addrMode === ACCUMULATOR){
			bitShiftedOff = operand & 0x01;
			operand = (operand >> 1) & 0xFF;
			operand = (this.flagC) ? (operand | 0x80) : operand;
			this.regA = operand;
		} else {
			this.refBus.lastMMread = operand;
			this.refBus.lastMMwrite = operand;
			var addr = operand;

			operand = this.MM[operand];

			bitShiftedOff = operand & 0x01;
			operand = (operand >> 1) & 0xFF;
			operand = (this.flagC) ? (operand | 0x80) : operand;
			this.MM[addr] = operand;
		}

		this.flagC = (bitShiftedOff) ? true : false;
		
		this.flagN = (operand & 0x80) ? true : false;
		this.flagZ = (operand === 0) ? true : false;

		switch(addrMode){
			case ACCUMULATOR: 
				return 2;
			case ZERO_PAGE:
				return 5;
			case ABSOLUTE:
			 	return  6;
			case ZERO_PAGE_X:
				return 6;
			case ABSOLUTE_X: 
				return 7;
			default:
				return 3;
		}
	}

	//ReTurn from Interrupt
	//First, pop byte representing flags off of stack, 
	//and restore flags. Then, pop word off of stack, 
	//which will be put in PC.
	CPU.prototype.RTI = function(operand, addrMode){
		this.regSP = (this.regSP+1) & 0xFF;
		var tmp = this.MM[this.regSP+0x100];

		this.pToFlags(tmp);

		this.regSP = (this.regSP+1) & 0xFF;
		tmp = this.MM[this.regSP+0x100];

		this.regSP = (this.regSP+1) & 0xFF;
		var tmphi = this.MM[this.regSP+0x100];

		this.regPC = tmp | (tmphi << 8);

		return 6;
	}

	//ReTurn from Subroutine
	//Pops word off the stack, then put it into regPC.
	//Flags are NOT affected!
	CPU.prototype.RTS = function(operand, addrMode){
		this.regSP = (this.regSP+1) & 0xFF;
		var tmp = this.MM[this.regSP+0x100];

		this.regSP = (this.regSP+1) & 0xFF;
		var tmphi = this.MM[this.regSP+0x100];

		//TODO: should the +1 cross a page boundary or wrap?
		this.regPC = (tmp | (tmphi << 8)) + 1;

		return 6;
	}

	//SuBtract with Carry
	//BINARY subtraction
	//Subtract operand from regA, then subtract (NOT)flagC, and store 
	//result in regA. We negate flagC to make the calculation in line 
	//with the 6502 two's complement arithmetic.
	//Set flagC when result >= 0.
	//Set flagV when bit 7 of of the result and regA before the operation 
	//differ, meaning the signed result was less than -128 or greater than
	//+127.
	//Set flagN and flagZ accordingly.
	CPU.prototype.SBC = function(operand, addrMode){
		this.refBus.lastMMread = operand;
		operand = this.MM[operand];

		var result = this.regA - operand - (!this.flagC);

		this.flagC = (result >= 0) ? true : false;

		result &= 0xFF;

		//See ADC for overflow explanation
		//Set overflow if pos - neg = neg OR neg - pos = pos
		this.flagV = (((this.regA ^ operand) & 0x80) && ((this.regA ^ result) & 0x80)) ? true : false;
		
		this.regA = result;
		
		this.flagN = (result & 0x80) ? true : false;
		this.flagZ = (result === 0) ? true : false;

		switch(addrMode){
			case IMMEDIATE: 
				return 2;
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			case ZERO_PAGE_X: 
				return 4;
			case ABSOLUTE_X: 
				return 4;
			case ABSOLUTE_Y: 
				return 4;
			case INDIRECT_X:
				return 6;
			case INDIRECT_Y: 
				return 5;
			default:
				return 3;
		}
	}

	//SEt flagC
	CPU.prototype.SEC = function(operand, addrMode){
		this.flagC = true;

		return 2;
	}

	//SEt flagD
	CPU.prototype.SED = function(operand, addrMode){
		this.flagD = true;

		return 2;
	}

	//SEt flagI
	CPU.prototype.SEI = function(operand, addrMode){
		this.flagI = true;

		return 2;
	}

	//STA, STX, and STY do NOT take extra cycles on page crossing!!!

	//STore regA in memory
	CPU.prototype.STA = function(operand, addrMode){
		this.refBus.lastMMwrite = operand;
		this.MM[operand] = this.regA;

		switch(addrMode){
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			case ZERO_PAGE_X: 
				return 4;
			case ABSOLUTE_X: 
				return 4;
			case ABSOLUTE_Y: 
				return 4;
			case INDIRECT_X:
				return 6;
			case INDIRECT_Y: 
				return 5;
			default:
				return 3;
		}
	}

	//STore regX in memory
	CPU.prototype.STX = function(operand, addrMode){
		this.refBus.lastMMwrite = operand;
		this.MM[operand] = this.regX;

		switch(addrMode){
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			case ZERO_PAGE_Y: 
				return 4;
			default:
				return 3;
		}
	}

	//STore regY in memory
	CPU.prototype.STY = function(operand, addrMode){
		this.refBus.lastMMwrite = operand;
		this.MM[operand] = this.regY;

		switch(addrMode){
			case ZERO_PAGE:
				return 3;
			case ABSOLUTE: 
				return 4;
			case ZERO_PAGE_X: 
				return 4;
			default:
				return 3;
		}
	}

	//Transfer regA to regX
	//Value of regA does not change, adjust flagN and flagZ according to
	//the value transferred
	CPU.prototype.TAX = function(operand, addrMode){
		var tmp = this.regX = this.regA;

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;

		return 2;
	}

	//Transfer regA to regY
	CPU.prototype.TAY = function(operand, addrMode){
		var tmp = this.regY = this.regA;

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;

		return 2;
	}

	//Transfer regSp to regX
	CPU.prototype.TSX = function(operand, addrMode){
		var tmp = this.regX = this.regSP;

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;

		return 2;
	}

	//Transfer regX to regA
	CPU.prototype.TXA = function(operand, addrMode){
		var tmp = this.regA = this.regX;

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;

		return 2;
	}

	//Transfer regX to regSp
	//DOES NOT AFFECT FLAGS!!!
	CPU.prototype.TXS = function(operand, addrMode){
		this.regSP = this.regX;

		return 2;
	}

	//Transfer regY to regA
	CPU.prototype.TYA = function(operand, addrMode){
		var tmp = this.regA = this.regY;

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;

		return 2;
	}

	//Encapsulates branching logic, including 
	//rules for # of cycles taken
	function __genericBranch(operand, condition){
		if(condition){
			var tmp = (this.regPC + operand) & 0xFFFF;
			if(didPageCrossOccur(this.regPC, tmp)){
				this.regExtraCycles = 2;
			} else {
				this.regExtraCycles = 1;
			}
			this.regPC = tmp; //Typed array will wrap value
		} else {
			this.regExtraCycles = 0;
		}
	}

	//Encapsulates comparisons
	//set flagZ if reg === operand
	//set flagN if bit 7 of diff is set
	//set flagC if operand <= reg
	//reg - operand -> <not stored; eval only>
	function __genericComparison(operand, regID){
		//Use the scratch byte for automatic wrapping
		scratchByte[0] = this._regs[regID];
		scratchByte[0] -= operand;

		this.flagZ = (scratchByte[0] === 0) ? true : false;
		this.flagN = (scratchByte[0] & 0x80) ? true : false;
		this.flagC = (this._regs[regID] >= operand) ? true : false;
	}

	//Copy srcReg into dstReg; srcReg does not change.
	//Adjust flagN and flagZ according to the value transferred
	function __genericTransfer(srcReg, dstReg){
		var tmp = this._regs[dstReg] = this._regs[srcReg];
		__adjustNZ.call(this, tmp);
	}

	//Adjust flagN and flagZ
	function __adjustNZ(val){
		this.flagN = (val & 0x80) ? true : false;
		this.flagZ = (val === 0) ? true : false;
	}

	/***********************ADDRESSING MODE LOGIC***********************/

	// ****************ALL PC INCREMENTS (but not all changes) TAKE PLACE HERE******************

	//Functions to retrieve the desired operand from memory. RESPONSIBLE FOR
	//INCREMENTING PC. Returns the formatted operand. Must be invoked with Function#call(thisArg)

	//Operand is the accumulator (A) register.
	//This usually means the operation will change the value of
	//regA.
	CPU.prototype.accumulatorOperand = function(){
		this.regPC += 1;
		return this.regA;
	}

	//Operand is the byte after the instruction
	CPU.prototype.immediateOperand = function(){
		var addr = this.regPC + 1;
		this.regPC += 2; //Reads operation, then operand
		return addr;
	}

	//Operand is the byte after the instruction, coerces to the 
	//range -128 to +127
	CPU.prototype.relativeOperand = function(){
		var addr = this.regPC + 1;
		this.regPC += 2; //Reads operation, then operand
		return addr;
	}

	//Basically a placeholder, as implied addressing means no
	//operands are needed
	CPU.prototype.impliedOperand = function(){
		this.regPC += 1;
		return 0;
	}

	//Get a byte in range $0000 to $00FF
	CPU.prototype.zeroPageOperand = function(){
		var addr = this.MM[this.regPC + 1]
		this.regPC += 2 //Reads operation, then operand address
		return addr;
	}

	//Add X register to immediate operand to get a zero page address ($0000 - $00FF).
	//This means that the final address MUST BE WRAPPED past 0xFF before it is read from!
	CPU.prototype.zeroPageIndexedXOperand = function(){
		var memAddr = (this.MM[this.regPC + 1]) + this.regX;
		memAddr = memAddr & 0xFF;
		this.regPC += 2;
		return memAddr;
	}

	//Same as zero page indexed X, but w/ regY
	CPU.prototype.zeroPageIndexedYOperand = function(){
		var memAddr = (this.MM[this.regPC + 1]) + this.regY;
		memAddr = memAddr & 0xFF;
		this.regPC += 2;
		return memAddr;
	}

	//The next two bytes in memory form a ('lil endian) word, which is the address of
	//a byte in main memory ($0000 to $FFFF);

	//TODO: should the absolute bytes that form memaddr wrap around the page?
	CPU.prototype.absoluteOperand = function(){
		var pc = this.regPC;
		var memAddr = this.MM[pc+1] | (this.MM[pc+2] << 8);
		this.regPC += 3;
		return memAddr;
	}

	//These two take the next two bytes in memory to form a word, then add the value of
	//the X or Y register to form the desired memory address. These two functions usually
	//require an extra machine cycle if adding the register to the initial memory address
	//crosses over to a different page.

	CPU.prototype.absoluteIndexedXOperand = function(){
		var pc = this.regPC;
		var baseAddr = this.MM[pc+1] | (this.MM[pc+2] << 8);
		var memAddr = baseAddr + this.regX;

		this.regPageCross = ((baseAddr & 0xFF00) !== (memAddr & 0xFF00)) ? 1 : 0;

		this.regPC += 3;
		return memAddr;
	}

	CPU.prototype.absoluteIndexedYOperand = function(){
		var pc = this.regPC;
		var baseAddr = this.MM[pc+1] | (this.MM[pc+2] << 8);
		var memAddr = baseAddr + this.regY;

		this.regPageCross = ((baseAddr & 0xFF00) !== (memAddr & 0xFF00)) ? 1 : 0;

		this.regPC += 3;
		return memAddr;
	}

	//This mode simply takes the next word in memory as the address of the 
	//operand, which is in this case a 16 bit address for JMP
	CPU.prototype.absoluteIndirectOperand = function(){
		var pc = this.regPC;
		var baseAddr = this.MM[pc+1] | (this.MM[pc+2] << 8);
		var memAddr = this.MM[baseAddr] | (this.MM[baseAddr+1] << 8);
		this.regPC += 3;

		return memAddr;
	}

	//This mode, also known as pre-indexed indirect addressing, first takes a zero page 
	//address as the immediate operand, adds the X register to it (with wraparound),
	//and uses that calculated address as the address of a word to read from memory, 
	//which will be the absolute address of the final operand. Always takes 6 cycles.
	CPU.prototype.indirectIndexedXOperand = function(){
		var indirectAddr = this.MM[this.regPC+1] + this.regX;
		indirectAddr = indirectAddr & 0xFF;
		var indirectAddrHi = (indirectAddr+1) & 0xFF;
		var memAddr = this.MM[indirectAddr] | (this.MM[indirectAddrHi] << 8);
		this.regPC += 2;
		return memAddr;
	}

	//This mode, also known as post-indexed indirect addressing, first takes a zero page
	//address as an immediate operand, and reads a word from that zero page address.
	//That word plus the value of the Y register gives the absolute address of
	//the final operand. Usually requires an extra cycle if a page cross occurs when
	//adding the Y register.
	CPU.prototype.indirectIndexedYOperand = function(){
		var indirectAddr = this.MM[this.regPC + 1];
		var indirectAddrHi = (indirectAddr+1) & 0xFF;

		var baseAddrLo = this.MM[indirectAddr];
		var baseAddrHi = this.MM[indirectAddrHi];
		var baseAddr = baseAddrLo + (baseAddrHi << 8);

		var memAddr = baseAddr + this.regY;

		this.regPageCross = ((baseAddr & 0xFF00) !== (memAddr & 0xFF00)) ? 1 : 0;
		
		this.regPC += 2;
		return memAddr;
	}

	//These functions are the same at their correlates above, except
	//they only return the resolved address and not the operand
	//the address points to. Used primarily by opcodes which 
	//directly manipulate the value at a memory address

	//This particular func is here for completeness only
	function accumulatorAddr(){
		this.regPC += 1;
		return this.regA;
	}

	function zeroPageAddr(){
		//TODO: should perform bounds check?
		var memAddr = this.readByte(this.regPC + 1);
		this.regPC += 2;
		return memAddr;
	}

	function zeroPageIndexedXAddr(){
		var memAddr = this.readByte(this.regPC + 1) + this.regX;
		this.regPC += 2;
		return memAddr & 0xFF;
	}

	function zeroPageIndexedYAddr(){
		var memAddr = this.readByte(this.regPC + 1) + this.regY;
		this.regPC += 2;
		return memAddr & 0xFF;
	}

	function absoluteAddr(){
		var memAddr = this.readWord(this.regPC + 1);
		this.regPC += 3;
		return memAddr;
	}

	function absoluteIndexedXAddr(){
		var baseAddr = this.readWord(this.regPC + 1)
		var memAddr = baseAddr + this.regX;
		if (didPageCrossOccur(baseAddr, memAddr)){
			this.regExtraCycles = 1;
		} else {
			this.regExtraCycles = 0;
		}
		//TODO: is this wrapping necessary?
		memAddr = memAddr & 0xFFFF;
		this.regPC += 3;
		return memAddr;
	}

	function absoluteIndexedYAddr(){
		var baseAddr = this.readWord(this.regPC + 1)
		var memAddr = baseAddr + this.regY;
		if (didPageCrossOccur(baseAddr, memAddr)){
			this.regExtraCycles = 1;
		} else {
			this.regExtraCycles = 0;
		}
		//TODO: is this wrapping necessary?
		memAddr = memAddr & 0xFFFF;
		this.regPC += 3;
		return memAddr;
	}

	function indirectIndexedXAddr(){
		var indirectAddr = this.readByte(this.regPC + 1) + this.regX;
		indirectAddr = indirectAddr & 0xFF;
		var memAddrLo = this.readByte(indirectAddr);
		var memAddrHi = this.readByte((indirectAddr + 1) & 0xFF);
		var memAddr = memAddrLo + (memAddrHi << 8);
		this.regPC += 2;
		return memAddr;
	}

	function indirectIndexedYAddr(){
		var indirectAddr = this.readByte(this.regPC + 1);
		var baseAddrLo = this.readByte(indirectAddr);
		var baseAddrHi = this.readByte((indirectAddr + 1) & 0xFF);
		var baseAddr = baseAddrLo + (baseAddrHi << 8);
		var memAddr = baseAddr + this.regY;
		if (didPageCrossOccur(baseAddr, memAddr)){
			this.regExtraCycles = 1;
		} else {
			this.regExtraCycles = 0;
		}
		memAddr = memAddr & 0xFFFF;
		this.regPC += 2;
		return memAddr;
	}


	/**************************MISC************************/

	//unsigned to signed conversion
	//Coerces a value in the range 0 to 255 to the range
	//-128 to +127 (2s complement)
	function utos(val){
		if(val < 128){
			return val;
		} else {
			return val - 256;
		}
	}

	function didPageCrossOccur(valBefore, valAfter){
		return (valBefore & 0xFF00) !== (valAfter & 0xFF00);
	}

	//Workspace for intermediate calculations that require wrapping
	var scratchByte = new Uint8Array(1);

})();