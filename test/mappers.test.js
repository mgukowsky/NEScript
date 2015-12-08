describe("An emulated NES MMC mapper chip", function(){
	describe("loads a ROM", function(){
		it("with the NROM mapper (iNES ID 0)", function(){
			var c = new NEScript.CPU();
			var p = new NEScript.PPU(c._mainMemory);
			var Controller = new NEScript.Controller(c._mainMemory);

			//Mock raw ROM w/iNES conforming 16-byte header, 2 16KB banks, and 1 8KB bank
			var SMBHeader = [0x4E, 0x45, 0x53, 0x1A, 0x02, 0x01, 0x01, 0x00,
											 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
			var garbageA = new Array(0x4000);
			//IE can't do Array#fill :/
			//garbageA.fill(0xAB);
			for(var i = 0; i < garbageA.length; i++){
				garbageA[i] = 0xAB;
			}
			var garbageB = new Array(0x4000);
			//garbageB.fill(0xCD);
			for(var i = 0; i < garbageB.length; i++){
				garbageB[i] = 0xCD;
			}
			var garbageC = new Array(0x2000);
			//garbageC.fill(0xEF);
			for(var i = 0; i < garbageC.length; i++){
				garbageC[i] = 0xEF;
			}
			var a = SMBHeader.concat(garbageA, garbageB, garbageC);

			var u = new Uint8Array(a);
			var testROM = new NEScript.ROM(u);
			var m = new NEScript.Mapper(c._mainMemory, p._VRAM, Controller);

			m.loadROM(testROM);

			expect(m.LOADED_MIRROR_TYPE).toEqual(1);

			expect(c.readByte(0x8000)).toEqual(0xAB);
			expect(c.readByte(0xBFFF)).toEqual(0xAB);
			expect(c.readByte(0xC000)).toEqual(0xCD);
			expect(c.readByte(0xFFFF)).toEqual(0xCD);
			expect(c.readByte(0x7FFF)).toEqual(0x00);
			expect(c.readByte(0x3000)).toEqual(0x00);
			expect(p.readByte(0x1000)).toEqual(0xEF);
			expect(p.readByte(0x1FFF)).toEqual(0xEF);
			expect(p.readByte(0x2000)).toEqual(0x00);
			expect(p.readByte(0x3000)).toEqual(0x00);
		})

		it("monitors for writes to controller registers", function(){
			//Tests if the mapper is passing the controller enough information to know
			//when to enter strobe

			var c = new NEScript.CPU();
			var p = new NEScript.PPU(c._mainMemory);
			var Controller = new NEScript.Controller(c._mainMemory);
			var m = new NEScript.Mapper(c._mainMemory, p._VRAM, Controller);
			Controller.connect();

			//Write 1 then 0 to $4016; should trigger controller strobe
			//LDA #1
			//STA $4016
			//LDA #0
			//STA $4016

			//Set up operands at expected locations in memory
			c.writeByte(1, 1);
			c.writeWord(3, 0x4016);
			c.writeByte(6, 0);
			c.writeWord(8, 0x4016);

			c.execute(0xA9);
			m.monitorProc();
			c.execute(0x8D);
			m.monitorProc();
			c.execute(0xA9);
			m.monitorProc();
			c.execute(0x8D);
			m.monitorProc();

			expect(Controller.strobeCounter).toEqual(24);
		})
	})
})