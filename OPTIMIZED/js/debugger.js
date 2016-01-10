(function(){

	if(typeof(NEScript) === "undefined"){
		window.NEScript = {};
	}

	var procMap = {
		0x00: ["IMPLIED", "BRK"],
		0x01: ["INDIRECT_X", "ORA"],
		0x05: ["ZERO_PAGE", "ORA"],
		0x06: ["ZERO_PAGE", "ASL"],
		0x08: ["IMPLIED", "PHP"],
		0x09: ["IMMEDIATE", "ORA"],
		0x0A: ["ACCUMULATOR", "ASL"],
		0x0D: ["ABSOLUTE", "ORA"],
		0x0E: ["ABSOLUTE", "ASL"],

		0x10: ["RELATIVE", "BPL"],
		0x11: ["INDIRECT_Y", "ORA"],
		0x15: ["ZERO_PAGE_X", "ORA"],
		0x16: ["ZERO_PAGE_X", "ASL"],
		0x18: ["IMPLIED", "CLC"],
		0x19: ["ABSOLUTE_Y", "ORA"],
		0x1D: ["ABSOLUTE_X", "ORA"],
		0x1E: ["ABSOLUTE_X", "ASL"],

		0x20: ["ABSOLUTE", "JSR"],
		0x21: ["INDIRECT_X", "AND"],
		0x24: ["ZERO_PAGE", "BIT"],
		0x25: ["ZERO_PAGE", "AND"],
		0x26: ["ZERO_PAGE", "ROL"],
		0x28: ["IMPLIED", "PLP"],
		0x29: ["IMMEDIATE", "AND"],
		0x2A: ["ACCUMULATOR", "ROL"],
		0x2C: ["ABSOLUTE", "BIT"],
		0x2D: ["ABSOLUTE", "AND"],
		0x2E: ["ABSOLUTE", "ROL"],
		
		0x30: ["RELATIVE", "BMI"],
		0x31: ["INDIRECT_Y", "AND"],
		0x35: ["ZERO_PAGE_X", "AND"],
		0x36: ["ZERO_PAGE_X", "ROL"],
		0x38: ["IMPLIED", "SEC"],
		0x39: ["ABSOLUTE_Y", "AND"],
		0x3D: ["ABSOLUTE_X", "AND"],
		0x3E: ["ABSOLUTE_X", "ROL"],

		0x40: ["IMPLIED", "RTI"],
		0x41: ["INDIRECT_X", "EOR"],
		0x45: ["ZERO_PAGE", "EOR"],
		0x46: ["ZERO_PAGE", "LSR"],
		0x48: ["IMPLIED", "PHA"],
		0x49: ["IMMEDIATE", "EOR"],
		0x4A: ["ACCUMULATOR", "LSR"],
		0x4C: ["ABSOLUTE", "JMP"],
		0x4D: ["ABSOLUTE", "EOR"],
		0x4E: ["ABSOLUTE", "LSR"],
		
		0x50: ["RELATIVE", "BVC"],
		0x51: ["INDIRECT_Y", "EOR"],
		0x55: ["ZERO_PAGE_X", "EOR"],
		0x56: ["ZERO_PAGE_X", "LSR"],
		0x58: ["IMPLIED", "CLI"],
		0x59: ["ABSOLUTE_Y", "EOR"],
		0x5D: ["ABSOLUTE_X", "EOR"],
		0x5E: ["ABSOLUTE_X", "LSR"],

		0x60: ["IMPLIED", "RTS"],
		0x61: ["INDIRECT_X", "ADC"],
		0x65: ["ZERO_PAGE", "ADC"],
		0x66: ["ZERO_PAGE", "ROR"],
		0x68: ["IMPLIED", "PLA"],
		0x69: ["IMMEDIATE", "ADC"],
		0x6A: ["ACCUMULATOR", "ROR"],
		0x6C: ["ABSOLUTE_INDIRECT", "JMP"],
		0x6D: ["ABSOLUTE", "ADC"],
		0x6E: ["ABSOLUTE", "ROR"],
		
		0x70: ["RELATIVE", "BVS"],
		0x71: ["INDIRECT_Y", "ADC"],
		0x75: ["ZERO_PAGE_X", "ADC"],
		0x76: ["ZERO_PAGE_X", "ROR"],
		0x78: ["IMPLIED", "SEI"],
		0x79: ["ABSOLUTE_Y", "ADC"],
		0x7D: ["ABSOLUTE_X", "ADC"],
		0x7E: ["ABSOLUTE_X", "ROR"],

		0x81: ["INDIRECT_X", "STA"],
		0x84: ["ZERO_PAGE", "STY"],
		0x85: ["ZERO_PAGE", "STA"],
		0x86: ["ZERO_PAGE", "STX"],
		0x88: ["IMPLIED", "DEY"],
		0x8A: ["IMPLIED", "TXA"],
		0x8C: ["ABSOLUTE", "STY"],
		0x8D: ["ABSOLUTE", "STA"],
		0x8E: ["ABSOLUTE", "STX"],
		
		0x90: ["RELATIVE", "BCC"],
		0x91: ["INDIRECT_Y", "STA"],
		0x94: ["ZERO_PAGE_X", "STY"],
		0x95: ["ZERO_PAGE_X", "STA"],
		0x96: ["ZERO_PAGE_Y", "STX"],
		0x98: ["IMPLIED", "TYA"],
		0x99: ["ABSOLUTE_Y", "STA"],
		0x9A: ["IMPLIED", "TXS"],
		0x9D: ["ABSOLUTE_X", "STA"],

		0xA0: ["IMMEDIATE", "LDY"],
		0xA1: ["INDIRECT_X", "LDA"],
		0xA2: ["IMMEDIATE", "LDX"],
		0xA4: ["ZERO_PAGE", "LDY"],
		0xA5: ["ZERO_PAGE", "LDA"],
		0xA6: ["ZERO_PAGE", "LDX"],
		0xA8: ["IMPLIED", "TAY"],
		0xA9: ["IMMEDIATE", "LDA"],
		0xAA: ["IMPLIED", "TAX"],
		0xAC: ["ABSOLUTE", "LDY"],
		0xAD: ["ABSOLUTE", "LDA"],
		0xAE: ["ABSOLUTE", "LDX"],
		
		0xB0: ["RELATIVE", "BCS"],
		0xB1: ["INDIRECT_Y", "LDA"],
		0xB4: ["ZERO_PAGE_X", "LDY"],
		0xB5: ["ZERO_PAGE_X", "LDA"],
		0xB6: ["ZERO_PAGE_Y", "LDX"],
		0xB8: ["IMPLIED", "CLV"],
		0xB9: ["ABSOLUTE_Y", "LDA"],
		0xBA: ["IMPLIED", "TSX"],
		0xBC: ["ABSOLUTE_X", "LDY"],
		0xBD: ["ABSOLUTE_X", "LDA"],
		0xBE: ["ABSOLUTE_Y", "LDX"],

		0xC0: ["IMMEDIATE", "CPY"],
		0xC1: ["INDIRECT_X", "CMP"],
		0xC4: ["ZERO_PAGE", "CPY"],
		0xC5: ["ZERO_PAGE", "CMP"],
		0xC6: ["ZERO_PAGE", "DEC"],
		0xC8: ["IMPLIED", "INY"],
		0xC9: ["IMMEDIATE", "CMP"],
		0xCA: ["IMPLIED", "DEX"],
		0xCC: ["ABSOLUTE", "CPY"],
		0xCD: ["ABSOLUTE", "CMP"],
		0xCE: ["ABSOLUTE", "DEC"],
		
		0xD0: ["RELATIVE", "BNE"],
		0xD1: ["INDIRECT_Y", "CMP"],
		0xD5: ["ZERO_PAGE_X", "CMP"],
		0xD6: ["ZERO_PAGE_X", "DEC"],
		0xD8: ["IMPLIED", "CLD"],
		0xD9: ["ABSOLUTE_Y", "CMP"],
		0xDD: ["ABSOLUTE_X", "CMP"],
		0xDE: ["ABSOLUTE_X", "DEC"],

		0xE0: ["IMMEDIATE", "CPX"],
		0xE1: ["INDIRECT_X", "SBC"],
		0xE4: ["ZERO_PAGE", "CPX"],
		0xE5: ["ZERO_PAGE", "SBC"],
		0xE6: ["ZERO_PAGE", "INC"],
		0xE8: ["IMPLIED", "INX"],
		0xE9: ["IMMEDIATE", "SBC"],
		0xEA: ["IMPLIED", "NOP"],
		0xEC: ["ABSOLUTE", "CPX"],
		0xED: ["ABSOLUTE", "SBC"],
		0xEE: ["ABSOLUTE", "INC"],
		
		0xF0: ["RELATIVE", "BEQ"],
		0xF1: ["INDIRECT_Y", "SBC"],
		0xF5: ["ZERO_PAGE_X", "SBC"],
		0xF6: ["ZERO_PAGE_X", "INC"],
		0xF8: ["IMPLIED", "SED"],
		0xF9: ["ABSOLUTE_Y", "SBC"],
		0xFD: ["ABSOLUTE_X", "SBC"],
		0xFE: ["ABSOLUTE_X", "INC"]
	};

	//% ==> Insert first operand byte here
	//^ ==> Insert second operand byte here
	//B ==> Relative (Branch) only; place (PC+2) + (signed)operand here
	var opInfoMap ={
		"ACCUMULATOR": {operands: 0, format: "A"},
		"IMMEDIATE": {operands: 1, format: "#%"},
		"ZERO_PAGE": {operands: 1, format: "#$%"},
		"ZERO_PAGE_X": {operands: 1, format: "#$%, X"},
		"ZERO_PAGE_Y": {operands: 1, format: "#$%, Y"},
		"ABSOLUTE": {operands: 2, format: "$^%"},
		"ABSOLUTE_X": {operands: 2, format: "$^%, X"},
		"ABSOLUTE_Y": {operands: 2, format: "$^%, Y"},
		"IMPLIED": {operands: 0, format: " "},
		"RELATIVE": {operands: 1, format: "$B"},
		"INDIRECT_X": {operands: 2, format: "$(^%, X)"},
		"INDIRECT_Y": {operands: 2, format: "$(^%), Y"},
		"ABSOLUTE_INDIRECT": {operands: 2, format: "$(^%)"}
	};

	var Debugger = NEScript.Debugger = function(emulatorRef){
		this.EMULATOR = emulatorRef;

		this.regA = document.getElementById("reg-a");
		this.regX = document.getElementById("reg-x");
		this.regY = document.getElementById("reg-y");
		this.regP = document.getElementById("reg-p");
		this.regSP = document.getElementById("reg-sp");
		this.regPC = document.getElementById("reg-pc");

		this.disassembly = document.getElementById("disassembly");
		this.memdump = document.getElementById("memory-dump");

		this.scanline = document.getElementById("scanline-idx");
		this.pixel = document.getElementById("pixel-idx");

		this.breakpointForm = document.getElementById("breakpoint-form");
		this.breakpointSwitch = document.getElementById("toggle-breakpoints");
		this.codeBreakpointEntry = document.getElementById("code-breakpoint");
		this.breakpointsOn = false;
		this.breakpointVal = undefined;

		this.refMainMemory = this.EMULATOR.CPU.MM;

		this.breakpointSwitch.addEventListener("click", toggleBreakpoints.bind(this));
		this.breakpointForm.addEventListener("submit", updateBreakpoints.bind(this));
	}

	Debugger.prototype.step = function(){
		this.EMULATOR.step();
		this.updateInfo();
		this.disassembleChunk(this.EMULATOR.CPU.regPC);
	}

	Debugger.prototype.run = function(){
		while(NEScript.IS_RUNNING){
			if(EMULATOR.CPU.regPC === this.breakpointVal){
				break;
			}
			this.EMULATOR.step();
		}
		this.updateInfo();
	}

	Debugger.prototype.updateInfo = function(){
		this.regA.value = this.EMULATOR.CPU.regA.toString(16);
		this.regX.value = this.EMULATOR.CPU.regX.toString(16);
		this.regY.value = this.EMULATOR.CPU.regY.toString(16);
		this.regP.value = this.EMULATOR.CPU.flagsToP().toString(2);
		this.regSP.value = this.EMULATOR.CPU.regSP.toString(16);
		this.regPC.value = this.EMULATOR.CPU.regPC.toString(16);

		this.scanline.value = this.EMULATOR.PPU.scanlineCounter;
		this.pixel.value = this.EMULATOR.PPU.pixelCounter;
	}

	Debugger.prototype.updateDisassembly = function(){
		var i, j, opcode, opinf, instruction, addrinf, numOperands, format,
				lobyte, hibyte, outStr = [], tmpStr;

		for(i = 0x8000; i < 0xFFFA; i++){
			tmpStr = "0x" + i.toString(16) + ": ";

			opcode = this.EMULATOR.CPU.MM[i];
			opinf = procMap[opcode] || {};
			addrinf = opInfoMap[opinf[0]] || {};
			instruction = opinf[1] || "??";
			numOperands = addrinf.operands || 0;
			format = addrinf.format || "";
			if(numOperands === 2){
				lobyte = this.EMULATOR.CPU.MM[i+1];
				if(lobyte < 0x10){
					lobyte = "0" + lobyte.toString(16);
				} else {
					lobyte = lobyte.toString(16);
				}

				hibyte = this.EMULATOR.CPU.MM[i+2];
				if(hibyte < 0x10){
					hibyte = "0" + hibyte.toString(16);
				} else {
					hibyte = hibyte.toString(16);
				}

				i += 2;
			} else if (numOperands === 1){
				lobyte = this.EMULATOR.CPU.MM[i+1];
				if(lobyte < 0x10){
					lobyte = "0" + lobyte.toString(16);
				} else {
					lobyte = lobyte.toString(16);
				}

				i += 1;
			}

			if(opinf[0] != "RELATIVE"){
				format = format.replace("%", lobyte);
				format = format.replace("^", hibyte);
			} else {
				lobyte = parseInt(lobyte, 16);
				lobyte = (lobyte < 128) ? lobyte : lobyte-256;
				lobyte = (i + 1 + lobyte) & 0xFFFF;
				format = format.replace("B", lobyte.toString(16));
			}

			tmpStr = tmpStr + instruction + " " + format;
			outStr.push(tmpStr);
		}

		this.disassembly.innerHTML = outStr.join("\n");
	}

	Debugger.prototype.smartDisassemble = function(){
		var addressQueue = [], addressMap = new Array(0x10000);

		var VECTOR_RESET = this.readCPUWord(0xFFFC);
		var VECTOR_NMI = this.readCPUWord(0xFFFA);
		var VECTOR_IRQ = this.readCPUWord(0xFFFE);

		addressQueue.push(VECTOR_RESET);
		while(addressQueue.length > 0){

		}

		addressQueue.push(VECTOR_NMI);
		while(addressQueue.length > 0){

		}

		addressQueue.push(VECTOR_IRQ);
		while(addressQueue.length > 0){

		}

	}

	var controlFlowOpcodes = {
		0x10: 2,
		0x20: 3,
		0x30: 2,
		0x40: 1,
		0x4C: 3,
		0x50: 2,
		0x60: 1,
		0x6C: 4,
		0x70: 2,
		0x90: 2,
		0xB0: 2,
		0xD0: 2,
		0xF0: 2,
	};

	//Labels which addresses to disassemble in refAddressMap, returns an address to 
	//push onto the address queue, or undefined if RTS or RTI is encountered
	Debugger.prototype._mapDisassembly = function(startAddr, refAddressMap, refAddressQueue){
		//Opcodes at which to stop disassembly
		//1 ==> stop disassembly altogether (RTS, RTI)
		//2 ==> stop disassembly and push the relative address that the instruction points to
		//			the address queue (BCC, BCS, BEQ, BMI, BNE, BPL, BVC, BVS)
		//3 ==> "" the absolute address "" (JMP absolute, JSR)
		//4 ==> "" the indirect absolute "" (JMP indirect)

		//For branches, continue onwards but push address onto address queue

		var tmpPC = startAddr, operandsToAdvance, tmpOpcode, tmpOperand, 
				shouldContinue = true, tmpIndirect, procInfo;

		while(shouldContinue){
			tmpOpcode = this.refMainMemory[tmpPC];
			refAddressMap[tmpPC] = true;

			if(controlFlowOpcodes[tmpOpcode]){
				switch(controlFlowOpcodes[tmpOpcode]){
					case 1:
						tmpPC = undefined;
						shouldContinue = false;
						break;

					case 2: //Branch
						tmpOperand = this.refMainMemory[tmpPC+1]
						tmpOperand = (tmpOperand < 128) ? tmpOperand : tmpOperand-256;
						refAddressQueue.push((tmpPC + 1 + tmpOperand) & 0xFFFF);
						tmpPC += 2;
						break;

					case 3: //Absolute address
						tmpPC = this.readCPUWord(tmpPC+1);
						shouldContinue = false;
						break;

					case 4: //Indirect absolute
						tmpIndirect = this.readCPUWord(tmpPC+1);
						tmpPC = this.readWord(tmpPC);
						shouldContinue = false;
						break;
				}
			} else {
				//operandsToAdvance = /************HERERERERERERER**************/
			}
		}

		return tmpPC;
	}

	Debugger.prototype.disassembleChunk = function(start){
		var i, j, opcode, opinf, instruction, addrinf, numOperands, format,
				lobyte, hibyte, outStr = [], tmpStr;

		start = start || 0;

		for(i = start; i < start + 0x40; i++){
			tmpStr = "0x" + i.toString(16) + ": ";

			opcode = this.EMULATOR.CPU.MM[i];
			opinf = procMap[opcode] || {};
			addrinf = opInfoMap[opinf[0]] || {};
			instruction = opinf[1] || "??";
			numOperands = addrinf.operands || 0;
			format = addrinf.format || "";
			if(numOperands === 2){
				lobyte = this.EMULATOR.CPU.MM[i+1];
				if(lobyte < 0x10){
					lobyte = "0" + lobyte.toString(16);
				} else {
					lobyte = lobyte.toString(16);
				}

				hibyte = this.EMULATOR.CPU.MM[i+2];
				if(hibyte < 0x10){
					hibyte = "0" + hibyte.toString(16);
				} else {
					hibyte = hibyte.toString(16);
				}

				i += 2;
			} else if (numOperands === 1){
				lobyte = this.EMULATOR.CPU.MM[i+1];
				if(lobyte < 0x10){
					lobyte = "0" + lobyte.toString(16);
				} else {
					lobyte = lobyte.toString(16);
				}

				i += 1;
			}

			if(opinf[0] != "RELATIVE"){
				format = format.replace("%", lobyte);
				format = format.replace("^", hibyte);
			} else {
				lobyte = parseInt(lobyte, 16);
				lobyte = (lobyte < 128) ? lobyte : lobyte-256;
				lobyte = (i + 1 + lobyte) & 0xFFFF;
				format = format.replace("B", lobyte.toString(16));
			}

			tmpStr = tmpStr + instruction + " " + format;
			outStr.push(tmpStr);
		}

		this.disassembly.innerHTML = outStr.join("\n");
	}

	Debugger.prototype.readCPUWord = function(addr){
		var lobyte = this.refMainMemory[addr];
		var hibyte = this.refMainMemory[addr+1];
		return lobyte + (hibyte << 8);
	}

	Debugger.prototype.updateMemory = function(start, limit){
		var outstr = [], tmpAddr, tmpVal, tmpStr, i, j;

		start = start || 0;
		limit = (typeof(start) === "undefined") ? 0x10000 : (start + limit);

		for(i = start; i < limit; i += 8){
			tmpStr = "";

			if(i > 0xFFF){
				tmpAddr = "0x" + i.toString(16);
			} else if(tmpAddr > 0xFF){
				tmpAddr = "0x0" + i.toString(16);
			} else if(tmpAddr > 0xF){
				tmpAddr = "0x00" + i.toString(16);
			} else {
				tmpAddr = "0x000" + i.toString(16);
			}

			tmpStr = tmpStr + tmpAddr + ":";

			for(j = 0; j < 8; j++){
				tmpVal = this.EMULATOR.CPU.MM[i + j];

				if(tmpVal > 0xF){
					tmpVal = tmpVal.toString(16);
				} else {
					tmpVal = "0" + tmpVal.toString(16);
				}

				tmpStr = tmpStr + " " + tmpVal;
			}

			outstr.push(tmpStr);
		}
		outstr = outstr.join("\n");

		this.memdump.innerHTML = outstr;
	}

	function toggleBreakpoints(event){
		event.preventDefault();
		event.stopPropagation();
		this.breakpointSwitch.innerHTML = (this.breakpointsOn) ? "Turn breakpoints on" : "Turn breakpoints off";
		this.breakpointsOn = !this.breakpointsOn;
	}

	function updateBreakpoints(event){
		event.preventDefault();
		event.stopPropagation();
		this.breakpointSwitch.innerHTML = "Turn breakpoints off";
		this.breakpointsOn = true;
		this.breakpointVal = parseInt(this.codeBreakpointEntry.value, 16)
	}

})()