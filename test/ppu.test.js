describe("The 2C02 PPU", function(){

	function testFourBytes(buffer, addr, expectedColor, expectedAlpha){
		for(var i = 0; i < 3; i++){
			expect(buffer[addr + i]).toEqual(expectedColor);
		}

		expect(buffer[addr + 3]).toEqual(expectedAlpha);
	}

	var cpu = new NEScript.CPU();
	var ppu = new NEScript.PPU(cpu._mainMemory, cpu);

	describe("with basic functionality", function(){
		it("coerces a 64KB address into a 16KB range", function(){
			ppu.writeByte(0x7FFF, 0xAB);
			expect(ppu.readByte(0x3FFF)).toEqual(0xAB);
		})

		it("implements mirroring of $0000 to $3FFF", function(){
			ppu.writeByte(0x8F12, 0xAB);
			expect(ppu.readByte(0x0F12)).toEqual(0xAB);

			ppu.writeByte(0x2ABC, 0xAB);
			expect(ppu.readByte(0x6ABC)).toEqual(0xAB);
		})

		it("implements mirroring of $2000 to $2EFF at $3000 to $3EFF", function(){
			ppu.writeByte(0x2123, 0xCD);
			expect(ppu.readByte(0x3123)).toEqual(0xCD);

			ppu.writeByte(0x3EFF, 0xEF);
			expect(ppu.readByte(0x2EFF)).toEqual(0xEF);
		})

		ppu.totalReset();

		it("implements mirroring of $3F00 to $3F1F multiple times in range $3F20 to $3FFF", function(){
			ppu.writeByte(0x3F20, 0x34);
			expect(ppu.readByte(0x3F00)).toEqual(0x34);
			expect(ppu.readByte(0x3F80)).toEqual(0x34);

			ppu.writeByte(0x3F17, 0x56);
			expect(ppu.readByte(0x3F37)).toEqual(0x56);
			expect(ppu.readByte(0x3FF7)).toEqual(0x56);			
		})

		//See fine mirroring implementation for explanation
		it("implements fine mirroring within palette RAM", function(){
			ppu.writeByte(0x3F00, 0x78);
			expect(ppu.readByte(0x3F10)).toEqual(0x78);

			ppu.writeByte(0x3F18, 0x90);
			expect(ppu.readByte(0x3F08)).toEqual(0x90);
		})

		it("wraps correctly when R/W a VRAM word at a multiple of $3FFF", function(){
			ppu.writeWord(0x3FFF, 0x1234);
			expect(ppu.readByte(0)).toEqual(0x12);
			expect(ppu.readWord(0x3FFF)).toEqual(0x1234);
		})

		it("resets itself", function(){
			ppu.totalReset();
			expect(ppu.readWord(0x3FFF)).toEqual(0);
		})
	})

	describe("with video output capability", function(){

		it("writes a single pixel to the video buffer", function(){
			ppu.blitPixel(20, 20, 1, 2, 3);
			var tmpIdx = ((20 * ppu.canvasEl.width) + 20) * 4;

			expect(ppu._vbuffer.data[tmpIdx]).toEqual(1);
			expect(ppu._vbuffer.data[tmpIdx + 1]).toEqual(2);
			expect(ppu._vbuffer.data[tmpIdx + 2]).toEqual(3);
			expect(ppu._vbuffer.data[tmpIdx + 3]).toEqual(0xFF);

			ppu.blitPixel(20, 20, 4, 5, 6, 0);

			expect(ppu._vbuffer.data[tmpIdx]).toEqual(4);
			expect(ppu._vbuffer.data[tmpIdx + 1]).toEqual(5);
			expect(ppu._vbuffer.data[tmpIdx + 2]).toEqual(6);
			expect(ppu._vbuffer.data[tmpIdx + 3]).toEqual(0);
		})

		it("correctly parses the low 2 bits of a tile pixel in a pattern table", function(){
			ppu.totalReset();
			//Forms the tile pattern 33112200
			ppu.writeByte(0, parseInt("11110000", 2));
			ppu.writeByte(8, parseInt("11001100", 2));
			var tmpBuff = new Uint8Array(0xFF);
			ppu.blitTile(tmpBuff, 0, {'01': 0x00, '10': 0x10, '11': 0x20});

			testFourBytes(tmpBuff, 0, 0xFF, 0xFF);
			testFourBytes(tmpBuff, 4, 0xFF, 0xFF);
			testFourBytes(tmpBuff, 8, 0x75, 0xFF);
			testFourBytes(tmpBuff, 12, 0x75, 0xFF);
			testFourBytes(tmpBuff, 16, 0xBC, 0xFF);
			testFourBytes(tmpBuff, 20, 0xBC, 0xFF);
		})

		it("correctly uses the color at $3F00 as the universale background color", function(){
			cpu.totalReset();
			ppu.totalReset();

			//Set the universal background color
			ppu.writeByte(0x3F00, 0x21);

			ppu.writeByte(0, parseInt("11110000", 2));
			ppu.writeByte(8, parseInt("11001100", 2));
			var tmpBuff = new Uint8Array(0xFF);
			ppu.blitTile(tmpBuff, 0, {'01': 0x00, '10': 0x10, '11': 0x20});

			expect(tmpBuff[24]).toEqual(0x3F);
			expect(tmpBuff[25]).toEqual(0xBF);
			expect(tmpBuff[26]).toEqual(0xFF);
			expect(tmpBuff[27]).toEqual(0xFF);
			expect(tmpBuff[28]).toEqual(0x3F);
			expect(tmpBuff[29]).toEqual(0xBF);
			expect(tmpBuff[30]).toEqual(0xFF);
			expect(tmpBuff[31]).toEqual(0xFF);
		})

		it("correctly uses attribute tables and palettes", function(){
			cpu.totalReset();
			ppu.totalReset();
			for(var i = 0; i < ppu._vbuffer.data.length; i++){
				ppu._vbuffer.data[i] = 0;
			}

			ppu.writeByte(0x3F00, 0x00);
			ppu.writeByte(0x3F01, 0x20);
			ppu.writeByte(0x3F02, 0x10);
			ppu.writeByte(0x3F03, 0x00);

			ppu.writeByte(0x2000, 0);
			ppu.writeByte(0x23C0, 0);

			ppu.writeByte(0, parseInt("11110000", 2));
			ppu.writeByte(8, parseInt("11001100", 2));

			ppu.blitNameTableBackgroundEntry(0, 0, 0x2000);
			
			testFourBytes(ppu._vbuffer.data, 0, 0x75, 0xEF);
			testFourBytes(ppu._vbuffer.data, 4, 0x75, 0xEF);
			testFourBytes(ppu._vbuffer.data, 8, 0xFF, 0xEF);
			testFourBytes(ppu._vbuffer.data, 12, 0xFF, 0xEF);
			testFourBytes(ppu._vbuffer.data, 16, 0xBC, 0xEF);
			testFourBytes(ppu._vbuffer.data, 20, 0xBC, 0xEF);
			testFourBytes(ppu._vbuffer.data, 24, 0x75, 0xFF);

			cpu.totalReset();
			ppu.totalReset();
			for(var i = 0; i < ppu._vbuffer.data.length; i++){
				ppu._vbuffer.data[i] = 0;
			}

			ppu.writeByte(0x3F0D, 0x20);
			ppu.writeByte(0x3F0E, 0x10);
			ppu.writeByte(0x3F0F, 0x00);

			ppu.writeByte(0x2000 + 98, 1);
			ppu.writeByte(0x23C0, 0xC0); //Set bottom right palette to background palette 3

			ppu.writeByte(16, parseInt("11110000", 2));
			ppu.writeByte(24, parseInt("11001100", 2));

			//The 98th tile, which would be on the bottom right
			ppu.blitNameTableBackgroundEntry(0, 0, 0x2000 + 98);
			
			testFourBytes(ppu._vbuffer.data, 0, 0x75, 0xEF);
			testFourBytes(ppu._vbuffer.data, 4, 0x75, 0xEF);
			testFourBytes(ppu._vbuffer.data, 8, 0xFF, 0xEF);
			testFourBytes(ppu._vbuffer.data, 12, 0xFF, 0xEF);
			testFourBytes(ppu._vbuffer.data, 16, 0xBC, 0xEF);
			testFourBytes(ppu._vbuffer.data, 20, 0xBC, 0xEF);
		})

		describe("uses OAM appropriately", function(){
			ppu.totalReset();
			cpu.totalReset();
			it("draws a sprite to the screen without any flipping, and without changing the background color", function(){
				ppu.writeByte(0x3F00, 0x20);
				ppu.writeByte(0x3F01, 0x20);
				ppu.writeByte(0x3F02, 0x10);
				ppu.writeByte(0x3F03, 0x00);
				ppu.writeByte(0x3F11, 0x20);
				ppu.writeByte(0x3F12, 0x10);
				ppu.writeByte(0x3F13, 0x00);

				ppu.blitNameTableBackgroundEntry(0, 0, 0x2000);
				testFourBytes(ppu._vbuffer.data, 0, 0xFF, 0xFF);

				ppu.writeByte(0, parseInt("11110000", 2));
				ppu.writeByte(8, parseInt("11001100", 2));

				ppu.writeByte(0x3F00, 0x00);
				ppu._OAM.writeByte(0, 255);
				ppu._OAM.writeByte(1, 0);
				ppu._OAM.writeByte(2, parseInt("00000000", 2));
				ppu._OAM.writeByte(3, 0);
				ppu.REGISTERS.spriteSizeIs8x8 = true;
				ppu.blitSprite(0);

				testFourBytes(ppu._vbuffer.data, 0, 0x75, 0xCD);
				//Background should not have changed, even though we changed $3F00
				testFourBytes(ppu._vbuffer.data, 24, 0xFF, 0xFF);
				testFourBytes(ppu._vbuffer.data, 28, 0xFF, 0xFF);
			})

			it("flips a sprite horizontally", function(){
				ppu.totalReset();
				cpu.totalReset();

				ppu.writeByte(0x3F11, 0x20);
				ppu.writeByte(0x3F12, 0x10);
				ppu.writeByte(0x3F13, 0x00);

				ppu.writeByte(0, parseInt("11110000", 2));
				ppu.writeByte(8, parseInt("11001100", 2));

				ppu._OAM.writeByte(0, 255);
				ppu._OAM.writeByte(1, 0);
				ppu._OAM.writeByte(2, parseInt("01000000", 2));
				ppu._OAM.writeByte(3, 0);
				ppu.REGISTERS.spriteSizeIs8x8 = true;
				ppu.blitSprite(0);
				testFourBytes(ppu._vbuffer.data, 0, 0x00, 0xFF);
				testFourBytes(ppu._vbuffer.data, 8, 0xBC, 0xCD); //Sprite 0 -> 0xCD
				testFourBytes(ppu._vbuffer.data, 16, 0xFF, 0xCD);
				testFourBytes(ppu._vbuffer.data, 24, 0x75, 0xCD);
			})

			it("flips a sprite vertically", function(){
				ppu.totalReset();
				cpu.totalReset();

				ppu.writeByte(0x3F11, 0x20);
				ppu.writeByte(0x3F12, 0x10);
				ppu.writeByte(0x3F13, 0x00);

				ppu.writeByte(0, parseInt("11110000", 2));
				ppu.writeByte(8, parseInt("11001100", 2));

				ppu._OAM.writeByte(0, 255);
				ppu._OAM.writeByte(1, 0);
				ppu._OAM.writeByte(2, parseInt("10000000", 2));
				ppu._OAM.writeByte(3, 0);
				ppu.REGISTERS.spriteSizeIs8x8 = true;
				ppu.blitSprite(0);

				testFourBytes(ppu._vbuffer.data, 7168, 0x75, 0xCD);
				testFourBytes(ppu._vbuffer.data, 7176, 0xFF, 0xCD);
				testFourBytes(ppu._vbuffer.data, 7184, 0xBC, 0xCD);
				testFourBytes(ppu._vbuffer.data, 7192, 0x00, 0xFF);
			})

			it("flips a sprite horizontally and vertically", function(){
				ppu.totalReset();
				cpu.totalReset();

				ppu.writeByte(0x3F11, 0x20);
				ppu.writeByte(0x3F12, 0x10);
				ppu.writeByte(0x3F13, 0x00);

				ppu.writeByte(0, parseInt("11110000", 2));
				ppu.writeByte(8, parseInt("11001100", 2));

				ppu._OAM.writeByte(0, 255);
				ppu._OAM.writeByte(1, 0);
				ppu._OAM.writeByte(2, parseInt("11100000", 2));
				ppu._OAM.writeByte(3, 0);
				ppu.REGISTERS.spriteSizeIs8x8 = true;
				ppu.blitSprite(0);

				testFourBytes(ppu._vbuffer.data, 7168, 0x00, 0xFF);
				testFourBytes(ppu._vbuffer.data, 7176, 0xBC, 0x89);
				testFourBytes(ppu._vbuffer.data, 7184, 0xFF, 0x89);
				testFourBytes(ppu._vbuffer.data, 7192, 0x75, 0x89);
			})

		})

	})
	
	ppu.totalReset();
	cpu.totalReset();

	describe("monitors for writes to certain addresses", function(){
		it("responds to a write to PPUCTRL ($2000)", function(){
			cpu.writeByte(0x2000, parseInt("00010010", 2));
			ppu.tick(true);

			expect(ppu.REGISTERS.nameTableBaseAddr).toEqual(0x2800);
			expect(ppu.REGISTERS.patternTableOffset).toEqual(0x1000);
			expect(ppu.REGISTERS.spritePatternTableOffset).toEqual(0);
			expect(ppu.REGISTERS.spriteSizeIs8x8).toEqual(true);
			expect(ppu._mainMemory.ppuIncr).toEqual(1);
			expect(ppu.REGISTERS.shouldGenerateNMI).toEqual(false);

			cpu.writeByte(0x2000, parseInt("10101100", 2));
			ppu.tick(true);

			expect(ppu.REGISTERS.nameTableBaseAddr).toEqual(0x2000);
			expect(ppu.REGISTERS.patternTableOffset).toEqual(0);
			expect(ppu.REGISTERS.spritePatternTableOffset).toEqual(0x1000);
			expect(ppu.REGISTERS.spriteSizeIs8x8).toEqual(false);
			expect(ppu._mainMemory.ppuIncr).toEqual(32);
			expect(ppu.REGISTERS.shouldGenerateNMI).toEqual(true);
		});

		it("responds to a write to PPUMASK ($2001)", function(){
			ppu.totalReset();
			cpu.totalReset();

			cpu.writeByte(0x2001, parseInt("00001010", 2));
			ppu.tick(true);

			expect(ppu.REGISTERS.shouldShowBackground).toEqual(true);
			expect(ppu.REGISTERS.shouldShowSprites).toEqual(false);
			expect(ppu.REGISTERS.shouldShowLeftmostBackground).toEqual(true);
			expect(ppu.REGISTERS.shouldShowLeftmostSprites).toEqual(false);

			cpu.writeByte(0x2001, parseInt("00010100", 2));
			ppu.tick(true);

			expect(ppu.REGISTERS.shouldShowBackground).toEqual(false);
			expect(ppu.REGISTERS.shouldShowSprites).toEqual(true);
			expect(ppu.REGISTERS.shouldShowLeftmostBackground).toEqual(false);
			expect(ppu.REGISTERS.shouldShowLeftmostSprites).toEqual(true);
		})

		it("responds to a read of PPUSTATUS ($2002) by resetting $2002.7", function(){
			ppu.totalReset();
			cpu.totalReset();

			ppu._mainMemory.writeByte(0x2002, parseInt("11111111", 2));
			cpu.readByte(0x2002);
			expect(ppu._mainMemory.readByte(0x2002)).toEqual(parseInt("01111111", 2));

		})

		it("responds to a pair of writes to PPUSCROLL ($2005)", function(){
			ppu.totalReset();
			cpu.totalReset();

			//first write is to x offset, second is to y offset
			cpu.writeByte(0x2005, 0xAB);
			ppu.tick(true);
			cpu.writeByte(0x2005, 0xCD);
			ppu.tick(true);

			expect(ppu.REGISTERS.fineXOffset).toEqual(0xAB);
			expect(ppu.REGISTERS.fineYOffset).toEqual(0xCD);

			cpu.writeByte(0x2005, 0xEF);
			ppu.tick(true);

			expect(ppu.REGISTERS.fineXOffset).toEqual(0xEF);
			expect(ppu.REGISTERS.fineYOffset).toEqual(0xCD);
		})

		it("responds to a pair of writes to PPUADDR ($2006)", function(){
			ppu.totalReset();
			cpu.totalReset();

			//first write is to hi byte, second is to lo byte
			cpu.writeByte(0x2006, 0x12);
			ppu.tick(true);
			cpu.writeByte(0x2006, 0x34);
			ppu.tick(true);

			expect(ppu._mainMemory.ppuAddr).toEqual(0x1234);

			cpu.writeByte(0x2006, 0x21);
			ppu.tick(true);

			expect(ppu._mainMemory.ppuAddr).toEqual(0x2134);
		});


		it("responds to a read of PPUDATA, and increments accordingly", function(){
			ppu.totalReset();
			cpu.totalReset();

			cpu.writeByte(0x2006, 0x12);
			ppu.tick(true);
			cpu.writeByte(0x2006, 0x34);
			ppu.tick(true);
			ppu.writeByte(0x1234, 0xAB);
			ppu.writeByte(0x1235, 0xCD);

			//Emulates a dummy read, then returns the buffered values
			expect(cpu.readByte(0x2007)).toEqual(0);
			expect(cpu.readByte(0x2007)).toEqual(0xAB);
			expect(cpu.readByte(0x2007)).toEqual(0xCD);

			cpu.writeByte(0x2006, 0x3F);
			ppu.tick(true);
			cpu.writeByte(0x2006, 0x01);
			ppu.tick(true);
			ppu.writeByte(0x3F01, 0x45);
			//Should return a palette entry immediately
			expect(cpu.readByte(0x2007)).toEqual(0x45);
		})

		it("responds to multiple writes to PPUDATA ($2007) by writing to VRAM and properly incrementing the internal address pointer each time", function(){
			ppu.totalReset();
			cpu.totalReset();

			cpu.writeByte(0x2006, 0x12);
			ppu.tick(true);
			cpu.writeByte(0x2006, 0x34);
			ppu.tick(true);

			cpu.writeByte(0x2007, 0xAB);
			ppu.tick(true);

			expect(ppu.readByte(0x1234)).toEqual(0xAB);
			expect(ppu._mainMemory.ppuAddr).toEqual(0x1235);

			cpu.writeByte(0x2006, 0x00);
			ppu.tick(true);
			cpu.writeByte(0x2006, 0x00);
			ppu.tick(true);

			cpu.writeByte(0x2007, 0xBC);
			ppu.tick(true);

			expect(ppu.readByte(0x0000)).toEqual(0xBC);
		})

		it("blits to the corresponding name table when writing to $2007", function(){
			cpu.totalReset();
			ppu.totalReset();
			for(var i = 0; i < ppu._vbuffer.data.length; i++){
				ppu._vbuffer.data[i] = 0;
			}

			ppu.writeByte(0x3F00, 0x00);
			ppu.writeByte(0x3F01, 0x20);
			ppu.writeByte(0x3F02, 0x10);
			ppu.writeByte(0x3F03, 0x00);

			ppu.writeByte(0x2C00, 0xBC);

			ppu.writeByte(16, parseInt("11110000", 2));
			ppu.writeByte(24, parseInt("11001100", 2));

			ppu.nameTableBaseAddr = 0x2C00;

			cpu.writeByte(0x2006, 0x2C);
			ppu.tick(true);
			cpu.writeByte(0x2006, 0x00);
			ppu.tick(true);

			cpu.writeByte(0x2007, 0x1);
			ppu.tick(true);

			testFourBytes(ppu.nameTableWorkspaceD.data, 0, 0x75, 0xEF);
			testFourBytes(ppu.nameTableWorkspaceD.data, 4, 0x75, 0xEF);
			testFourBytes(ppu.nameTableWorkspaceD.data, 8, 0xFF, 0xEF);
			testFourBytes(ppu.nameTableWorkspaceD.data, 12, 0xFF, 0xEF);
			testFourBytes(ppu.nameTableWorkspaceD.data, 16, 0xBC, 0xEF);
			testFourBytes(ppu.nameTableWorkspaceD.data, 20, 0xBC, 0xEF);
		})

		it("responds to a write to OAMDATA ($2004)", function(){
			ppu.totalReset();
			cpu.totalReset();

			//Uses the address in $2003 (OAMADDR) for where to write in OAM
			cpu.writeByte(0x2003, 0xAB);
			cpu.writeByte(0x2004, 0xCD);
			ppu.tick(true);

			expect(ppu._OAM.readByte(0xAB)).toEqual(0xCD);
			//Should incremement OAMADDR by 1 after writing
			expect(cpu.readByte(0x2003)).toEqual(0xAC);
		})

		it("responds to a request for a DMA ($4014)", function(){
			ppu.totalReset();
			cpu.totalReset();

			for(var i = 0; i < 256; i++){
				cpu.writeByte(0x200 + i, 0xAB);
			}

			cpu.writeByte(0x4014, 2);
			ppu.tick(true);

			expect(cpu._regInterrupt).toEqual(4);
			expect(cpu.DMACounter).toEqual(0);
			expect(cpu.DMAAddress).toEqual(0x200);

			for(var i = 0; i < 512; i++){
				cpu.executeNext();
			}

			expect(cpu.DMACounter).toEqual(256);
			expect(cpu._regInterrupt).toEqual(0);

			for(var i = 0; i < 256; i++){
				expect(ppu._OAM.readByte(i)).toEqual(0xAB);
			}
		})
	})

	ppu.totalReset();
	cpu.totalReset();

	describe("executes the main rendering path by", function(){
		it("correctly rendering a scanline", function(){
			//Set up pattern & nametable
			for(var i = 0; i < ppu._vbuffer.data.length; i++){
				ppu._vbuffer.data[i] = 0;
			}

			ppu.writeByte(0x3F00, 0x00);
			ppu.writeByte(0x3F01, 0x20);
			ppu.writeByte(0x3F02, 0x10);
			ppu.writeByte(0x3F03, 0x00);

			cpu.writeByte(0x2000, 0);
			ppu.tick(true);
			ppu.writeByte(0x23C0, 0);

			ppu.writeByte(0, parseInt("11110000", 2));
			ppu.writeByte(8, parseInt("11001100", 2));

			ppu._OAM.writeByte(0, 255);
			ppu._OAM.writeByte(1, 0);
			ppu._OAM.writeByte(2, parseInt("00000000", 2));
			ppu._OAM.writeByte(3, 0);
			ppu.REGISTERS.spriteSizeIs8x8 = true;

			//blit nametable entry to internal NT buffer
			ppu.blitNameTableBackgroundEntry(0, 0, 0x2000, ppu.nameTableWorkspaceA.data);
		
			//blit sprite to internal sprite buffer
			ppu.blitSprite(0, ppu.IspriteRAM);

			ppu.pixelCounter = 0;
			ppu.scanlineCounter = 1;

			for(var i = 0; i < 342; i++){
				ppu.tick();
			}

			expect(ppu.pixelCounter).toEqual(0);
			expect(ppu.scanlineCounter).toEqual(2);


		})

		it("correctly selects a nametable pixel based on offsets and mirroring", function(){
			ppu.totalReset();
			cpu.totalReset();

			ppu.nameTableWorkspaceA.data[0] = 0xAB;
			ppu.nameTableWorkspaceB.data[0] = 0xCD;

			ppu.REGISTERS.fineXOffset = 255;
			ppu.REGISTERS.mirroringType = 1; //Vertical mirroring

			ppu.pixelCounter = 1;
			ppu.scanlineCounter = 1;

			var result = ppu.getPixelNT();

			expect(result.r).toEqual(0xCD);
		})
	})
})