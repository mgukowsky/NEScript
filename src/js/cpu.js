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

	var CPU = NEScript.CPU = function(){
		this._mainMemory = new NEScript.RAM(0x10000);

		//Use typed arrays to make values wrap for us

		//8 bit registers
		this._regs = new Uint8Array(5);
		//Point to the end of the stack (offset from $0100); 
		//stack is $0100 - $01FF
		this._regs[regSP] = 0xFF;
		//Only one 16 bit register
		this._regPC = new Uint16Array(1);

		//Since we don't have to wrap them, the most efficient way
		//to store the flags is as individual bools (will be coerced into
		//0 or 1 where appropriate)
		this.flagN = false;
		this.flagV = false;
		this.flagTrash = true; //Bit 5 in 6502 P register. Not used, but should always be on.
		this.flagB = false;
		this.flagD = false;
		this.flagI = false;
		this.flagZ = false;
		this.flagC = false;

		//The following registers do not appear on the actual
		//6502 CPU, and are specific to this implementation.

		//Used by some opcodes to check for a page 
		//crossing in this particular implementation.
		this._regExtraCycles = 0;
		//Some opcodes vary in their behavior depending on the addressing mode
		this._regCurrentAddressingMode = null;
		//The type of interrupt raised
		this._regInterrupt = INTERRUPT_NONE;
	}

	CPU.prototype.dumpRegs = function(){
		var output =  {
			A: this._regs[regA],
			X: this._regs[regX],
			Y: this._regs[regY],
			P: this._regs[regP],
			flagN: this.flagN,
			flagV: this.flagV,
			flagB: this.flagB,
			flagD: this.flagD,
			flagI: this.flagI,
			flagZ: this.flagZ, 
			flagC: this.flagC,
			SP: this._regs[regSP],
			PC: this._regPC[regPC]
		}

		return output;
	}

	CPU.prototype.totalReset = function(){
		this._regs = new Uint8Array(5);
		this._regs[regSP] = 0xFF;
		this._regPC = new Uint16Array(1);
		//Don't create a new RAM object here, since other objects share this particular reference
		this._mainMemory.reset();
		this.flagN = false;
		this.flagV = false;
		this.flagTrash = true;
		this.flagB = false;
		this.flagD = false;
		this.flagI = false;
		this.flagZ = false;
		this.flagC = false;
		this._regExtraCycles = 0;
		this._regCurrentAddressingMode = null;
	}

	//Interrupt and cycle handling takes place here
	CPU.prototype.executeNext = function(){
		var extraCycles = 0;
		if(this._regInterrupt){ //anything but zero means an interrupt
			extraCycles = this.handleInterrupt();
			//Block CPU from executing on DMA
			if(this._regInterrupt === INTERRUPT_DMA){
				return extraCycles;
			}
		}
		//Execute the opcode at PC (PC will have likely been moved if an interrupt
		//took place)
		var opcode = this.readByte(this._regPC[regPC]);
		return this.execute(opcode) + extraCycles;
	}

	//Decodes an opcode into an ALU operation, addressing mode, and cycle group, then executes it.
	//Returns the # of cycles taken.
	CPU.prototype.execute = function(opcode){
		//Given this implementation, the second 'this' is what get matters (it gets pushed on as
		//the last argument to the bound function that is retrieved from procMap).
		//Given this, the first 'this' is superfluous, but semantically is a bit clearer
		//try{
			var cyclesTaken = procMap[opcode].call(this, this);
		//} catch(e){
			// var errMsg = "Tried to execute illegal opcode: 0x" + opcode.toString(16);
			// throw new Error(errMsg);
		//}

		//Some opcodes require an extra cycle or two if certain conditions were met during 
		//opcode logic
		if (pageCrossOpcodes[opcode]){
			return cyclesTaken + this._regExtraCycles;
		} else {
			return cyclesTaken
		}
	}

	//It would be nice to have omnibus R/W functions, but we need the granularity for byte vs. word
	//Note that these functions take care of address mirroring
	CPU.prototype.readByte = function(address){
		address = _coerceAddress.call(this, address);
		tmp = this._mainMemory.readByte(address);
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

	CPU.prototype.writeByte = function(address, value){
		address = _coerceAddress.call(this, address);
		this._mainMemory.writeByte(address, value);
	}

	CPU.prototype.readWord = function(address){
		address = _coerceAddress.call(this, address);
		if(address === 0x07FF){
			return _readBoundaryWord.call(this, 0x07FF, 0x0000);
		} else if (address === 0x2007){
			return _readBoundaryWord.call(this, 0x2007, 0x2000);
		} else {
			return this._mainMemory.readWord(address);
		}
	}

	CPU.prototype.writeWord = function(address, value){
		address = _coerceAddress.call(this, address);
		if(address === 0x07FF){
			_writeBoundaryWord.call(this, 0x07FF, 0x0000, value);
		} else if (address === 0x2007){
			_writeBoundaryWord.call(this, 0x2007, 0x2000, value);
		} else {
			this._mainMemory.writeWord(address, value);
		}
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
		this.writeByte(this._regs[regSP] + STACK_OFFSET, val);
		this._regs[regSP] -= 1;
	}

	CPU.prototype.popByte = function(){
		this._regs[regSP] += 1;
		var tmpVal = this.readByte(this._regs[regSP] + STACK_OFFSET);
		return tmpVal;
	}

	//Can't use CPU write/read word funcs b/c we want the 
	//stack to wrap
	CPU.prototype.pushWord = function(val){
		//Hi byte at higher stack address
		var sO = STACK_OFFSET; //Tiny scope optimization
		this.writeByte(this._regs[regSP] + sO, (val & 0xFF00) >> 8);
		this._regs[regSP] -= 1
		this.writeByte(this._regs[regSP] + sO, val & 0xFF);
		this._regs[regSP] -= 1;
	}

	CPU.prototype.popWord = function(val){
		var sO = STACK_OFFSET;
		this._regs[regSP] += 1
		var lobyte = this.readByte(this._regs[regSP] + sO);
		this._regs[regSP] += 1
		var hibyte = this.readByte(this._regs[regSP] + sO);
		return (lobyte + (hibyte << 8));
	}

	CPU.prototype.postInterrupt = function(type){
		//Might mask an IRQ, execute an NMI or RESET unconditionally
		if (type === INTERRUPT_IRQ && this.flagI){
			return;
		}
		this._regInterrupt = type;
	}

	CPU.prototype.startDMA =  function(startAddr, OAMRef){
		this.DMAAddress = startAddr;
		//Exact number of cycles varies by source, but most agree that this many cycles 
		//are needed. Will take 512 + 1 cycles (the check for >256 in executeDMAStep)
		this.DMACounter = 0;
		this.DMADestination = OAMRef;
		this.postInterrupt(INTERRUPT_DMA);
	}

	CPU.prototype.handleInterrupt = function(){
		if (this._regInterrupt === INTERRUPT_IRQ){
			this.pushWord(this._regPC[regPC]);
			this.pushByte(this.flagsToP());
			//We set flagI after we push the flags, b/c RTI does not actually touch it
			this.flagI = true;
			this._regPC[regPC] = this.readWord(VECTOR_IRQ);
		} else if (this._regInterrupt === INTERRUPT_NMI){
			this.pushWord(this._regPC[regPC]);
			this.pushByte(this.flagsToP());
			this.flagI = true;
			this._regPC[regPC] = this.readWord(VECTOR_NMI);
		} else if (this._regInterrupt === INTERRUPT_DMA){
			//Exit prematurely if in DMA
			return executeDMAStep.call(this);
		} else { //reset
			this._regPC[regPC] = this.readWord(VECTOR_RESET);
		}

		this._regInterrupt = INTERRUPT_NONE;
		return 7 //Attending to an interrupt takes an extra 7 cycles
	}

	/*********************************IMPLEMENTATION*****************************/

	function _coerceAddress(addr){
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

	function _readBoundaryWord(loaddr, hiaddr){
		var hibyte = this.readByte(hiaddr);
		var lobyte = this.readByte(loaddr); //RAM will correctly record this as the las address read from
		return lobyte + (hibyte << 8);
	}


	function _writeBoundaryWord(loaddr, hiaddr, value){
		this.writeByte(hiaddr, (value & 0xFF00) >> 8);
		this.writeByte(loaddr, value & 0xFF);
	}

	//Pulls together all of the execution logic.
	//It's a little hacky, but since call cannot override the thisArg set by Function#bind, we 
	//have to pass in a final thisArg argument.
	//Returns the # of cycles taken.
	function _execute(operation, addrMode, cycleMapName, thisArg){
		thisArg._regCurrentAddressingMode = addrMode;
		//Addressing mode dicates how we get the operand
		var operand = operandRetrievers[addrMode].call(thisArg);
		operation.call(thisArg, operand);
		var cycleMap = masterCycleMap[cycleMapName]
		return cycleMap[addrMode];
	}

	//JS parsers should accept hex or dec keys; procMap[255] and
	//procMap[0xFF] should return the same value, since the hex literal
	//is converted to a dec before conversion to a string key (I guess)
	var procMap = {
		0x00: _execute.bind(null, _BRK, IMPLIED, "BRK"),
		0x01: _execute.bind(null, _ORA, INDIRECT_X, "ORA"),
		0x05: _execute.bind(null, _ORA, ZERO_PAGE, "ORA"),
		0x06: _execute.bind(null, _ASL, ZERO_PAGE_ADDR, "ASL"),
		0x08: _execute.bind(null, _PHP, IMPLIED, "PHP"),
		0x09: _execute.bind(null, _ORA, IMMEDIATE, "ORA"),
		0x0A: _execute.bind(null, _ASL, ACCUMULATOR, "ASL"),
		0x0D: _execute.bind(null, _ORA, ABSOLUTE, "ORA"),
		0x0E: _execute.bind(null, _ASL, ABSOLUTE_ADDR, "ASL"),

		0x10: _execute.bind(null, _BPL, RELATIVE, "BPL"),
		0x11: _execute.bind(null, _ORA, INDIRECT_Y, "ORA"),
		0x15: _execute.bind(null, _ORA, ZERO_PAGE_X, "ORA"),
		0x16: _execute.bind(null, _ASL, ZERO_PAGE_X_ADDR, "ASL"),
		0x18: _execute.bind(null, _CLC, IMPLIED, "CLC"),
		0x19: _execute.bind(null, _ORA, ABSOLUTE_Y, "ORA"),
		0x1D: _execute.bind(null, _ORA, ABSOLUTE_X, "ORA"),
		0x1E: _execute.bind(null, _ASL, ABSOLUTE_X_ADDR, "ASL"),

		0x20: _execute.bind(null, _JSR, ABSOLUTE_ADDR, "JSR"),
		0x21: _execute.bind(null, _AND, INDIRECT_X, "AND"),
		0x24: _execute.bind(null, _BIT, ZERO_PAGE, "BIT"),
		0x25: _execute.bind(null, _AND, ZERO_PAGE, "AND"),
		0x26: _execute.bind(null, _ROL, ZERO_PAGE_ADDR, "ROL"),
		0x28: _execute.bind(null, _PLP, IMPLIED, "PLP"),
		0x29: _execute.bind(null, _AND, IMMEDIATE, "AND"),
		0x2A: _execute.bind(null, _ROL, ACCUMULATOR, "ROL"),
		0x2C: _execute.bind(null, _BIT, ABSOLUTE, "BIT"),
		0x2D: _execute.bind(null, _AND, ABSOLUTE, "AND"),
		0x2E: _execute.bind(null, _ROL, ABSOLUTE_ADDR, "ROL"),
		
		0x30: _execute.bind(null, _BMI, RELATIVE, "BMI"),
		0x31: _execute.bind(null, _AND, INDIRECT_Y, "AND"),
		0x35: _execute.bind(null, _AND, ZERO_PAGE_X, "AND"),
		0x36: _execute.bind(null, _ROL, ZERO_PAGE_X_ADDR, "ROL"),
		0x38: _execute.bind(null, _SEC, IMPLIED, "SEC"),
		0x39: _execute.bind(null, _AND, ABSOLUTE_Y, "AND"),
		0x3D: _execute.bind(null, _AND, ABSOLUTE_X, "AND"),
		0x3E: _execute.bind(null, _ROL, ABSOLUTE_X_ADDR, "ROL"),

		0x40: _execute.bind(null, _RTI, IMPLIED, "RTI"),
		0x41: _execute.bind(null, _EOR, INDIRECT_X, "EOR"),
		0x45: _execute.bind(null, _EOR, ZERO_PAGE, "EOR"),
		0x46: _execute.bind(null, _LSR, ZERO_PAGE_ADDR, "LSR"),
		0x48: _execute.bind(null, _PHA, IMPLIED, "PHA"),
		0x49: _execute.bind(null, _EOR, IMMEDIATE, "EOR"),
		0x4A: _execute.bind(null, _LSR, ACCUMULATOR, "LSR"),
		0x4C: _execute.bind(null, _JMP, ABSOLUTE_ADDR, "JMP"),
		0x4D: _execute.bind(null, _EOR, ABSOLUTE, "EOR"),
		0x4E: _execute.bind(null, _LSR, ABSOLUTE_ADDR, "LSR"),
		
		0x50: _execute.bind(null, _BVC, RELATIVE, "BVC"),
		0x51: _execute.bind(null, _EOR, INDIRECT_Y, "EOR"),
		0x55: _execute.bind(null, _EOR, ZERO_PAGE_X, "EOR"),
		0x56: _execute.bind(null, _LSR, ZERO_PAGE_X_ADDR, "LSR"),
		0x58: _execute.bind(null, _CLI, IMPLIED, "CLI"),
		0x59: _execute.bind(null, _EOR, ABSOLUTE_Y, "EOR"),
		0x5D: _execute.bind(null, _EOR, ABSOLUTE_X, "EOR"),
		0x5E: _execute.bind(null, _LSR, ABSOLUTE_X_ADDR, "LSR"),

		0x60: _execute.bind(null, _RTS, IMPLIED, "RTS"),
		0x61: _execute.bind(null, _ADC, INDIRECT_X, "ADC"),
		0x65: _execute.bind(null, _ADC, ZERO_PAGE, "ADC"),
		0x66: _execute.bind(null, _ROR, ZERO_PAGE_ADDR, "ROR"),
		0x68: _execute.bind(null, _PLA, IMPLIED, "PLA"),
		0x69: _execute.bind(null, _ADC, IMMEDIATE, "ADC"),
		0x6A: _execute.bind(null, _ROR, ACCUMULATOR, "ROR"),
		0x6C: _execute.bind(null, _JMP, ABSOLUTE_INDIRECT, "JMP"),
		0x6D: _execute.bind(null, _ADC, ABSOLUTE, "ADC"),
		0x6E: _execute.bind(null, _ROR, ABSOLUTE_ADDR, "ROR"),
		
		0x70: _execute.bind(null, _BVS, RELATIVE, "BVS"),
		0x71: _execute.bind(null, _ADC, INDIRECT_Y, "ADC"),
		0x75: _execute.bind(null, _ADC, ZERO_PAGE_X, "ADC"),
		0x76: _execute.bind(null, _ROR, ZERO_PAGE_X_ADDR, "ROR"),
		0x78: _execute.bind(null, _SEI, IMPLIED, "SEI"),
		0x79: _execute.bind(null, _ADC, ABSOLUTE_Y, "ADC"),
		0x7D: _execute.bind(null, _ADC, ABSOLUTE_X, "ADC"),
		0x7E: _execute.bind(null, _ROR, ABSOLUTE_X_ADDR, "ROR"),

		0x81: _execute.bind(null, _STA, INDIRECT_X_ADDR, "STA"),
		0x84: _execute.bind(null, _STY, ZERO_PAGE_ADDR, "STY"),
		0x85: _execute.bind(null, _STA, ZERO_PAGE_ADDR, "STA"),
		0x86: _execute.bind(null, _STX, ZERO_PAGE_ADDR, "STX"),
		0x88: _execute.bind(null, _DEY, IMPLIED, "DEY"),
		0x8A: _execute.bind(null, _TXA, IMPLIED, "TXA"),
		0x8C: _execute.bind(null, _STY, ABSOLUTE_ADDR, "STY"),
		0x8D: _execute.bind(null, _STA, ABSOLUTE_ADDR, "STA"),
		0x8E: _execute.bind(null, _STX, ABSOLUTE_ADDR, "STX"),
		
		0x90: _execute.bind(null, _BCC, RELATIVE, "BCC"),
		0x91: _execute.bind(null, _STA, INDIRECT_Y_ADDR, "STA"),
		0x94: _execute.bind(null, _STY, ZERO_PAGE_X_ADDR, "STY"),
		0x95: _execute.bind(null, _STA, ZERO_PAGE_X_ADDR, "STA"),
		0x96: _execute.bind(null, _STX, ZERO_PAGE_Y_ADDR, "STX"),
		0x98: _execute.bind(null, _TYA, IMPLIED, "TYA"),
		0x99: _execute.bind(null, _STA, ABSOLUTE_Y_ADDR, "STA"),
		0x9A: _execute.bind(null, _TXS, IMPLIED, "TXS"),
		0x9D: _execute.bind(null, _STA, ABSOLUTE_X_ADDR, "STA"),

		0xA0: _execute.bind(null, _LDY, IMMEDIATE, "LDY"),
		0xA1: _execute.bind(null, _LDA, INDIRECT_X, "LDA"),
		0xA2: _execute.bind(null, _LDX, IMMEDIATE, "LDX"),
		0xA4: _execute.bind(null, _LDY, ZERO_PAGE, "LDY"),
		0xA5: _execute.bind(null, _LDA, ZERO_PAGE, "LDA"),
		0xA6: _execute.bind(null, _LDX, ZERO_PAGE, "LDX"),
		0xA8: _execute.bind(null, _TAY, IMPLIED, "TAY"),
		0xA9: _execute.bind(null, _LDA, IMMEDIATE, "LDA"),
		0xAA: _execute.bind(null, _TAX, IMPLIED, "TAX"),
		0xAC: _execute.bind(null, _LDY, ABSOLUTE, "LDY"),
		0xAD: _execute.bind(null, _LDA, ABSOLUTE, "LDA"),
		0xAE: _execute.bind(null, _LDX, ABSOLUTE, "LDX"),
		
		0xB0: _execute.bind(null, _BCS, RELATIVE, "BCS"),
		0xB1: _execute.bind(null, _LDA, INDIRECT_Y, "LDA"),
		0xB4: _execute.bind(null, _LDY, ZERO_PAGE_X, "LDY"),
		0xB5: _execute.bind(null, _LDA, ZERO_PAGE_X, "LDA"),
		0xB6: _execute.bind(null, _LDX, ZERO_PAGE_Y, "LDX"),
		0xB8: _execute.bind(null, _CLV, IMPLIED, "CLV"),
		0xB9: _execute.bind(null, _LDA, ABSOLUTE_Y, "LDA"),
		0xBA: _execute.bind(null, _TSX, IMPLIED, "TSX"),
		0xBC: _execute.bind(null, _LDY, ABSOLUTE_X, "LDY"),
		0xBD: _execute.bind(null, _LDA, ABSOLUTE_X, "LDA"),
		0xBE: _execute.bind(null, _LDX, ABSOLUTE_Y, "LDX"),

		0xC0: _execute.bind(null, _CPY, IMMEDIATE, "CPY"),
		0xC1: _execute.bind(null, _CMP, INDIRECT_X, "CMP"),
		0xC4: _execute.bind(null, _CPY, ZERO_PAGE, "CPY"),
		0xC5: _execute.bind(null, _CMP, ZERO_PAGE, "CMP"),
		0xC6: _execute.bind(null, _DEC, ZERO_PAGE_ADDR, "DEC"),
		0xC8: _execute.bind(null, _INY, IMPLIED, "INY"),
		0xC9: _execute.bind(null, _CMP, IMMEDIATE, "CMP"),
		0xCA: _execute.bind(null, _DEX, IMPLIED, "DEX"),
		0xCC: _execute.bind(null, _CPY, ABSOLUTE, "CPY"),
		0xCD: _execute.bind(null, _CMP, ABSOLUTE, "CMP"),
		0xCE: _execute.bind(null, _DEC, ABSOLUTE_ADDR, "DEC"),
		
		0xD0: _execute.bind(null, _BNE, RELATIVE, "BNE"),
		0xD1: _execute.bind(null, _CMP, INDIRECT_Y, "CMP"),
		0xD5: _execute.bind(null, _CMP, ZERO_PAGE_X, "CMP"),
		0xD6: _execute.bind(null, _DEC, ZERO_PAGE_X_ADDR, "DEC"),
		0xD8: _execute.bind(null, _CLD, IMPLIED, "CLD"),
		0xD9: _execute.bind(null, _CMP, ABSOLUTE_Y, "CMP"),
		0xDD: _execute.bind(null, _CMP, ABSOLUTE_X, "CMP"),
		0xDE: _execute.bind(null, _DEC, ABSOLUTE_X_ADDR, "DEC"),

		0xE0: _execute.bind(null, _CPX, IMMEDIATE, "CPX"),
		0xE1: _execute.bind(null, _SBC, INDIRECT_X, "SBC"),
		0xE4: _execute.bind(null, _CPX, ZERO_PAGE, "CPX"),
		0xE5: _execute.bind(null, _SBC, ZERO_PAGE, "SBC"),
		0xE6: _execute.bind(null, _INC, ZERO_PAGE_ADDR, "INC"),
		0xE8: _execute.bind(null, _INX, IMPLIED, "INX"),
		0xE9: _execute.bind(null, _SBC, IMMEDIATE, "SBC"),
		0xEA: _execute.bind(null, _NOP, IMPLIED, "NOP"),
		0xEC: _execute.bind(null, _CPX, ABSOLUTE, "CPX"),
		0xED: _execute.bind(null, _SBC, ABSOLUTE, "SBC"),
		0xEE: _execute.bind(null, _INC, ABSOLUTE_ADDR, "INC"),
		
		0xF0: _execute.bind(null, _BEQ, RELATIVE, "BEQ"),
		0xF1: _execute.bind(null, _SBC, INDIRECT_Y, "SBC"),
		0xF5: _execute.bind(null, _SBC, ZERO_PAGE_X, "SBC"),
		0xF6: _execute.bind(null, _INC, ZERO_PAGE_X_ADDR, "INC"),
		0xF8: _execute.bind(null, _SED, IMPLIED, "SED"),
		0xF9: _execute.bind(null, _SBC, ABSOLUTE_Y, "SBC"),
		0xFD: _execute.bind(null, _SBC, ABSOLUTE_X, "SBC"),
		0xFE: _execute.bind(null, _INC, ABSOLUTE_X_ADDR, "INC")
	};

	function executeDMAStep(){
		if(this.DMACounter >= 256){
			this.postInterrupt(INTERRUPT_NONE);
			//Only scenario where 1 cycle is returned by a call to executeNext
			return 1;
		}

		var dataToSend = this.readByte(this.DMAAddress);
		this.DMADestination.writeByte(this.DMACounter, dataToSend);

		this.DMAAddress++;
		this.DMACounter++;

		return 2;
	}

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
	//Because these are private functions, they need to be invoked with Function#call(thisArg)

	//regPC is moved past the opcode and operands BEFORE 
	//any of these are called!!! This means the opcode for 
	//any of these operations in memory is at regPC - (1 + <# of bytes in operand>)
	//at the time any of these are invoked.

	//AdD memory and accumulator and Carry
	//BINARY addition
	//regA + memoryOperand + carry flag -> regA
	function _ADC(operand){
		var result = operand + this._regs[regA] + this.flagC;
		
		this.flagC = (result > 0xFF) ? true : false;

		result &= 0xFF;

		//Set the overflow flag when we add two numbers (each < 128), but the result > 127;
		//checks if pos + pos = neg OR neg + neg = pos
		//We would expect two positives to always sum to a positive, but the signed byte
		//may say otherwise (i.e. 64 + 65 = 129, but signed it is -127)
		this.flagV = (!((this._regs[regA] ^ operand) & 0x80) && ((this._regs[regA] ^ result) & 0x80)) ? true : false
		this.flagZ = (result === 0) ? true : false;
		this.flagN = (result & 0x80) ? true : false;

		this._regs[regA] = result;
	}

	//And memory with accumulator
	//regA & memoryOperand -> regA
	function _AND(operand){
		this._regs[regA] &= operand;
		this.flagN = (this._regs[regA] & 0x80) ? true : false;
		this.flagZ = (this._regs[regA] === 0) ? true : false;
	}

	//Shift memory or accumulator left by one bit.
	//Can operate directly on memory
	//flagC = memory OR regA & 0x80; memory/regA <<= 1
	function _ASL(addr){
		var tmp;

		//Operate on regA (addr is the val of regA)
		if (this._regCurrentAddressingMode === ACCUMULATOR){
			tmp = addr << 1;
			this._regs[regA] = tmp; //Typed array will take care of wrapping for us
		} else {
			tmp = this.readByte(addr);
			tmp <<= 1;
			this.writeByte(addr, tmp);
		}

		this.flagN = (tmp & 0x80) ? true : false;
		this.flagZ = ((tmp & 0xFF) === 0) ? true : false;
		this.flagC = (tmp > 0xFF) ? true : false;
	}

	//Branching functions
	//regPC = (condition) ? regPC + operand : regPC

	//Branch on flagC === false (Carry Clear)
	function _BCC(operand){
		__genericBranch.call(this, operand, !this.flagC);
	}

	//Branch on flagC === true (Carry Set)
	function _BCS(operand){
		__genericBranch.call(this, operand, this.flagC);
	}

	//Branch on flagZ === true (Equals Zero)
	function _BEQ(operand){
		__genericBranch.call(this, operand, this.flagZ);
	}

	//Test bits in memory with regA
	//set flagN if bit 7 is set in operand
	//set flagV if bit 6 is set in operand
	//set flagZ if regA & operand === 0
	function _BIT(operand){
		var tmp = this._regs[regA] & operand;
		this.flagN = (operand & 0x80) ? true : false;
		this.flagV = (operand & 0x40) ? true : false;
		this.flagZ = (tmp === 0) ? true : false;
	}

	//Branch on flagN === true (result MInus)
	function _BMI(operand){
		__genericBranch.call(this, operand, this.flagN);
	}

	//Branch on flagZ === false (Not Zero)
	function _BNE(operand){
		__genericBranch.call(this, operand, !this.flagZ);
	}

	//Branch on flagN === false (result PLus)
	function _BPL(operand){
		__genericBranch.call(this, operand, !this.flagN);
	}

	//Force an IRQ.
	//Increments PC by 2 before it is pushed on the stack, 
	//then pushes the flags onto the stack.
	//Attends to the IRQ by putting the word at $FFFE into regPC.
	//Sets flagI to show that we are attending to an IRQ.
	function _BRK(){
		//Increment the PC we push to point past the current instruction, 
		//otherwise we would return to the same instruction. Also, 6502 has a 'bug'
		//where the return address skips over the byte after the BRK instruction, 
		//which is why we increment PC by 1 when we push it. 
		this.pushWord(this._regPC[regPC] + 1);
		var tmp = this.flagsToP();
		tmp |= 0x10 //Set flagB in the version of the flags we push (as per CPU manual)
		this.pushByte(tmp);
		this.flagI = true;
		this._regPC[regPC] = this.readWord(VECTOR_IRQ);
	}

	//Branch on flagV === false (oVerflow Clear)
	function _BVC(operand){
		__genericBranch.call(this, operand, !this.flagV);
	}

	//Branch on flagV === true (oVerflow Set)
	function _BVS(operand){
		__genericBranch.call(this, operand, this.flagV);
	}

	//CLears flagC
	function _CLC(){
		this.flagC = false;
	}

	//CLears flagD
	function _CLD(){
		this.flagD = false;
	}

	//CLears flagI
	function _CLI(){
		this.flagI = false;
	}

	//CLears flagV
	function _CLV(){
		this.flagV = false;
	}

	//Compares memory and regA
	function _CMP(operand){
		__genericComparison.call(this, operand, regA);
	}

	//Compares memory and regX
	function _CPX(operand){
		__genericComparison.call(this, operand, regX);
	}

	//Compares memory and regY
	function _CPY(operand){
		__genericComparison.call(this, operand, regY);
	}

	//Decrement a memory address by one
	function _DEC(addr){
		scratchByte[0] = this.readByte(addr);
		scratchByte[0] -= 1;
		this.writeByte(addr, scratchByte[0]);
		__adjustNZ.call(this, scratchByte[0]);
	}

	//Decrement regX by one
	function _DEX(){
		this._regs[regX] -= 1;
		__adjustNZ.call(this, this._regs[regX]);
	}

	//Decrement regY by one
	function _DEY(){
		this._regs[regY] -= 1;
		__adjustNZ.call(this, this._regs[regY]);
	}

	//Exclusive OR (aka XOR) memory with regA, 
	//store result in regA
	//regA ^ operand -> regA
	function _EOR(operand){
		var tmp = this._regs[regA] ^ operand;
		__adjustNZ.call(this, tmp);
		this._regs[regA] = tmp;
	}

	//INCremement a memory address by 1
	function _INC(addr){
		var tmp = this.readByte(addr);
		tmp = (tmp + 1) & 0xFF;
		this.writeByte(addr, tmp);
		__adjustNZ.call(this, tmp);
	}

	//INcrement regX by 1
	function _INX(){
		this._regs[regX] += 1;
		__adjustNZ.call(this, this._regs[regX]);
	}

	//INcrement regY by 1
	function _INY(){
		this._regs[regY] += 1;
		__adjustNZ.call(this, this._regs[regY]);
	}

	//Unconditional jump to anywhere in memory
	//Move the address into PC
	function _JMP(addr){
		this._regPC[regPC] = addr;
	}

	//Unconditional Jump and Save Return address (alternately, Jump to SubRoutine)
	function _JSR(addr){
		this.pushWord(this._regPC[regPC] - 1);
		this._regPC[regPC] = addr;
	}

	//LoaD memory into regA, then set
	//flagN and flagZ accordingly
	function _LDA(operand){
		this._regs[regA] = operand;
		__adjustNZ.call(this, operand);
	}

	//LoaD memory into regX
	function _LDX(operand){
		this._regs[regX] = operand;
		__adjustNZ.call(this, operand);
	}

	//Load memory into regY
	function _LDY(operand){
		this._regs[regY] = operand;
		__adjustNZ.call(this, operand);
	}

	//Shift right regA or value at address by 1.
	//bit that is shifted off the end is placed in flagC.
	//Since a 0 will always be shifted into bit 7, flagN is
	//always set to false. Set flagZ if result === 0.
	function _LSR(addr){
		var bitShiftedOff;

		if (this._regCurrentAddressingMode === ACCUMULATOR){
			//addr will === regA
			bitShiftedOff = addr & 0x01;
			tmp = addr >> 1;
			this._regs[regA] = tmp; //Typed array will take care of wrapping for us
		} else {
			tmp = this.readByte(addr);
			bitShiftedOff = tmp & 0x01;
			tmp >>= 1;
			this.writeByte(addr, tmp);
		}

		this.flagN = false;
		this.flagZ = (tmp === 0) ? true : false;
		this.flagC = (bitShiftedOff === 1) ? true : false;
	}

	//No OPeration
	function _NOP(){
		//does nothing
	}

	//OR memory with regA, store result in regA.
	//Adjust flagN and flagZ according to result.
	function _ORA(operand){
		this._regs[regA] |= operand;
		__adjustNZ.call(this, this._regs[regA]);
	}

	//PusH regA
	function _PHA(){
		this.pushByte(this._regs[regA]);
	}

	//PusH regP (flags)
	function _PHP(){
		//The documentation for this is obscure, but the 6502 DOES set the 
		//B flag (bit 4 of P register) BEFORE pushing the flags. It is also expected
		//that bit 5 (an unused flag) will be unaffected.
		this.pushByte(this.flagsToP() | 0x30);
	}

	//Pop (aka PulL) from stack, place into regA
	//set flagN and flagZ accordingly
	function _PLA(){
		var tmp = this.popByte();
		this._regs[regA] = tmp;
		__adjustNZ.call(this, tmp);
	}

	//Pop (aka PulL) from stack, place into flags
	function _PLP(){
		this.pToFlags(this.popByte() & 0xEF);
	}

	//ROtate regA or memory Left
	//flagC is shifted IN to bit 0
	//Store shifted off bit in flagC
	//Adjust flagN and flagZ accordingly
	function _ROL(addr){
		var bitShiftedOff;

		if (this._regCurrentAddressingMode === ACCUMULATOR){
			bitShiftedOff = addr & 0x80;
			tmp = addr << 1;
			tmp |= this.flagC;
			this._regs[regA] = tmp;
		} else {
			tmp = this.readByte(addr);
			bitShiftedOff = tmp & 0x80;
			tmp <<= 1;
			tmp |= this.flagC;
			this.writeByte(addr, tmp);
		}

		this.flagC = (bitShiftedOff) ? true : false;
		__adjustNZ.call(this, tmp & 0xFF);
	}

	//ROtate regA or memory Right
	//same logic as ROL
	function _ROR(addr){
		var bitShiftedOff;

		if (this._regCurrentAddressingMode === ACCUMULATOR){
			bitShiftedOff = addr & 0x01;
			tmp = addr >> 1;
			tmp = (this.flagC) ? (tmp | 0x80) : tmp;
			this._regs[regA] = tmp;
		} else {
			tmp = this.readByte(addr);
			bitShiftedOff = tmp & 0x01;
			tmp >>= 1;
			tmp = (this.flagC) ? (tmp | 0x80) : tmp;
			this.writeByte(addr, tmp);
		}

		this.flagC = (bitShiftedOff) ? true : false;
		__adjustNZ.call(this, tmp & 0xFF);
	}

	//ReTurn from Interrupt
	//First, pop byte representing flags off of stack, 
	//and restore flags. Then, pop word off of stack, 
	//which will be put in PC.
	function _RTI(){
		this.pToFlags(this.popByte());
		this._regPC[regPC] = this.popWord();
	}

	//ReTurn from Subroutine
	//Pops word off the stack, (it was properly incremented before it 
	//was pushed), then put it into regPC.
	//Flags are NOT affected!
	function _RTS(){
		this._regPC[regPC] = this.popWord() + 1;
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
	function _SBC(operand){
		var result = this._regs[regA] - operand - (!this.flagC);

		this.flagC = (result >= 0) ? true : false;

		result &= 0xFF;

		//See ADC for overflow explanation
		//Set overflow if pos - neg = neg OR neg - pos = pos
		this.flagV = (((this._regs[regA] ^ operand) & 0x80) && ((this._regs[regA] ^ result) & 0x80)) ? true : false
		
		this._regs[regA] = result;
		__adjustNZ.call(this, this._regs[regA]);
	}

	//SEt flagC
	function _SEC(){
		this.flagC = true;
	}

	//SEt flagD
	function _SED(){
		this.flagD = true;
	}

	//SEt flagI
	function _SEI(){
		this.flagI = true;
	}

	//STA, STX, and STY do NOT take extra cycles on page crossing!!!

	//STore regA in memory
	function _STA(addr){
		this.writeByte(addr, this._regs[regA]);
	}

	//STore regX in memory
	function _STX(addr){
		this.writeByte(addr, this._regs[regX]);
	}

	//STore regY in memory
	function _STY(addr){
		this.writeByte(addr, this._regs[regY]);
	}

	//Transfer regA to regX
	//Value of regA does not change, adjust flagN and flagZ according to
	//the value transferred
	function _TAX(){
		__genericTransfer.call(this, regA, regX);
	}

	//Transfer regA to regY
	function _TAY(){
		__genericTransfer.call(this, regA, regY);
	}

	//Transfer regSp to regX
	function _TSX(){
		__genericTransfer.call(this, regSP, regX);
	}

	//Transfer regX to regA
	function _TXA(){
		__genericTransfer.call(this, regX, regA);
	}

	//Transfer regX to regSp
	//DOES NOT AFFECT FLAGS!!!
	function _TXS(){
		this._regs[regSP] = this._regs[regX]
	}

	//Transfer regY to regA
	function _TYA(){
		__genericTransfer.call(this, regY, regA);
	}

	//Encapsulates branching logic, including 
	//rules for # of cycles taken
	function __genericBranch(operand, condition){
		if(condition){
			var tmp = (this._regPC[regPC] + operand) & 0xFFFF;
			if(didPageCrossOccur(this._regPC[regPC], tmp)){
				this._regExtraCycles = 2;
			} else {
				this._regExtraCycles = 1;
			}
			this._regPC[regPC] = tmp; //Typed array will wrap value
		} else {
			this._regExtraCycles = 0;
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
	function accumulatorOperand(){
		this._regPC[regPC] += 1;
		return this._regs[regA];
	}

	//Operand is the byte after the instruction
	function immediateOperand(){
		var memVal = this.readByte(this._regPC[regPC] + 1);
		this._regPC[regPC] += 2; //Reads operation, then operand
		return memVal;
	}

	//Operand is the byte after the instruction, coerces to the 
	//range -128 to +127
	function relativeOperand(){
		var memVal = this.readByte(this._regPC[regPC] + 1);
		//Regardless of branch taken, incremement PC
		this._regPC[regPC] += 2;
		return utos(memVal);
	}

	//Basically a placeholder, as implied addressing means no
	//operands are needed
	function impliedOperand(){
		this._regPC[regPC] += 1;
		return 0;
	}

	//Get a byte in range $0000 to $00FF
	function zeroPageOperand(){
		//TODO: should perform bounds check?
		var memAddr = this.readByte(this._regPC[regPC] + 1);
		this._regPC[regPC] += 2 //Reads operation, then operand address
		return this.readByte(memAddr);
	}

	//Add X register to immediate operand to get a zero page address ($0000 - $00FF).
	//This means that the final address MUST BE WRAPPED past 0xFF before it is read from!
	function zeroPageIndexedXOperand(){
		var memAddr = this.readByte(this._regPC[regPC] + 1) + this._regs[regX];
		memAddr = memAddr & 0xFF;
		this._regPC[regPC] += 2;
		return this.readByte(memAddr);
	}

	//Same as zero page indexed X, but w/ regY
	function zeroPageIndexedYOperand(){
		var memAddr = this.readByte(this._regPC[regPC] + 1) + this._regs[regY];
		memAddr = memAddr & 0xFF;
		this._regPC[regPC] += 2;
		return this.readByte(memAddr);
	}

	//The next to bytes in memory form a ('lil endian) word, which is the address of
	//a byte in main memory ($0000 to $FFFF);
	function absoluteOperand(){
		var memAddr = this.readWord(this._regPC[regPC] + 1);
		this._regPC[regPC] += 3;
		return this.readByte(memAddr);
	}

	//These two take the next two bytes in memory to form a word, then add the value of
	//the X or Y register to form the desired memory address. These two functions usually
	//require an extra machine cycle if adding the register to the initial memory address
	//crosses over to a different page.
	
	function _absoluteIndexedProc(regID){
		var baseAddr = this.readWord(this._regPC[regPC] + 1)
		var memAddr = baseAddr + this._regs[regID];
		if (didPageCrossOccur(baseAddr, memAddr)){
			this._regExtraCycles = 1;
		} else {
			this._regExtraCycles = 0;
		}
		//TODO: is this wrapping necessary?
		memAddr = memAddr & 0xFFFF;
		this._regPC[regPC] += 3;
		return this.readByte(memAddr);
	}

	function absoluteIndexedXOperand(){
		return _absoluteIndexedProc.call(this, regX);
	}

	function absoluteIndexedYOperand(){
		return _absoluteIndexedProc.call(this, regY);
	}

	//This mode simply takes the next word in memory as the address of the 
	//operand, which is in this case a 16 bit address for JMP
	function absoluteIndirectOperand(){
		var addr = this.readWord(this._regPC[regPC] + 1);
		this._regPC[regPC] += 3;
		return this.readWord(addr);
	}

	//This mode, also known as pre-indexed indirect addressing, first takes a zero page 
	//address as the immediate operand, adds the X register to it (with wraparound),
	//and uses that calculated address as the address of a word to read from memory, 
	//which will be the absolute address of the final operand. Always takes 6 cycles.
	function indirectIndexedXOperand(){
		var indirectAddr = this.readByte(this._regPC[regPC] + 1) + this._regs[regX];
		indirectAddr = indirectAddr & 0xFF;
		//var memAddr = this.readWord(indirectAddr);
		var memAddrLo = this.readByte(indirectAddr);
		var memAddrHi = this.readByte((indirectAddr + 1) & 0xFF);
		var memAddr = memAddrLo + (memAddrHi << 8);
		this._regPC[regPC] += 2;
		return this.readByte(memAddr);
	}

	//This mode, also known as post-indexed indirect addressing, first takes a zero page
	//address as an immediate operand, and reads a word from that zero page address.
	//That word plus the value of the Y register gives the absolute address of
	//the final operand. Usually requires an extra cycle if a page cross occurs when
	//adding the Y register.
	function indirectIndexedYOperand(){
		var indirectAddr = this.readByte(this._regPC[regPC] + 1);
		var baseAddrLo = this.readByte(indirectAddr);
		var baseAddrHi = this.readByte((indirectAddr + 1) & 0xFF);
		var baseAddr = baseAddrLo + (baseAddrHi << 8);
		var memAddr = baseAddr + this._regs[regY];
		if (didPageCrossOccur(baseAddr, memAddr)){
			this._regExtraCycles = 1;
		} else {
			this._regExtraCycles = 0;
		}
		//TODO: is this wrapping necessary?
		memAddr = memAddr & 0xFFFF;
		this._regPC[regPC] += 2;
		return this.readByte(memAddr);
	}

	//These functions are the same at their correlates above, except
	//they only return the resolved address and not the operand
	//the address points to. Used primarily by opcodes which 
	//directly manipulate the value at a memory address

	//This particular func is here for completeness only
	function accumulatorAddr(){
		this._regPC[regPC] += 1;
		return this._regs[regA];
	}

	function zeroPageAddr(){
		//TODO: should perform bounds check?
		var memAddr = this.readByte(this._regPC[regPC] + 1);
		this._regPC[regPC] += 2;
		return memAddr;
	}

	function zeroPageIndexedXAddr(){
		var memAddr = this.readByte(this._regPC[regPC] + 1) + this._regs[regX];
		this._regPC[regPC] += 2;
		return memAddr & 0xFF;
	}

	function zeroPageIndexedYAddr(){
		var memAddr = this.readByte(this._regPC[regPC] + 1) + this._regs[regY];
		this._regPC[regPC] += 2;
		return memAddr & 0xFF;
	}

	function absoluteAddr(){
		var memAddr = this.readWord(this._regPC[regPC] + 1);
		this._regPC[regPC] += 3;
		return memAddr;
	}

	function absoluteIndexedXAddr(){
		var baseAddr = this.readWord(this._regPC[regPC] + 1)
		var memAddr = baseAddr + this._regs[regX];
		if (didPageCrossOccur(baseAddr, memAddr)){
			this._regExtraCycles = 1;
		} else {
			this._regExtraCycles = 0;
		}
		//TODO: is this wrapping necessary?
		memAddr = memAddr & 0xFFFF;
		this._regPC[regPC] += 3;
		return memAddr;
	}

	function absoluteIndexedYAddr(){
		var baseAddr = this.readWord(this._regPC[regPC] + 1)
		var memAddr = baseAddr + this._regs[regY];
		if (didPageCrossOccur(baseAddr, memAddr)){
			this._regExtraCycles = 1;
		} else {
			this._regExtraCycles = 0;
		}
		//TODO: is this wrapping necessary?
		memAddr = memAddr & 0xFFFF;
		this._regPC[regPC] += 3;
		return memAddr;
	}

	function indirectIndexedXAddr(){
		var indirectAddr = this.readByte(this._regPC[regPC] + 1) + this._regs[regX];
		indirectAddr = indirectAddr & 0xFF;
		var memAddrLo = this.readByte(indirectAddr);
		var memAddrHi = this.readByte((indirectAddr + 1) & 0xFF);
		var memAddr = memAddrLo + (memAddrHi << 8);
		this._regPC[regPC] += 2;
		return memAddr;
	}

	function indirectIndexedYAddr(){
		var indirectAddr = this.readByte(this._regPC[regPC] + 1);
		var baseAddrLo = this.readByte(indirectAddr);
		var baseAddrHi = this.readByte((indirectAddr + 1) & 0xFF);
		var baseAddr = baseAddrLo + (baseAddrHi << 8);
		var memAddr = baseAddr + this._regs[regY];
		if (didPageCrossOccur(baseAddr, memAddr)){
			this._regExtraCycles = 1;
		} else {
			this._regExtraCycles = 0;
		}
		memAddr = memAddr & 0xFFFF;
		this._regPC[regPC] += 2;
		return memAddr;
	}

	//Map for the above function
	var operandRetrievers = {};
	operandRetrievers[ACCUMULATOR] = accumulatorOperand;
	operandRetrievers[IMMEDIATE] = immediateOperand;
	operandRetrievers[IMPLIED] = impliedOperand;
	operandRetrievers[RELATIVE] = relativeOperand;
	operandRetrievers[ZERO_PAGE] = zeroPageOperand;
	operandRetrievers[ZERO_PAGE_X] = zeroPageIndexedXOperand;
	operandRetrievers[ZERO_PAGE_Y] = zeroPageIndexedYOperand;
	operandRetrievers[ABSOLUTE] = absoluteOperand;
	operandRetrievers[ABSOLUTE_X] = absoluteIndexedXOperand;
	operandRetrievers[ABSOLUTE_Y] = absoluteIndexedYOperand;
	operandRetrievers[ABSOLUTE_INDIRECT] = absoluteIndirectOperand;
	operandRetrievers[INDIRECT_X] = indirectIndexedXOperand;
	operandRetrievers[INDIRECT_Y] = indirectIndexedYOperand;
	operandRetrievers[ACCUMULATOR_ADDR] = accumulatorAddr;
	operandRetrievers[ZERO_PAGE_ADDR] = zeroPageAddr;
	operandRetrievers[ZERO_PAGE_X_ADDR] = zeroPageIndexedXAddr;
	operandRetrievers[ZERO_PAGE_Y_ADDR] = zeroPageIndexedYAddr;
	operandRetrievers[ABSOLUTE_ADDR] = absoluteAddr;
	operandRetrievers[ABSOLUTE_X_ADDR] = absoluteIndexedXAddr;
	operandRetrievers[ABSOLUTE_Y_ADDR] = absoluteIndexedYAddr;
	operandRetrievers[INDIRECT_X_ADDR] = indirectIndexedXAddr;
	operandRetrievers[INDIRECT_Y_ADDR] = indirectIndexedYAddr;

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