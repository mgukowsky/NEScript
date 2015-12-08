describe("The 6502 CPU", function(){
	var regPC = 0, regA = 0, regX = 1, regY = 2, regP = 3,
			regSP = 4;

	var INTERRUPT_NONE = 0, INTERRUPT_IRQ = 1, 
			INTERRUPT_NMI = 2, INTERRUPT_RESET = 3;

	var cpu = new NEScript.CPU();

	describe("with basic functionality", function(){

		it("can report its internal state", function(){
			var dmp = cpu.dumpRegs();
			expect(dmp.hasOwnProperty('A')).toBeTruthy();
			expect(dmp.hasOwnProperty('PC')).toBeTruthy();
		})

		cpu._regs[regA] = 1;
		cpu._regPC[regPC] = 1;

		cpu._mainMemory.writeByte(0xFF, 0xAB);

		it("can completely reset itself", function(){
			cpu.totalReset();
			var dmp = cpu.dumpRegs();

			expect(dmp.A).toEqual(0);
			expect(dmp.X).toEqual(0);
			expect(dmp.Y).toEqual(0);
			expect(dmp.P).toEqual(0);
			expect(dmp.SP).toEqual(0xFF);
			expect(dmp.PC).toEqual(0);

			expect(cpu._mainMemory.readByte(0xFF)).toEqual(0);
		})

		it("can transfer its flags to a single byte", function(){
			cpu.totalReset();
			cpu.flagC = true;
			cpu.flagN = true;
			expect(cpu.flagsToP()).toEqual(0x81);

			cpu.totalReset();
			cpu.flagN = true;
			cpu.flagV = true;
			expect(cpu.flagsToP()).toEqual(0xC0);
		})

		it("can set its flags according to a given byte", function(){
			cpu.totalReset();
			cpu.pToFlags(0x81)
			expect(cpu.flagN).toEqual(true);
			expect(cpu.flagC).toEqual(true);
			expect(cpu.flagB).toEqual(false);
			expect(cpu.flagV).toEqual(false);

			cpu.totalReset();
			cpu.pToFlags(0xC0)
			expect(cpu.flagN).toEqual(true);
			expect(cpu.flagC).toEqual(false);
			expect(cpu.flagB).toEqual(false);
			expect(cpu.flagV).toEqual(true);
		})

		describe("with basic stack operations", function(){
			it("pushes a byte", function(){
				cpu.totalReset();
				cpu.pushByte(0xAB);
				expect(cpu._regs[regSP]).toEqual(0xFE);
				expect(cpu.readByte(0x1FF)).toEqual(0xAB);
			})

			it("pops a byte", function(){
				var tmp = cpu.popByte();
				expect(tmp).toEqual(0xAB);
				expect(cpu._regs[regSP]).toEqual(0xFF);
			})

			it("pushes a word", function(){
				cpu.totalReset();
				cpu.pushWord(0xFACE);
				expect(cpu._regs[regSP]).toEqual(0xFD);
				expect(cpu.readWord(0x1FE)).toEqual(0xFACE);
			})

			it("pops a word", function(){
				var tmp = cpu.popWord();
				expect(tmp).toEqual(0xFACE);
				expect(cpu._regs[regSP]).toEqual(0xFF);
			})

			it("wraps around the stack", function(){
				cpu.totalReset();
				cpu._regs[regSP] = 0;
				cpu.pushByte(0xAB);
				expect(cpu._regs[regSP]).toEqual(0xFF);
				expect(cpu.readByte(0x100)).toEqual(0xAB);

				cpu.totalReset();
				cpu._regs[regSP] = 0;
				cpu.pushWord(0xFACE);
				expect(cpu._regs[regSP]).toEqual(0xFE);
				expect(cpu.readByte(0x100)).toEqual(0xFA);
				expect(cpu.readByte(0x1FF)).toEqual(0xCE);

				var tmp = cpu.popWord();
				expect(tmp).toEqual(0xFACE);
				expect(cpu._regs[regSP]).toEqual(0x00);
			})
		})

		it("handles interrupts", function(){
			cpu.totalReset();
			cpu.pToFlags(0x80);
			cpu._regPC[regPC] = 0x1234;
			cpu.writeWord(0xFFFA, 0xFACE);
			cpu.writeWord(0xFFFC, 0xABCD);
			cpu.writeWord(0xFFFE, 0xBEAD);

			cpu.postInterrupt(INTERRUPT_IRQ);
			expect(cpu._regInterrupt).toEqual(INTERRUPT_IRQ);
			var tmp = cpu.handleInterrupt()
			expect(tmp).toEqual(7)
			expect(cpu._regInterrupt).toEqual(INTERRUPT_NONE);
			expect(cpu.flagI).toEqual(true);
			expect(cpu._regPC[regPC]).toEqual(0xBEAD);
			expect(cpu.popByte()).toEqual(0x80);
			expect(cpu.popWord()).toEqual(0x1234);

			//Ignore IRQ when flagI is set.
			cpu.postInterrupt(INTERRUPT_IRQ);
			expect(cpu._regInterrupt).toEqual(INTERRUPT_NONE);

			cpu.postInterrupt(INTERRUPT_NMI);
			cpu.handleInterrupt();
			expect(cpu._regPC[regPC]).toEqual(0xFACE);

			cpu.postInterrupt(INTERRUPT_RESET);
			cpu.handleInterrupt();
			expect(cpu._regPC[regPC]).toEqual(0xABCD);
		})

	})

	describe("with opcode parser", function(){
		beforeEach(function(){
			cpu.totalReset();
		})

		//Helper functions for testing opcode behavior
		//Note the first test for each opcode group will be the most verbose, 
		//since it will test all behaviors of the ALU proc. To test these for each opcode
		//in the group would be redundant.
		function _opTest(opcode, expectedCycles, expectedVals){
			var tmp = cpu.execute(opcode),
					dmp = cpu.dumpRegs();

			expect(tmp).toEqual(expectedCycles);

			for (var key in expectedVals){
				if (expectedVals[key] === true){
					expect(dmp[key]).toBeTruthy();
				} else if (expectedVals[key] === false){
					expect(dmp[key]).toBeFalsy();
				} else {
					expect(dmp[key]).toEqual(expectedVals[key]);
				}
			}
		}

		describe("executes ADC", function(){
			//First test I wrote, so it's a little longer :)
			it("in immediate mode", function(){
				cpu.writeWord(0, 0x0101);
				cpu.writeWord(2, 0x0202);
				cpu.writeWord(4, 0xFFFF);
				cpu.writeWord(6, 0xFFFF);
				cpu._regs[regX] = 1;
				cpu._regs[regY] = 2;
				_opTest(0x69, 2, {A: 1, flagC: false});
				_opTest(0x69, 2, {A: 3, flagC: false});
				_opTest(0x69, 2, {A: 2, flagC: true});
				_opTest(0x69, 2, {A: 2, flagC: true, flagZ: false, flagV: false, flagN: false});
				cpu.totalReset();
				_opTest(0x69, 2, {A: 0, flagC: false, flagZ: true, flagV: false});
				cpu.writeWord(2, 0xFFFF);
				_opTest(0x69, 2, {A: 0xFF, flagC: false, flagZ: false, flagV: false, flagN: true});
				cpu.totalReset();
				//Should trigger overflow
				cpu.writeByte(1, 126);
				cpu._regs[regA] = 126;
				_opTest(0x69, 2, {A: 252, flagC: false, flagZ: false, flagV: true});

				cpu.totalReset();
				cpu.writeByte(1, 64);
				cpu._regs[regA] = 65;
				_opTest(0x69, 2, {flagV: true});

			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu.writeWord(2, 0xABAB);
				cpu.writeByte(0xAB, 0xCD);
				_opTest(0x65, 3, {A: 0, flagZ: true});
				_opTest(0x65, 3, {A: 0xCD})
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xAF, 0xBE);
				cpu.writeByte(1, 0xAD);
				cpu._regs[regX] = 2;
				_opTest(0x75, 4, {A: 0xBE})
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xBEAD, 0x12);
				cpu.writeWord(1, 0xBEAD);
				_opTest(0x6D, 4, {A: 0x12});
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x34);
				cpu.writeWord(1, 0xFACB);
				cpu._regs[regX] = 3;
				_opTest(0x7D, 4, {A: 0x34});

				//Add extra cycle when adding x reg goes to next page
				cpu.totalReset();
				cpu.writeByte(0x4103, 0x56);
				cpu.writeWord(1, 0x40FE);
				cpu._regs[regX] = 5;
				_opTest(0x7D, 5, {A: 0x56});
			})

			it("in absolute indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x1201, 0x78);
				cpu.writeWord(1, 0x11FA);
				cpu._regs[regY] = 7;
				_opTest(0x79, 5, {A: 0x78});

				cpu.totalReset();
				cpu.writeByte(0x1727, 0xF0);
				cpu.writeWord(1, 0x1701);
				cpu._regs[regY] = 0x26;
				_opTest(0x79, 4, {A: 0xF0});
			})

			it("in indirect indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xBADA, 0x15);
				cpu.writeWord(0x76, 0xBADA);
				cpu.writeByte(1, 0x72);
				cpu._regs[regX] = 4;
				_opTest(0x61, 6, {A: 0x15});
			})

			it("in indirect indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xCADA, 0x47);
				cpu.writeWord(0xBA, 0xCAD7);
				cpu.writeByte(1, 0xBA);
				cpu._regs[regY] = 3;
				_opTest(0x71, 5, {A: 0x47});

				//Expect extra cycle for page cross
				cpu.totalReset();
				cpu.writeByte(0x4302, 0xF2);
				cpu.writeWord(0x6D, 0x42FA);
				cpu.writeByte(1, 0x6D);
				cpu._regs[regY] = 8;
				_opTest(0x71, 6, {A: 0xF2});
			})
		})

		describe("executes AND", function(){
			it("in immediate mode", function(){
				cpu._regs[regA] = 0xFF;
				cpu.writeByte(1, 0xF0);
				_opTest(0x29, 2, {A: 0xF0, flagN: true, flagZ: false});

				cpu.writeByte(3, 0xF);
				_opTest(0x29, 2, {A: 0, flagN: false, flagZ: true});
			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu._regs[regA] = 0xFF;
				cpu.writeByte(0x54, 0xF);
				cpu.writeByte(1, 0x54);
				_opTest(0x25, 3, {A: 0xF});
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu._regs[regA] = 0xFF;
				cpu.writeByte(0xDC, 1);
				cpu.writeByte(1, 0xD0);
				cpu._regs[regX] = 0xC;
				_opTest(0x35, 4, {A: 1});
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu._regs[regA] = 0xFF;
				cpu.writeByte(0xABCD, 0x2);
				cpu.writeWord(1, 0xABCD);
				_opTest(0x2D, 4, {A: 2});
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu._regs[regA] = 0xFF;
				cpu.writeByte(0xFD03, 0x4);
				cpu.writeWord(1, 0xFCFE);
				cpu._regs[regX] = 5;
				_opTest(0x3D, 5, {A: 4});
			})

			it("in absolute indexed y mode", function(){
				cpu.totalReset();
				cpu._regs[regA] = 0xFF;
				cpu.writeByte(0x0345, 0x8);
				cpu.writeWord(1, 0x0342);
				cpu._regs[regY] = 3;
				_opTest(0x39, 4, {A: 8});
			})

			it("in indirect indexed x mode", function(){
				cpu.totalReset();
				cpu._regs[regA] = 0xFF;
				cpu.writeByte(0xBADA, 0x15);
				cpu.writeWord(0x76, 0xBADA);
				cpu.writeByte(1, 0x72);
				cpu._regs[regX] = 4;
				_opTest(0x21, 6, {A: 0x15});
			})

			it("in indirect indexed y mode", function(){
				cpu.totalReset();
				cpu._regs[regA] = 0xCA;
				cpu.writeByte(0xCADA, 0xF);
				cpu.writeWord(0xBA, 0xCAD7);
				cpu.writeByte(1, 0xBA);
				cpu._regs[regY] = 3;
				_opTest(0x31, 5, {A: 0xA});

				//Expect extra cycle for page cross
				cpu.totalReset();
				cpu._regs[regA] = 0xFF;
				cpu.writeByte(0x4302, 0xF2);
				cpu.writeWord(0x6D, 0x42FA);
				cpu.writeByte(1, 0x6D);
				cpu._regs[regY] = 8;
				_opTest(0x31, 6, {A: 0xF2});
			})
		})

		describe("executes ASL", function(){
			it("in accumulator mode", function(){
				cpu._regs[regA] = 0x80;
				_opTest(0x0A, 2, {A: 0, flagN: false, flagZ: true, flagC: true});
				cpu._regs[regA] = 0x01;
				_opTest(0x0A, 2, {A: 2, flagN: false, flagZ: false, flagC: false});
				cpu._regs[regA] = 0xC0; //11000000b
				_opTest(0x0A, 2, {A: 0x80, flagN: true, flagZ: false, flagC: true});
			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xCB, 0x40);
				cpu.writeByte(1, 0xCB);
				var tmp = cpu.execute(0x06);
				expect(tmp).toEqual(5);
				expect(cpu.readByte(0xCB)).toEqual(0x80);
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x89, 0x2);
				cpu.writeByte(1, 0x82);
				cpu._regs[regX] = 0x7;
				var tmp = cpu.execute(0x16);
				expect(tmp).toEqual(6);
				expect(cpu.readByte(0x89)).toEqual(4);
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFEDC, 0x4);
				cpu.writeWord(1, 0xFEDC);
				var tmp = cpu.execute(0x0E);
				expect(tmp).toEqual(6);
				expect(cpu.readByte(0xFEDC)).toEqual(0x8);
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFEDC, 0x2);
				cpu.writeWord(1, 0xFEDA);
				cpu._regs[regX] = 0x2;
				var tmp = cpu.execute(0x1E);
				expect(tmp).toEqual(7);
				expect(cpu.readByte(0xFEDC)).toEqual(0x4);
			})
		})
		
		describe("executes BCC", function(){
			it("in relative mode", function(){
				cpu.writeByte(1, 30);
				cpu.flagC = true;
				_opTest(0x90, 2, {PC: 2});

				//Take branch, no page cross
				cpu.totalReset();
				cpu.writeByte(1, 30);
				cpu.flagC = false;
				_opTest(0x90, 3, {PC: 32});

				//Branch w/page cross forward
				cpu.totalReset();
				cpu.writeByte(253, 6);
				cpu.flagC = false;
				cpu._regPC[regPC] = 252;
				_opTest(0x90, 4, {PC: 260});

				//Branch w/page cross backward
				cpu.totalReset();
				cpu.writeByte(0x3303, 250) //-6
				cpu.flagC = false;
				cpu._regPC[regPC] = 0x3302;
				_opTest(0x90, 4, {PC: 0x32FE});
			})
		})

		//The rest of the branch opcodes are identical
		//in the branching implementation except for the condition
		//tested, so the tests are much simpler
		describe("executes BCS", function(){
			it("in relative mode", function(){
				cpu.writeByte(1, 30);
				cpu.flagC = false;
				_opTest(0xB0, 2, {PC: 2});

				cpu.totalReset();
				cpu.writeByte(1, 30);
				cpu.flagC = true;
				_opTest(0xB0, 3, {PC: 32});
			})
		})

		describe("executes BEQ", function(){
			it("in relative mode", function(){
				cpu.totalReset();
				cpu.writeByte(1, 30);
				cpu.flagZ = false;
				_opTest(0xF0, 2, {PC: 2});

				cpu.totalReset();
				cpu.writeByte(253, 6);
				cpu.flagZ = true;
				cpu._regPC[regPC] = 252;
				_opTest(0xF0, 4, {PC: 260});
			})
		})

		describe("executes BIT", function(){
			it("in zero page mode", function(){
				cpu._regs[regA] = 1;
				cpu.writeByte(20, 1)
				cpu.writeByte(1, 20);
				_opTest(0x24, 3, {flagN: false, flagV: false, flagZ: false});

				cpu.totalReset();
				cpu.writeByte(1, 1);
				_opTest(0x24, 3, {flagN: false, flagV: false, flagZ: true});
			
				cpu.totalReset();
				cpu.writeByte(30, 0xFF);
				cpu.writeByte(1, 30);
				_opTest(0x24, 3, {flagN: true, flagV: true, flagZ: true});
			
				cpu.totalReset();
				cpu.writeByte(0xFA, 0x40);
				cpu.writeByte(1, 0xFA);
				cpu._regs[regA] = 0xFF;
				_opTest(0x24, 3, {flagN: false, flagV: true, flagZ: false});

				cpu.totalReset();
				cpu.writeByte(0x80, 0x80);
				cpu.writeByte(1, 0x80);
				_opTest(0x24, 3, {flagN: true, flagV: false, flagZ: true});
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu._regs[regA] = 1;
				cpu.writeByte(0xFACE, 1)
				cpu.writeWord(1, 0xFACE);
				_opTest(0x2C, 4, {flagN: false, flagV: false, flagZ: false});
			})
		})

		describe("executes BMI", function(){
			it("in relative mode", function(){
				cpu.totalReset();
				cpu.writeByte(1, 30);
				cpu.flagN = false;
				_opTest(0x30, 2, {PC: 2});

				cpu.totalReset();
				cpu.writeByte(253, 6);
				cpu.flagN = true;
				cpu._regPC[regPC] = 252;
				_opTest(0x30, 4, {PC: 260});
			})
		})

		describe("executes BNE", function(){
			it("in relative mode", function(){
				cpu.writeByte(1, 30);
				cpu.flagZ = true;
				_opTest(0xD0, 2, {PC: 2});

				cpu.totalReset();
				cpu.writeByte(1, 30);
				cpu.flagZ = false;
				_opTest(0xD0, 3, {PC: 32});

				cpu.totalReset();
				cpu.writeByte(253, 6);
				cpu.flagZ = false;
				cpu._regPC[regPC] = 252;
				_opTest(0xD0, 4, {PC: 260});

				cpu.totalReset();
				cpu.writeByte(0x3303, 250) //-6
				cpu.flagZ = false;
				cpu._regPC[regPC] = 0x3302;
				_opTest(0xD0, 4, {PC: 0x32FE});
			})
		})

		describe("executes BPL", function(){
			it("in relative mode", function(){
				cpu.totalReset();
				cpu.writeByte(1, 30);
				cpu.flagN = true;
				_opTest(0x10, 2, {PC: 2});

				cpu.totalReset();
				cpu.writeByte(253, 6);
				cpu.flagN = false;
				cpu._regPC[regPC] = 252;
				_opTest(0x10, 4, {PC: 260});
			})
		})

		describe("executes BRK", function(){
			it("in imlplied mode", function(){
				cpu.writeWord(0xFFFE, 0xABCD);
				_opTest(0x00, 7, {PC: 0xABCD, flagI: true, SP: 0xFC})
				expect(cpu.readByte(0x1FD)).toEqual(0x10);
				expect(cpu.readWord(0x1FE)).toEqual(2);
			})
		})

		describe("executes BVC", function(){
			it("in relative mode", function(){
				cpu.totalReset();
				cpu.writeByte(1, 30);
				cpu.flagV = true;
				_opTest(0x50, 2, {PC: 2});

				cpu.totalReset();
				cpu.writeByte(253, 6);
				cpu.flagV = false;
				cpu._regPC[regPC] = 252;
				_opTest(0x50, 4, {PC: 260});
			})
		})

		describe("executes BVS", function(){
			it("in relative mode", function(){
				cpu.totalReset();
				cpu.writeByte(1, 30);
				cpu.flagV = false;
				_opTest(0x70, 2, {PC: 2});

				cpu.totalReset();
				cpu.writeByte(253, 6);
				cpu.flagV = true;
				cpu._regPC[regPC] = 252;
				_opTest(0x70, 4, {PC: 260});
			})
		})

		describe("executes CLC", function(){
			it("in implied mode", function(){
				cpu.pToFlags(0xFF);
				_opTest(0x18, 2, {flagC: false});
			})
		})

		describe("executes CLD", function(){
			it("in implied mode", function(){
				cpu.pToFlags(0xFF);
				_opTest(0xD8, 2, {flagD: false});
			})
		})

		describe("executes CLI", function(){
			it("in implied mode", function(){
				cpu.pToFlags(0xFF);
				_opTest(0x58, 2, {flagI: false});
			})
		})

		describe("executes CLV", function(){
			it("in implied mode", function(){
				cpu.pToFlags(0xFF);
				_opTest(0xB8, 2, {flagV: false});
			})
		})

		describe("executes CMP", function(){
			it("in immediate mode", function(){
				cpu.writeByte(1, 0x0);
				_opTest(0xC9, 2, {flagN: false, flagZ: true, flagC: true});
				cpu.writeByte(3, 0x27);
				_opTest(0xC9, 2, {flagN: true, flagZ: false, flagC: false});
				cpu.writeByte(5, 0x4);
				cpu._regs[regA] = 0xFF;
				_opTest(0xC9, 2, {flagN: true, flagZ: false, flagC: true});
				cpu.writeByte(7, 0xFA);
				cpu._regs[regA] = 0xFA;
				_opTest(0xC9, 2, {flagN: false, flagZ: true, flagC: true});
			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xCD, 0x1);
				cpu.writeByte(1, 0xCD);
				cpu._regs[regA] = 1;
				_opTest(0xC5, 3, {flagN: false, flagZ: true, flagC: true});
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xCD, 0x1);
				cpu.writeByte(1, 0xCA);
				cpu._regs[regA] = 1;
				cpu._regs[regX] = 3;
				_opTest(0xD5, 4, {flagN: false, flagZ: true, flagC: true});
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x1);
				cpu.writeWord(1, 0xFACE);
				cpu._regs[regA] = 1;
				_opTest(0xCD, 4, {flagN: false, flagZ: true, flagC: true});
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x1);
				cpu.writeWord(1, 0xFACB);
				cpu._regs[regA] = 1;
				cpu._regs[regX] = 3;
				_opTest(0xDD, 4, {flagN: false, flagZ: true, flagC: true});
			})

			it("in absolute indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x1);
				cpu.writeWord(1, 0xFACB);
				cpu._regs[regA] = 1;
				cpu._regs[regY] = 3;
				_opTest(0xD9, 4, {flagN: false, flagZ: true, flagC: true});
			})
		
			it("in indirect indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x1);
				cpu.writeWord(0x72, 0xFACE);
				cpu.writeWord(1, 0x70);
				cpu._regs[regA] = 1;
				cpu._regs[regX] = 2;
				_opTest(0xC1, 6, {flagN: false, flagZ: true, flagC: true});
			})

			it("in indirect indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x1);
				cpu.writeWord(0x72, 0xFACA);
				cpu.writeWord(1, 0x72);
				cpu._regs[regA] = 1;
				cpu._regs[regY] = 4;
				_opTest(0xD1, 5, {flagN: false, flagZ: true, flagC: true});
			})
		})

		describe("executes CPX", function(){
			it("in immediate mode", function(){
				cpu.writeByte(1, 0x0);
				_opTest(0xE0, 2, {flagN: false, flagZ: true, flagC: true});
				cpu.writeByte(3, 0x27);
				_opTest(0xE0, 2, {flagN: true, flagZ: false, flagC: false});
				cpu.writeByte(5, 0x4);
				cpu._regs[regX] = 0xFF;
				_opTest(0xE0, 2, {flagN: true, flagZ: false, flagC: true});
				cpu.writeByte(7, 0xFA);
				cpu._regs[regX] = 0xFA;
				_opTest(0xE0, 2, {flagN: false, flagZ: true, flagC: true});
			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xCD, 0x1);
				cpu.writeByte(1, 0xCD);
				cpu._regs[regX] = 1;
				_opTest(0xE4, 3, {flagN: false, flagZ: true, flagC: true});
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x1);
				cpu.writeWord(1, 0xFACE);
				cpu._regs[regX] = 1;
				_opTest(0xEC, 4, {flagN: false, flagZ: true, flagC: true});
			})
		})

		describe("executes CPY", function(){
			it("in immediate mode", function(){
				cpu.writeByte(1, 0x0);
				_opTest(0xC0, 2, {flagN: false, flagZ: true, flagC: true});
			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xCD, 0x1);
				cpu.writeByte(1, 0xCD);
				cpu._regs[regY] = 1;
				_opTest(0xC4, 3, {flagN: false, flagZ: true, flagC: true});
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x1);
				cpu.writeWord(1, 0xFACE);
				cpu._regs[regY] = 1;
				_opTest(0xCC, 4, {flagN: false, flagZ: true, flagC: true});
			})
		})

		describe("executes DEC", function(){
			it("in zero page mode", function(){
				cpu.writeByte(0x70, 0x3);
				cpu.writeByte(1, 0x70);
				_opTest(0xC6, 5, {flagN: false, flagZ: false});
				expect(cpu.readByte(0x70)).toEqual(2);

				cpu.totalReset();
				cpu.writeByte(0x70, 0x1);
				cpu.writeByte(1, 0x70);
				_opTest(0xC6, 5, {flagN: false, flagZ: true});
				expect(cpu.readByte(0x70)).toEqual(0);

				cpu.totalReset();
				cpu.writeByte(0x70, 0x0);
				cpu.writeByte(1, 0x70);
				_opTest(0xC6, 5, {flagN: true, flagZ: false});
				expect(cpu.readByte(0x70)).toEqual(255);
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x70, 3);
				cpu.writeByte(1, 0x6E);
				cpu._regs[regX] = 2;
				_opTest(0xD6, 6, {flagN: false, flagZ: false});
				expect(cpu.readByte(0x70)).toEqual(2);
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 3);
				cpu.writeWord(1, 0xFACE);
				cpu.flagZ = true;
				_opTest(0xCE, 6, {flagN: false, flagZ: false});
				expect(cpu.readByte(0xFACE)).toEqual(2);
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 3);
				cpu.writeWord(1, 0xFACD);
				cpu._regs[regX] = 1;
				_opTest(0xDE, 7, {flagN: false, flagZ: false});
				expect(cpu.readByte(0xFACE)).toEqual(2);
			})
		})

		describe("executes DEX", function(){
			it("in implied mode", function(){
				cpu._regs[regX] = 3;
				_opTest(0xCA, 2, {flagN: false, flagZ: false, X: 2});

				cpu.totalReset();
				cpu._regs[regX] = 1;
				_opTest(0xCA, 2, {flagN: false, flagZ: true, X: 0});

				cpu.totalReset();
				cpu._regs[regX] = 0;
				_opTest(0xCA, 2, {flagN: true, flagZ: false, X: 255});
			})
		})

		describe("executes DEY", function(){
			it("in implied mode", function(){
				cpu._regs[regY] = 3;
				_opTest(0x88, 2, {flagN: false, flagZ: false, Y: 2});

				cpu.totalReset();
				cpu._regs[regY] = 1;
				_opTest(0x88, 2, {flagN: false, flagZ: true, Y: 0});

				cpu.totalReset();
				cpu._regs[regY] = 0;
				_opTest(0x88, 2, {flagN: true, flagZ: false, Y: 255});
			})
		})

		describe("executes EOR", function(){
			it("in immediate mode", function(){
				cpu.writeByte(1, 0xFF);
				_opTest(0x49, 2, {A: 0xFF, flagN: true, flagZ: false});
				cpu.totalReset()
				_opTest(0x49, 2, {A: 0, flagN: false, flagZ: true});
			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x70, 0xFF);
				cpu.writeByte(1, 0x70);
				_opTest(0x45, 3, {A: 0xFF, flagN: true, flagZ: false});
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x70, 0xFF);
				cpu.writeByte(1, 0x6F);
				cpu._regs[regX] = 1;
				_opTest(0x55, 4, {A: 0xFF, flagN: true, flagZ: false});
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0xFF);
				cpu.writeWord(1, 0xFACE);
				_opTest(0x4D, 4, {A: 0xFF, flagN: true, flagZ: false});
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xF100, 0xFF);
				cpu.writeWord(1, 0xF0FF);
				cpu._regs[regX] = 1;
				_opTest(0x5D, 5, {A: 0xFF, flagN: true, flagZ: false});
			})

			it("in absolute indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0xFF);
				cpu.writeWord(1, 0xFACD);
				cpu._regs[regY] = 1;
				_opTest(0x59, 4, {A: 0xFF, flagN: true, flagZ: false});
			})

			it("in indirect indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0xFF);
				cpu.writeWord(0x70, 0xFACE);
				cpu.writeWord(1, 0x6C);
				cpu._regs[regX] = 4;
				_opTest(0x41, 6, {A: 0xFF, flagN: true, flagZ: false});
			})

			it("in indirect indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xF100, 0xFF);
				cpu.writeWord(0x70, 0xF0FF)
				cpu.writeByte(1, 0x70);
				cpu._regs[regY] = 1;
				_opTest(0x51, 6, {A: 0xFF, flagN: true, flagZ: false});
			})
		})

		describe("executes INC", function(){
			it("in zero page mode", function(){
				cpu.writeByte(0x70, 0x3);
				cpu.writeByte(1, 0x70);
				_opTest(0xE6, 5, {flagN: false, flagZ: false});
				expect(cpu.readByte(0x70)).toEqual(4);

				cpu.totalReset();
				cpu.writeByte(0x70, 0xFF);
				cpu.writeByte(1, 0x70);
				_opTest(0xE6, 5, {flagN: false, flagZ: true});
				expect(cpu.readByte(0x70)).toEqual(0);

				cpu.totalReset();
				cpu.writeByte(0x70, 0xFE);
				cpu.writeByte(1, 0x70);
				_opTest(0xE6, 5, {flagN: true, flagZ: false});
				expect(cpu.readByte(0x70)).toEqual(255);
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x70, 3);
				cpu.writeByte(1, 0x6E);
				cpu._regs[regX] = 2;
				_opTest(0xF6, 6, {flagN: false, flagZ: false});
				expect(cpu.readByte(0x70)).toEqual(4);
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 3);
				cpu.writeWord(1, 0xFACE);
				cpu.flagZ = true;
				_opTest(0xEE, 6, {flagN: false, flagZ: false});
				expect(cpu.readByte(0xFACE)).toEqual(4);
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 3);
				cpu.writeWord(1, 0xFACD);
				cpu._regs[regX] = 1;
				_opTest(0xFE, 7, {flagN: false, flagZ: false});
				expect(cpu.readByte(0xFACE)).toEqual(4);
			})
		})

		describe("executes INX", function(){
			it("in implied mode", function(){
				cpu._regs[regX] = 3;
				_opTest(0xE8, 2, {flagN: false, flagZ: false, X: 4});

				cpu.totalReset();
				cpu._regs[regX] = 255;
				_opTest(0xE8, 2, {flagN: false, flagZ: true, X: 0});

				cpu.totalReset();
				cpu._regs[regX] = 254;
				_opTest(0xE8, 2, {flagN: true, flagZ: false, X: 255});
			})
		})

		describe("executes INY", function(){
			it("in implied mode", function(){
				cpu._regs[regY] = 3;
				_opTest(0xC8, 2, {flagN: false, flagZ: false, Y: 4});

				cpu.totalReset();
				cpu._regs[regY] = 255;
				_opTest(0xC8, 2, {flagN: false, flagZ: true, Y: 0});

				cpu.totalReset();
				cpu._regs[regY] = 254;
				_opTest(0xC8, 2, {flagN: true, flagZ: false, Y: 255});
			})
		})

		describe("executes JMP", function(){
			it("in absolute mode", function(){
				cpu.writeWord(1, 0xFACE)
				_opTest(0x4C, 3, {PC: 0xFACE});
			})

			it("in indirect mode", function(){
				cpu.totalReset();
				cpu.writeWord(0xFACE, 0xBEAD);
				cpu.writeWord(1, 0xFACE);
				_opTest(0x6C, 5, {PC: 0xBEAD});
			})
		})

		describe("executes JSR", function(){
			it("in absolute mode", function(){
				cpu._regPC[regPC] = 0xCEAD;
				cpu.writeWord(0xCEAE, 0xFACE);
				_opTest(0x20, 6, {PC: 0xFACE});
				expect(cpu.popWord()).toEqual(0xCEB0);
			})
		})

		describe("executes LDA", function(){
			it("in immediate mode", function(){
				cpu.writeByte(1, 0x02);
				_opTest(0xA9, 2, {A: 0x02, flagN: false, flagZ: false});
				cpu.writeByte(3, 0x0);
				_opTest(0xA9, 2, {A: 0, flagN: false, flagZ: true});
				cpu.writeByte(5, 0xA5);
				_opTest(0xA9, 2, {A: 0xA5, flagN: true, flagZ: false})
			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x70, 0xAB);
				cpu.writeByte(1, 0x70);
				_opTest(0xA5, 3, {A: 0xAB, flagN: true, flagZ: false});
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x70, 0xCD);
				cpu.writeByte(1, 0x6F);
				cpu._regs[regX] = 1;
				_opTest(0xB5, 4, {A: 0xCD, flagN: true, flagZ: false});
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0xFD);
				cpu.writeWord(1, 0xFACE);
				_opTest(0xAD, 4, {A: 0xFD, flagN: true, flagZ: false});
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xF100, 0xFE);
				cpu.writeWord(1, 0xF0FF);
				cpu._regs[regX] = 1;
				_opTest(0xBD, 5, {A: 0xFE, flagN: true, flagZ: false});
			})

			it("in absolute indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0xFF);
				cpu.writeWord(1, 0xFACD);
				cpu._regs[regY] = 1;
				_opTest(0xB9, 4, {A: 0xFF, flagN: true, flagZ: false});
			})

			it("in indirect indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0xAF);
				cpu.writeWord(0x70, 0xFACE);
				cpu.writeWord(1, 0x6C);
				cpu._regs[regX] = 4;
				_opTest(0xA1, 6, {A: 0xAF, flagN: true, flagZ: false});
			})

			it("in indirect indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xF100, 0xBF);
				cpu.writeWord(0x70, 0xF0FF)
				cpu.writeByte(1, 0x70);
				cpu._regs[regY] = 1;
				_opTest(0xB1, 6, {A: 0xBF, flagN: true, flagZ: false});
			})
		})
		
		describe("executes LDX", function(){
			it("in immediate mode", function(){
				cpu.writeByte(1, 0x02);
				_opTest(0xA2, 2, {X: 0x02, flagN: false, flagZ: false});
				cpu.writeByte(3, 0x0);
				_opTest(0xA2, 2, {X: 0, flagN: false, flagZ: true});
				cpu.writeByte(5, 0xA5);
				_opTest(0xA2, 2, {X: 0xA5, flagN: true, flagZ: false})
			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x70, 0xAB);
				cpu.writeByte(1, 0x70);
				_opTest(0xA6, 3, {X: 0xAB, flagN: true, flagZ: false});
			})

			it("in zero page indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x70, 0xCD);
				cpu.writeByte(1, 0x6F);
				cpu._regs[regY] = 1;
				_opTest(0xB6, 4, {X: 0xCD, flagN: true, flagZ: false});
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0xFD);
				cpu.writeWord(1, 0xFACE);
				_opTest(0xAE, 4, {X: 0xFD, flagN: true, flagZ: false});
			})

			it("in absolute indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xF100, 0xFE);
				cpu.writeWord(1, 0xF0FF);
				cpu._regs[regY] = 1;
				_opTest(0xBE, 5, {X: 0xFE, flagN: true, flagZ: false});
			})
		})

		describe("executes LDY", function(){
			it("in immediate mode", function(){
				cpu.writeByte(1, 0x02);
				_opTest(0xA0, 2, {Y: 0x02, flagN: false, flagZ: false});
				cpu.writeByte(3, 0x0);
				_opTest(0xA0, 2, {Y: 0, flagN: false, flagZ: true});
				cpu.writeByte(5, 0xA5);
				_opTest(0xA0, 2, {Y: 0xA5, flagN: true, flagZ: false})
			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x70, 0xAB);
				cpu.writeByte(1, 0x70);
				_opTest(0xA4, 3, {Y: 0xAB, flagN: true, flagZ: false});
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x70, 0xCD);
				cpu.writeByte(1, 0x6F);
				cpu._regs[regX] = 1;
				_opTest(0xB4, 4, {Y: 0xCD, flagN: true, flagZ: false});
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0xFD);
				cpu.writeWord(1, 0xFACE);
				_opTest(0xAC, 4, {Y: 0xFD, flagN: true, flagZ: false});
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xF100, 0xFE);
				cpu.writeWord(1, 0xF0FF);
				cpu._regs[regX] = 1;
				_opTest(0xBC, 5, {Y: 0xFE, flagN: true, flagZ: false});
			})
		})

		describe("executes LSR", function(){
			it("in accumulator mode", function(){
				cpu._regs[regA] = 0x80;
				_opTest(0x4A, 2, {A: 0x40, flagN: false, flagZ: false, flagC: false});
				cpu._regs[regA] = 0x01;
				_opTest(0x4A, 2, {A: 0x00, flagN: false, flagZ: true, flagC: true});
				cpu._regs[regA] = 0x03;
				_opTest(0x4A, 2, {A: 0x01, flagN: false, flagZ: false, flagC: true});
			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x80, 0x40);
				cpu.writeByte(1, 0x80);
				_opTest(0x46, 5, {flagN: false, flagZ: false, flagC: false});
				expect(cpu.readByte(0x80)).toEqual(0x20);
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFD, 0x20);
				cpu.writeByte(1, 0xFB);
				cpu._regs[regX] = 2;
				_opTest(0x56, 6, {});
				expect(cpu.readByte(0xFD)).toEqual(0x10);
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x80);
				cpu.writeWord(1, 0xFACE);
				_opTest(0x4E, 6, {});
				expect(cpu.readByte(0xFACE)).toEqual(0x40);
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xABCD, 0x40);
				cpu.writeWord(1, 0xABC9);
				cpu._regs[regX] = 4;
				_opTest(0x5E, 7, {});
				expect(cpu.readByte(0xABCD)).toEqual(0x20);
			})
		})

		describe("executes NOP", function(){
			it("in implied mode", function(){
				_opTest(0xEA, 2, {});
			})
		})

		describe("executes ORA", function(){
			it("in immediate mode", function(){
				cpu.writeByte(1, 1);
				cpu._regs[regA] = 0x80;
				_opTest(0x09, 2, {A: 0x81, flagN: true, flagZ: false});
				cpu.writeByte(3, 0);
				cpu._regs[regA] = 0;
				_opTest(0x09, 2, {A: 0, flagN: false, flagZ: true});
				cpu.writeByte(5, 2);
				cpu._regs[regA] = 1;
				_opTest(0x09, 2, {A: 3, flagN: false, flagZ: false});
			})

			it("in zero page mode", function(){
				cpu.writeByte(0x70, 0x02);
				cpu.writeByte(1, 0x70);
				cpu._regs[regA] = 0x80;
				_opTest(0x05, 3, {A: 0x82});
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x70, 2);
				cpu.writeByte(1, 0x6F);
				cpu._regs[regX] = 1;
				cpu._regs[regA] = 0x80;
				_opTest(0x15, 4, {A: 0x82, flagN: true, flagZ: false});
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 2);
				cpu.writeWord(1, 0xFACE);
				cpu._regs[regA] = 0x80;
				_opTest(0x0D, 4, {A: 0x82, flagN: true, flagZ: false});
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xF100, 0x02);
				cpu.writeWord(1, 0xF0FF);
				cpu._regs[regX] = 1;
				cpu._regs[regA] = 0x80;
				_opTest(0x1D, 5, {A: 0x82, flagN: true, flagZ: false});
			})

			it("in absolute indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x02);
				cpu.writeWord(1, 0xFACD);
				cpu._regs[regY] = 1;
				cpu._regs[regA] = 0x80;
				_opTest(0x19, 4, {A: 0x82, flagN: true, flagZ: false});
			})

			it("in indirect indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x02);
				cpu.writeWord(0x70, 0xFACE);
				cpu.writeWord(1, 0x6C);
				cpu._regs[regX] = 4;
				cpu._regs[regA] = 0x80;
				_opTest(0x01, 6, {A: 0x82, flagN: true, flagZ: false});
			})

			it("in indirect indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xF100, 0x02);
				cpu.writeWord(0x70, 0xF0FF)
				cpu.writeByte(1, 0x70);
				cpu._regs[regY] = 1;
				cpu._regs[regA] = 0x80;
				_opTest(0x11, 6, {A: 0x82, flagN: true, flagZ: false});
			})
		})

		describe("executes PHA", function(){
			it("in implied mode", function(){
				cpu._regs[regA] = 0xBA;
				_opTest(0x48, 3, {A: 0xBA});
				expect(cpu.popByte()).toEqual(0xBA);
			})
		})

		describe("executes PHP", function(){
			it("in implied mode", function(){
				cpu.flagC = true;
				cpu.flagZ = true;
				cpu.flagN = true;
				_opTest(0x08, 3, {});
				//Were the flags combined and pushed correctly?
				expect(cpu.popByte()).toEqual(0x83);
			})
		})

		describe("executes PLA", function(){
			it("in implied mode", function(){
				cpu._regs[regA] = 0xBA;
				cpu.execute(0x48);
				cpu._regs[regA] = 0x00;
				_opTest(0x68, 4, {A: 0xBA, flagN: true, flagZ: false});
			})
		})

		describe("executes PLP", function(){
			it("in implied mode", function(){
				cpu.flagC = true;
				cpu.flagZ = true;
				cpu.flagN = true;
				cpu.execute(0x08);
				cpu.flagC = false;
				cpu.flagZ = false;
				cpu.flagN = false;
				_opTest(0x28, 4, {});
				expect(cpu.flagC).toEqual(true);
				expect(cpu.flagZ).toEqual(true);
				expect(cpu.flagN).toEqual(true);
			})
		})

		describe("executes ROL", function(){
			it("in accumulator mode", function(){
				cpu._regs[regA] = 0x01;
				_opTest(0x2A, 2, {A: 0x02, flagN: false, flagZ: false, flagC: false});
				cpu._regs[regA] = 0x80;
				_opTest(0x2A, 2, {A: 0x00, flagN: false, flagZ: true, flagC: true});
				cpu._regs[regA] = 0x40;
				cpu.flagC = true;
				_opTest(0x2A, 2, {A: 0x81, flagN: true, flagZ: false, flagC: false});
			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x80, 0x20);
				cpu.writeByte(1, 0x80);
				_opTest(0x26, 5, {flagN: false, flagZ: false, flagC: false});
				expect(cpu.readByte(0x80)).toEqual(0x40);
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFD, 0x20);
				cpu.writeByte(1, 0xFB);
				cpu._regs[regX] = 2;
				_opTest(0x36, 6, {});
				expect(cpu.readByte(0xFD)).toEqual(0x40);
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x20);
				cpu.writeWord(1, 0xFACE);
				_opTest(0x2E, 6, {});
				expect(cpu.readByte(0xFACE)).toEqual(0x40);
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xABCD, 0x20);
				cpu.writeWord(1, 0xABC9);
				cpu._regs[regX] = 4;
				_opTest(0x3E, 7, {});
				expect(cpu.readByte(0xABCD)).toEqual(0x40);
			})
		})

		describe("executes ROR", function(){
			it("in accumulator mode", function(){
				cpu._regs[regA] = 0x80;
				_opTest(0x6A, 2, {A: 0x40, flagN: false, flagZ: false, flagC: false});
				cpu._regs[regA] = 0x01;
				_opTest(0x6A, 2, {A: 0x00, flagN: false, flagZ: true, flagC: true});
				cpu._regs[regA] = 0x02;
				cpu.flagC = true;
				_opTest(0x6A, 2, {A: 0x81, flagN: true, flagZ: false, flagC: false});
			})

			it("in zero page mode", function(){
				cpu.totalReset();
				cpu.writeByte(0x80, 0x20);
				cpu.writeByte(1, 0x80);
				_opTest(0x66, 5, {flagN: false, flagZ: false, flagC: false});
				expect(cpu.readByte(0x80)).toEqual(0x10);
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFD, 0x20);
				cpu.writeByte(1, 0xFB);
				cpu._regs[regX] = 2;
				_opTest(0x76, 6, {});
				expect(cpu.readByte(0xFD)).toEqual(0x10);
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xFACE, 0x20);
				cpu.writeWord(1, 0xFACE);
				_opTest(0x6E, 6, {});
				expect(cpu.readByte(0xFACE)).toEqual(0x10);
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(0xABCD, 0x20);
				cpu.writeWord(1, 0xABC9);
				cpu._regs[regX] = 4;
				_opTest(0x7E, 7, {});
				expect(cpu.readByte(0xABCD)).toEqual(0x10);
			})
		})

		describe("executes RTI", function(){
			it("in implied mode", function(){
				cpu.flagC = true;
				cpu.flagZ = true;
				cpu._regPC[regPC] = 0xFACE;
				cpu.postInterrupt(INTERRUPT_IRQ);
				cpu.handleInterrupt();
				cpu.flagZ = false;
				cpu._regPC[regPC] = 0xABCD;
				_opTest(0x40, 6, {
					PC: 0xFACE,
					flagI: false,
					flagC: true,
					flagZ: true,
				})
			})
		})

		describe("executes RTS", function(){
			it("in implied mode", function(){
				cpu.flagC = true;
				cpu.flagZ = true;
				cpu._regPC[regPC] = 0xCEAD;
				cpu.writeWord(0xCEAE, 0xFACE);
				cpu.execute(0x20);
				cpu.flagZ = false;
				cpu._regPC[regPC] = 0xABCD;
				_opTest(0x60, 6, {
					PC: 0xCEB0,
					flagC: true,
					flagZ: false,
				})
			})
		})

		describe("executes SBC", function(){
			it("in immediate mode", function(){
				cpu.writeByte(1, 2);
				cpu._regs[regA] = 3;
				cpu.flagC = true;
				_opTest(0xE9, 2, {A: 1, flagN: false, flagZ: false, flagC: true, flagV: false});
				
				cpu.totalReset();
				cpu.writeByte(1, 3);
				cpu._regs[regA] = 5;
				cpu.flagC = true;
				_opTest(0xE9, 2, {A: 2, flagN: false, flagZ: false, flagC: true, flagV: false});
			
				cpu.totalReset();
				cpu.writeByte(1, 6);
				cpu._regs[regA] = 5;
				cpu.flagC = true;
				_opTest(0xE9, 2, {A: 255, flagN: true, flagZ: false, flagC: false, flagV: false});
			
				//Making sure overflow is being set correctly...
				cpu.totalReset();
				cpu.writeByte(1, -1);
				cpu._regs[regA] = 127;
				cpu.flagC = true;
				_opTest(0xE9, 2, {A: 128, flagV: true});

				cpu.totalReset();
				cpu.writeByte(1, 1);
				cpu._regs[regA] = -128;
				cpu.flagC = true;
				_opTest(0xE9, 2, {A: 127, flagV: true, flagC: true});

				cpu.totalReset();
				cpu.writeByte(1, 1);
				cpu._regs[regA] = -128;
				cpu.flagC = true;
				_opTest(0xE9, 2, {A: 127, flagV: true});

				cpu.totalReset();
				cpu.writeByte(1, 1);
				cpu._regs[regA] = 0;
				cpu.flagC = true;
				_opTest(0xE9, 2, {A: 255, flagV: false});

				cpu.totalReset();
				cpu.writeByte(1, 64);
				cpu._regs[regA] = -64;
				//cpu.flagC = true;
				_opTest(0xE9, 2, {A: 127, flagV: true});
			})

			it("in zero page mode", function(){
				cpu.writeByte(0xAB, 4);
				cpu.writeByte(1, 0xAB);
				cpu._regs[regA] = 5;
				cpu.flagC = true;
				_opTest(0xE5, 3, {A: 1});
			})

			it("in zero page indexed x mode", function(){
				cpu.writeByte(0xAB, 4);
				cpu.writeByte(1, 0xA9);
				cpu._regs[regA] = 5;
				cpu._regs[regX] = 2;
				cpu.flagC = true;
				_opTest(0xF5, 4, {A: 1});
			})

			it("in absolute mode", function(){
				cpu.writeByte(0xFACE, 4);
				cpu.writeWord(1, 0xFACE);
				cpu._regs[regA] = 5;
				cpu.flagC = true;
				_opTest(0xED, 4, {A: 1});
			})

			it("in absolute indexed x mode", function(){
				cpu.writeByte(0xA101, 4);
				cpu.writeWord(1, 0xA0FE);
				cpu._regs[regX] = 3;
				cpu._regs[regA] = 5;
				cpu.flagC = true;
				_opTest(0xFD, 5, {A: 1});
			})

			it("in absolute indexed y mode", function(){
				cpu.writeByte(0xA101, 4);
				cpu.writeWord(1, 0xA0FE);
				cpu._regs[regY] = 3;
				cpu._regs[regA] = 5;
				cpu.flagC = true;
				_opTest(0xF9, 5, {A: 1});
			})

			it("in indirect indexed x mode", function(){
				cpu.writeByte(0xA101, 4);
				cpu.writeWord(0xAB, 0xA101);
				cpu.writeByte(1, 0xA8);
				cpu._regs[regX] = 3;
				cpu._regs[regA] = 5;
				cpu.flagC = true;
				_opTest(0xE1, 6, {A: 1});
			})

			it("in indirect indexed y mode", function(){
				cpu.writeByte(0xA101, 4);
				cpu.writeWord(0xAB, 0xA0FE);
				cpu.writeWord(1, 0xAB);
				cpu._regs[regY] = 3;
				cpu._regs[regA] = 5;
				cpu.flagC = true;
				_opTest(0xF1, 6, {A: 1});
			})
		})

		describe("executes SEC", function(){
			it("in implied mode", function(){
				_opTest(0x38, 2, {flagC: true});
			})
		})

		describe("executes SED", function(){
			it("in implied mode", function(){
				_opTest(0xF8, 2, {flagD: true});
			})
		})

		describe("executes SEI", function(){
			it("in implied mode", function(){
				_opTest(0x78, 2, {flagI: true});
			})
		})

		describe("executes STA", function(){
			it("in zero page mode", function(){
				cpu.writeByte(1, 0x21);
				cpu._regs[regA] = 0xAB;
				_opTest(0x85, 3, {});
				expect(cpu.readByte(0x21)).toEqual(0xAB);
			})

			it("in zero page indexed x mode", function(){
				cpu.totalReset();
				cpu.writeByte(1, 0x21);
				cpu._regs[regA] = 0xAB;
				cpu._regs[regX] = 3
				_opTest(0x95, 4, {});
				expect(cpu.readByte(0x24)).toEqual(0xAB);
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeWord(1, 0xFACE);
				cpu._regs[regA] = 0xAB;
				_opTest(0x8D, 4, {});
				expect(cpu.readByte(0xFACE)).toEqual(0xAB);
			})

			it("in absolute indexed x mode", function(){
				cpu.totalReset();
				cpu.writeWord(1, 0xFACC);
				cpu._regs[regA] = 0xAB;
				cpu._regs[regX] = 2;
				_opTest(0x9D, 5, {});
				expect(cpu.readByte(0xFACE)).toEqual(0xAB);
			})

			it("in absolute indexed y mode", function(){
				cpu.totalReset();
				cpu.writeWord(1, 0xFACC);
				cpu._regs[regA] = 0xAB;
				cpu._regs[regY] = 2;
				_opTest(0x99, 5, {});
				expect(cpu.readByte(0xFACE)).toEqual(0xAB);
			})

			it("in indirect indexed x mode", function(){
				cpu.totalReset();
				cpu.writeWord(0x12, 0xFACE)
				cpu.writeByte(1, 0x10);
				cpu._regs[regA] = 0xAB;
				cpu._regs[regX] = 2;
				_opTest(0x81, 6, {});
				expect(cpu.readByte(0xFACE)).toEqual(0xAB);
			})

			it("in indirect indexed y mode", function(){
				cpu.totalReset();
				cpu.writeWord(0x12, 0xFACC)
				cpu.writeByte(1, 0x12);
				cpu._regs[regA] = 0xAB;
				cpu._regs[regY] = 2;
				_opTest(0x91, 6, {});
				expect(cpu.readByte(0xFACE)).toEqual(0xAB);
			})
		})

		describe("executes STX", function(){
			it("in zero page mode", function(){
				cpu.writeByte(1, 0x21);
				cpu._regs[regX] = 0xAB;
				_opTest(0x86, 3, {});
				expect(cpu.readByte(0x21)).toEqual(0xAB);
			})

			it("in zero page indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(1, 0x21);
				cpu._regs[regX] = 0xAB;
				cpu._regs[regY] = 3
				_opTest(0x96, 4, {});
				expect(cpu.readByte(0x24)).toEqual(0xAB);
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeWord(1, 0xFACE);
				cpu._regs[regX] = 0xAB;
				_opTest(0x8E, 4, {});
				expect(cpu.readByte(0xFACE)).toEqual(0xAB);
			})
		})

		describe("executes STY", function(){
			it("in zero page mode", function(){
				cpu.writeByte(1, 0x21);
				cpu._regs[regY] = 0xAB;
				_opTest(0x84, 3, {});
				expect(cpu.readByte(0x21)).toEqual(0xAB);
			})

			it("in zero page indexed y mode", function(){
				cpu.totalReset();
				cpu.writeByte(1, 0x21);
				cpu._regs[regY] = 0xAB;
				cpu._regs[regX] = 3
				_opTest(0x94, 4, {});
				expect(cpu.readByte(0x24)).toEqual(0xAB);
			})

			it("in absolute mode", function(){
				cpu.totalReset();
				cpu.writeWord(1, 0xFACE);
				cpu._regs[regY] = 0xAB;
				_opTest(0x8C, 4, {});
				expect(cpu.readByte(0xFACE)).toEqual(0xAB);
			})
		})

		describe("executes TAX", function(){
			it("in implied mode",function(){
				cpu._regs[regA] = 0xCD;
				_opTest(0xAA, 2, {A: 0xCD, X: 0xCD, flagN: true, flagZ: false});
				cpu._regs[regA] = 0x00;
				_opTest(0xAA, 2, {A: 0x00, X: 0x00, flagN: false, flagZ: true});
				cpu._regs[regA] = 0x04;
				_opTest(0xAA, 2, {A: 0x04, X: 0x04, flagN: false, flagZ: false});
			})
		})

		describe("executes TAY", function(){
			it("in implied mode",function(){
				cpu._regs[regA] = 0xCD;
				_opTest(0xA8, 2, {A: 0xCD, Y: 0xCD, flagN: true, flagZ: false});
				cpu._regs[regA] = 0x00;
				_opTest(0xA8, 2, {A: 0x00, Y: 0x00, flagN: false, flagZ: true});
				cpu._regs[regA] = 0x04;
				_opTest(0xA8, 2, {A: 0x04, Y: 0x04, flagN: false, flagZ: false});
			})
		})

		describe("executes TSX", function(){
			it("in implied mode",function(){
				cpu._regs[regSP] = 0xCD;
				_opTest(0xBA, 2, {SP: 0xCD, X: 0xCD, flagN: true, flagZ: false});
				cpu._regs[regSP] = 0x00;
				_opTest(0xBA, 2, {SP: 0x00, X: 0x00, flagN: false, flagZ: true});
				cpu._regs[regSP] = 0x04;
				_opTest(0xBA, 2, {SP: 0x04, X: 0x04, flagN: false, flagZ: false});
			})
		})

		describe("executes TXA", function(){
			it("in implied mode",function(){
				cpu._regs[regX] = 0xCD;
				_opTest(0x8A, 2, {X: 0xCD, A: 0xCD, flagN: true, flagZ: false});
				cpu._regs[regX] = 0x00;
				_opTest(0x8A, 2, {X: 0x00, A: 0x00, flagN: false, flagZ: true});
				cpu._regs[regX] = 0x04;
				_opTest(0x8A, 2, {X: 0x04, A: 0x04, flagN: false, flagZ: false});
			})
		})

		describe("executes TXS", function(){
			it("in implied mode",function(){
				cpu._regs[regX] = 0xCD;
				_opTest(0x9A, 2, {X: 0xCD, SP: 0xCD, flagN: false, flagZ: false});
				cpu._regs[regX] = 0x00;
				_opTest(0x9A, 2, {X: 0x00, SP: 0x00, flagN: false, flagZ: false});
				cpu._regs[regX] = 0x04;
				_opTest(0x9A, 2, {X: 0x04, SP: 0x04, flagN: false, flagZ: false});
			})
		})

		describe("executes TYA", function(){
			it("in implied mode",function(){
				cpu._regs[regY] = 0xCD;
				_opTest(0x98, 2, {Y: 0xCD, A: 0xCD, flagN: true, flagZ: false});
				cpu._regs[regY] = 0x00;
				_opTest(0x98, 2, {Y: 0x00, A: 0x00, flagN: false, flagZ: true});
				cpu._regs[regY] = 0x04;
				_opTest(0x98, 2, {Y: 0x04, A: 0x04, flagN: false, flagZ: false});
			})
		})

		// describe("throws an error when given an illegal opcode", function(){
		// 	it("reports the illegal opcode", function(){
		// 		var badOp = cpu.execute.bind(cpu, 0xAB);
		// 		expect(badOp).toThrowError(/0xab/);
		// 	})
		// })
	})

	cpu.totalReset();

	describe("correctly emulates the mirroring of specific address ranges", function(){
		it("mirrors $0000 to $07FF at $0800 to $0FFF, $1000 to $17FF, and $18FF to $1FFF", function(){
			cpu.writeByte(0x0017, 0xAB);
			expect(cpu.readByte(0x0017)).toEqual(0xAB);
			expect(cpu.readByte(0x0817)).toEqual(0xAB);
			expect(cpu.readByte(0x1017)).toEqual(0xAB);
			expect(cpu.readByte(0x1817)).toEqual(0xAB);

			cpu.writeByte(0x1234, 0xCD);
			expect(cpu.readByte(0x0234)).toEqual(0xCD);
			expect(cpu.readByte(0x0A34)).toEqual(0xCD);
			expect(cpu.readByte(0x1234)).toEqual(0xCD);
			expect(cpu.readByte(0x1A34)).toEqual(0xCD);
		})

		cpu.totalReset();

		it("mirrors $2000 to $2007 every 8 bytes until $4000", function(){
			cpu.writeByte(0x2001, 0xAB);
			for(var tmpAddr = 0x2001; tmpAddr < 0x4000; tmpAddr += 8){
				expect(cpu.readByte(tmpAddr)).toEqual(0xAB);
			}

			cpu.writeByte(0x3018, 0xCD);
			for(var tmpAddr = 0x2000; tmpAddr < 0x4000; tmpAddr += 8){
				expect(cpu.readByte(tmpAddr)).toEqual(0xCD);
			}
		})

		it("correctly handles a word at a mirrored region's boundary", function(){
			cpu.totalReset();
			cpu.writeWord(0x07FF, 0xFACE);
			expect(cpu.readWord(0x07FF)).toEqual(0xFACE);
			expect(cpu.readWord(0x17FF)).toEqual(0xFACE);
			expect(cpu.readByte(0x07FF)).toEqual(0xCE);
			expect(cpu.readByte(0x0000)).toEqual(0xFA);

			cpu.totalReset();
			cpu.writeWord(0x2007, 0xFACE);
			expect(cpu.readWord(0x2007)).toEqual(0xFACE);
			expect(cpu.readWord(0x3007)).toEqual(0xFACE);
			expect(cpu.readByte(0x2007)).toEqual(0xCE);
			expect(cpu.readByte(0x2000)).toEqual(0xFA);
		})
	})
})